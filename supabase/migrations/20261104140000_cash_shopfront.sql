-- Shopfront: a landmark and a photo of the shop, so a customer can recognise
-- the place they are walking to ("Next to the clinic", the green container).
--
-- Who may set them: only an admin (the person who visits the shop). A shop
-- cannot publish a picture or a sentence to customers by itself. Customers
-- only ever read them, through the same functions that already show them the
-- shop. Written to be safe to run twice.

ALTER TABLE public.cash_points
  ADD COLUMN IF NOT EXISTS landmark TEXT,
  ADD COLUMN IF NOT EXISTS photo_path TEXT;

ALTER TABLE public.cash_points DROP CONSTRAINT IF EXISTS cash_points_landmark_len;
ALTER TABLE public.cash_points ADD CONSTRAINT cash_points_landmark_len
  CHECK (landmark IS NULL OR length(landmark) <= 120);

-- A photo path is always "<business id>/<file name>", so a photo can only ever
-- sit in its own shop's folder.
ALTER TABLE public.cash_points DROP CONSTRAINT IF EXISTS cash_points_photo_path_shape;
ALTER TABLE public.cash_points ADD CONSTRAINT cash_points_photo_path_shape
  CHECK (photo_path IS NULL OR photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,80}$');

-- ---------------------------------------------------------------------------
-- Photo storage. Public to read (it is a picture of a shop front that anyone
-- walking past can see; file names cannot be guessed). Only admins may add,
-- replace or remove a photo. Size and type are capped at the bucket.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shopfronts', 'shopfronts', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins add shopfront photos" ON storage.objects;
CREATE POLICY "Admins add shopfront photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shopfronts' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins replace shopfront photos" ON storage.objects;
CREATE POLICY "Admins replace shopfront photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'shopfronts' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'shopfronts' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins remove shopfront photos" ON storage.objects;
CREATE POLICY "Admins remove shopfront photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'shopfronts' AND public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- The one way to set them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cash_set_shopfront(
  p_business UUID, p_landmark TEXT, p_photo_path TEXT
) RETURNS public.cash_points
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_landmark TEXT := NULLIF(trim(left(COALESCE(p_landmark, ''), 120)), '');
  cp public.cash_points;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_photo_path IS NOT NULL AND (
       p_photo_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,80}$'
       OR split_part(p_photo_path, '/', 1) <> p_business::text) THEN
    RAISE EXCEPTION 'invalid_photo';
  END IF;
  UPDATE public.cash_points
     SET landmark = v_landmark, photo_path = p_photo_path, updated_at = now()
   WHERE business_id = p_business
   RETURNING * INTO cp;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_enrolled'; END IF;
  PERFORM public.log_audit_event('cash.point.shopfront', 'cash_point', p_business::text,
    jsonb_build_object('has_photo', p_photo_path IS NOT NULL, 'has_landmark', v_landmark IS NOT NULL));
  RETURN cp;
END $$;

REVOKE ALL ON FUNCTION public.cash_set_shopfront(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_set_shopfront(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Customers see them in the list of nearby shops. The new columns go last so
-- the ORDER BY positions are unchanged.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cash_nearby(DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT, BOOLEAN);

CREATE FUNCTION public.cash_nearby(
  p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_amount_cents INT, p_rail TEXT, p_small BOOLEAN DEFAULT false
) RETURNS TABLE (
  business_id UUID, name TEXT, suburb TEXT, distance_m INT, walk_min INT, can_serve BOOLEAN,
  landmark TEXT, photo_path TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.check_rate_limit('cash_nearby', v_uid::text, 40, 60) THEN
    RAISE EXCEPTION 'Too many attempts. Please wait a few minutes and try again.';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid_location';
  END IF;
  -- Amounts above the customer's cap are refused outright: probing larger
  -- amounts would otherwise reveal how much cash a shop is holding.
  IF p_amount_cents < public.cash_cfg('cash_min_amount_cents', 5000)
     OR p_amount_cents > public.cash_customer_cap_cents(v_uid) OR p_amount_cents % 1000 <> 0 THEN
    RAISE EXCEPTION 'amount_not_allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cash_rails WHERE id = p_rail AND active) THEN
    RAISE EXCEPTION 'rail_unavailable';
  END IF;
  PERFORM public.cash_sweep();

  RETURN QUERY
  SELECT cp.business_id,
         COALESCE(b.trading_name, b.legal_name),
         b.suburb,
         public.cash_distance_m(p_lat, p_lng, cp.latitude, cp.longitude),
         greatest(1, ceil(public.cash_distance_m(p_lat, p_lng, cp.latitude, cp.longitude) / 80.0)::int),
         ((NOT p_small OR cp.small_notes)
           AND cp.cash_band_cents - public.cash_reserved_cents(cp.business_id) >= p_amount_cents),
         cp.landmark,
         cp.photo_path
  FROM public.cash_points cp
  JOIN public.operator_businesses b ON b.id = cp.business_id
  WHERE cp.enrolled AND cp.online AND cp.online_until > now() AND cp.paused_reason IS NULL
    AND cp.latitude IS NOT NULL AND cp.longitude IS NOT NULL
    AND b.application_status = 'approved'
    AND NOT public.is_business_member(v_uid, cp.business_id)
    AND public.cash_distance_m(p_lat, p_lng, cp.latitude, cp.longitude) <= public.cash_cfg('cash_search_radius_m', 6000)
  ORDER BY 6 DESC, 4 ASC
  LIMIT 20;
END $$;

REVOKE ALL ON FUNCTION public.cash_nearby(DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_nearby(DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- ...and on the screen they follow once the shop has said yes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cash_shape(r public.cash_requests, p_viewer TEXT) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  b RECORD;
  cp RECORD;
  v_first TEXT;
  v_code TEXT;
BEGIN
  SELECT COALESCE(trading_name, legal_name) AS name, suburb, street_address INTO b
    FROM public.operator_businesses WHERE id = r.business_id;
  SELECT latitude, longitude, landmark, photo_path INTO cp FROM public.cash_points WHERE business_id = r.business_id;
  SELECT split_part(COALESCE(full_name, ''), ' ', 1) INTO v_first FROM public.profiles WHERE id = r.customer_id;
  IF p_viewer = 'customer' AND r.status = 'held' THEN
    SELECT code INTO v_code FROM public.cash_request_secrets WHERE request_id = r.id;
  END IF;

  RETURN jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'amount_cents', r.amount_cents,
    'rail_id', r.rail_id,
    'small_notes', r.small_notes,
    'partner_fee_cents', r.partner_fee_cents,
    'cashnear_fee_cents', r.cashnear_fee_cents,
    'created_at', r.created_at,
    'accept_by', r.accept_by,
    'held_at', r.held_at,
    'expires_at', r.expires_at,
    'shop_completed_at', r.shop_completed_at,
    'completed_at', r.completed_at,
    'closed_reason', r.closed_reason,
    'shop', CASE WHEN p_viewer IN ('customer', 'admin') THEN jsonb_build_object(
        'business_id', r.business_id,
        'name', b.name,
        'suburb', b.suburb,
        'address', CASE WHEN r.status IN ('held', 'awaiting_confirmation', 'completed', 'disputed', 'needs_review') THEN b.street_address END,
        'landmark', cp.landmark,
        'photo_path', cp.photo_path,
        'lat', CASE WHEN r.status = 'held' THEN cp.latitude END,
        'lng', CASE WHEN r.status = 'held' THEN cp.longitude END
      ) END,
    'customer', CASE WHEN p_viewer IN ('shop', 'admin') THEN jsonb_build_object(
        'first_name', NULLIF(v_first, ''),
        'distance_m', r.distance_m
      ) END,
    'handshake', CASE
        WHEN p_viewer = 'admin' THEN r.handshake
        WHEN p_viewer = 'shop' AND r.status = 'held' THEN r.handshake
        WHEN p_viewer = 'customer' AND r.status IN ('held', 'awaiting_confirmation') THEN r.handshake
      END,
    'code', v_code,
    'reference_masked', CASE WHEN r.shop_reference IS NOT NULL AND p_viewer IN ('customer', 'admin')
        THEN '••••' || right(r.shop_reference, 4) END,
    'code_locked_until', CASE WHEN p_viewer = 'shop' THEN r.code_locked_until END
  );
END $$;

REVOKE ALL ON FUNCTION public.cash_shape(public.cash_requests, TEXT) FROM PUBLIC, anon, authenticated;
