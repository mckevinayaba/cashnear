-- CashNear cash hold engine (pilot).
--
-- A customer asks for cash on a licensed partner rail; an enrolled, verified
-- shop confirms within seconds and keeps the cash aside; the customer collects
-- on the shop's own licensed device. CashNear never touches the cash-out money.
--
-- Dark by default: nothing is bookable until (a) a super_admin activates a
-- rail and (b) ops enrol an approved shop with coordinates. Deploying this
-- migration changes no live behaviour on its own.
--
-- Design rules:
--   * Clients never read or write the request tables directly. Every read and
--     write goes through a SECURITY DEFINER function that derives who the
--     caller is from auth.uid(), never from an argument.
--   * One transition function. It locks the row, checks the actor and the
--     allowed transition, writes the new state and an audit row together.
--   * A wrong code returns a result instead of raising, because a raised
--     exception would roll back the attempt counter that limits guessing.
--   * The completion code lives in its own table that no client role can
--     read, and is deleted as soon as the request leaves its active states.
--   * Customer coordinates are never stored; only a rounded distance is.

CREATE TYPE public.cash_request_status AS ENUM (
  'awaiting_shop', 'held', 'awaiting_confirmation', 'completed',
  'declined', 'expired', 'cancelled', 'disputed', 'needs_review'
);

-- ---------------------------------------------------------------------------
-- Pilot rules live in the existing pilot_configuration table.
-- ---------------------------------------------------------------------------
INSERT INTO public.pilot_configuration (key, value, description) VALUES
  ('cash_min_amount_cents',   to_jsonb(5000),  'Cash hold: smallest amount, in cents (R50).'),
  ('cash_starter_cap_cents',  to_jsonb(20000), 'Cash hold: cap for customers with fewer than two completed holds (R200).'),
  ('cash_max_amount_cents',   to_jsonb(50000), 'Cash hold: pilot cap per hold, in cents (R500).'),
  ('cash_hold_minutes',       to_jsonb(15),    'Cash hold: how long a shop keeps cash aside once it accepts.'),
  ('cash_accept_seconds',     to_jsonb(90),    'Cash hold: how long a shop has to accept a request.'),
  ('cash_review_minutes',     to_jsonb(120),   'Cash hold: unconfirmed completions become a review case after this long.'),
  ('cash_search_radius_m',    to_jsonb(6000),  'Cash hold: how far from the customer shops are shown.')
ON CONFLICT (key) DO NOTHING;

CREATE FUNCTION public.cash_cfg(p_key TEXT, p_default INT)
RETURNS INT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.pilot_configuration WHERE key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------------
-- Rails and fees (data-driven: change prices without changing code).
-- ---------------------------------------------------------------------------
CREATE TABLE public.cash_rails (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  fee_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_fee_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rail_id TEXT NOT NULL REFERENCES public.cash_rails(id),
  min_cents INT NOT NULL CHECK (min_cents >= 0),
  max_cents INT NOT NULL,
  partner_fee_cents INT NOT NULL CHECK (partner_fee_cents >= 0),
  cashnear_fee_cents INT NOT NULL DEFAULT 0 CHECK (cashnear_fee_cents >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (min_cents <= max_cents)
);

-- Example values only. fee_verified stays false until a provider confirms
-- the real schedule, and the app labels the fee "example" while it is false.
INSERT INTO public.cash_rails (id, label, active, fee_verified)
VALUES ('gotyme_flash', 'GoTyme via Flash', false, false);
INSERT INTO public.cash_fee_schedule (rail_id, min_cents, max_cents, partner_fee_cents, cashnear_fee_cents)
VALUES ('gotyme_flash', 5000, 300000, 700, 0);

-- ---------------------------------------------------------------------------
-- Cash points: an approved shop's pilot enrolment and live availability.
-- ---------------------------------------------------------------------------
CREATE TABLE public.cash_points (
  business_id UUID PRIMARY KEY REFERENCES public.operator_businesses(id) ON DELETE CASCADE,
  enrolled BOOLEAN NOT NULL DEFAULT false,
  latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  area TEXT,
  online BOOLEAN NOT NULL DEFAULT false,
  online_until TIMESTAMPTZ,
  cash_band_cents INT NOT NULL DEFAULT 20000 CHECK (cash_band_cents BETWEEN 10000 AND 300000 AND cash_band_cents % 10000 = 0),
  small_notes BOOLEAN NOT NULL DEFAULT false,
  missed_count INT NOT NULL DEFAULT 0,
  trust_score INT NOT NULL DEFAULT 80 CHECK (trust_score BETWEEN 0 AND 100),
  paused_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Requests, secrets, incidents.
-- ---------------------------------------------------------------------------
CREATE TABLE public.cash_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.operator_businesses(id),
  amount_cents INT NOT NULL CHECK (amount_cents BETWEEN 5000 AND 300000 AND amount_cents % 1000 = 0),
  rail_id TEXT NOT NULL REFERENCES public.cash_rails(id),
  small_notes BOOLEAN NOT NULL DEFAULT false,
  status public.cash_request_status NOT NULL DEFAULT 'awaiting_shop',
  handshake TEXT NOT NULL,
  partner_fee_cents INT NOT NULL,
  cashnear_fee_cents INT NOT NULL DEFAULT 0,
  distance_m INT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accept_by TIMESTAMPTZ NOT NULL,
  held_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  shop_completed_at TIMESTAMPTZ,
  shop_reference TEXT,
  completed_at TIMESTAMPTZ,
  closed_reason TEXT,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  code_attempts INT NOT NULL DEFAULT 0,
  code_locked_until TIMESTAMPTZ,
  UNIQUE (customer_id, idempotency_key)
);
CREATE UNIQUE INDEX cash_one_active_request_per_customer
  ON public.cash_requests (customer_id) WHERE status IN ('awaiting_shop', 'held');
CREATE INDEX cash_requests_business_active
  ON public.cash_requests (business_id) WHERE status IN ('awaiting_shop', 'held');
CREATE INDEX cash_requests_status_deadlines ON public.cash_requests (status, accept_by, expires_at);
CREATE INDEX cash_requests_customer_recent ON public.cash_requests (customer_id, created_at DESC);

CREATE TABLE public.cash_request_secrets (
  request_id UUID PRIMARY KEY REFERENCES public.cash_requests(id) ON DELETE CASCADE,
  code TEXT NOT NULL
);

CREATE TABLE public.cash_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.cash_requests(id),
  business_id UUID NOT NULL REFERENCES public.operator_businesses(id),
  reporter_id UUID REFERENCES auth.users(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'paid_no_cash', 'shop_closed', 'fee_changed', 'wrong_amount', 'threat', 'other', 'unconfirmed_completion'
  )),
  details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 500),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  sla_due TIMESTAMPTZ NOT NULL,
  resolution TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cash_incidents_open ON public.cash_incidents (status, sla_due);

-- The secret is useless once a request leaves its active states.
CREATE FUNCTION public.cash_drop_secret() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status NOT IN ('awaiting_shop', 'held') THEN
    DELETE FROM public.cash_request_secrets WHERE request_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cash_requests_drop_secret AFTER UPDATE OF status ON public.cash_requests
  FOR EACH ROW EXECUTE FUNCTION public.cash_drop_secret();

-- ---------------------------------------------------------------------------
-- Table privileges and row-level security.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.cash_rails, public.cash_fee_schedule, public.cash_points, public.cash_requests,
  public.cash_request_secrets, public.cash_incidents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cash_rails, public.cash_fee_schedule, public.cash_points, public.cash_requests,
  public.cash_incidents TO authenticated;
GRANT ALL ON public.cash_rails, public.cash_fee_schedule, public.cash_points, public.cash_requests,
  public.cash_request_secrets, public.cash_incidents TO service_role;

ALTER TABLE public.cash_rails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_fee_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_request_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read rails" ON public.cash_rails FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users read fees" ON public.cash_fee_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "Shop members and admins read cash point" ON public.cash_points FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id) OR public.is_admin(auth.uid()));
-- Customers and shops use the shaped functions below; only admins read raw rows.
CREATE POLICY "Admins read cash requests" ON public.cash_requests FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins read cash incidents" ON public.cash_incidents FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
-- cash_request_secrets: RLS on, no policy, no grant: unreachable by clients.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cash_distance_m(a_lat DOUBLE PRECISION, a_lng DOUBLE PRECISION, b_lat DOUBLE PRECISION, b_lng DOUBLE PRECISION)
RETURNS INT LANGUAGE SQL IMMUTABLE AS $$
  SELECT round(2 * 6371000 * asin(sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)
  )))::int
$$;

-- Customers start at a low cap that rises after two clean completions, so
-- trust is earned by behaviour, not by documents.
CREATE FUNCTION public.cash_customer_cap_cents(p_user UUID) RETURNS INT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN (SELECT count(*) FROM public.cash_requests WHERE customer_id = p_user AND status = 'completed') >= 2
      THEN public.cash_cfg('cash_max_amount_cents', 50000)
    ELSE least(public.cash_cfg('cash_starter_cap_cents', 20000), public.cash_cfg('cash_max_amount_cents', 50000))
  END
$$;

-- Cash already promised at a shop. Time-based, so a request that has timed
-- out stops counting immediately, even before the sweep marks it expired.
CREATE FUNCTION public.cash_reserved_cents(p_business UUID) RETURNS INT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(sum(amount_cents), 0)::int FROM public.cash_requests
  WHERE business_id = p_business
    AND ((status = 'awaiting_shop' AND accept_by > now()) OR (status = 'held' AND expires_at > now()))
$$;

CREATE FUNCTION public.cash_shape(r public.cash_requests, p_viewer TEXT) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  b RECORD;
  cp RECORD;
  v_first TEXT;
  v_code TEXT;
BEGIN
  SELECT COALESCE(trading_name, legal_name) AS name, suburb, street_address INTO b
    FROM public.operator_businesses WHERE id = r.business_id;
  SELECT latitude, longitude INTO cp FROM public.cash_points WHERE business_id = r.business_id;
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

-- Expiry, missed-request auto-pause, and unconfirmed-completion review. Called
-- lazily by every client-facing function (and safe to schedule as well).
-- Rows another transaction is working on are skipped, never waited on.
CREATE FUNCTION public.cash_sweep() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, business_id FROM public.cash_requests
           WHERE status = 'awaiting_shop' AND accept_by < now() FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.cash_requests SET status = 'expired', closed_reason = 'shop_no_response' WHERE id = r.id;
    UPDATE public.cash_points SET
      missed_count = missed_count + 1,
      trust_score = greatest(0, trust_score - 5),
      online = CASE WHEN missed_count + 1 >= 3 THEN false ELSE online END,
      paused_reason = CASE WHEN missed_count + 1 >= 3 THEN 'missed_requests' ELSE paused_reason END,
      updated_at = now()
    WHERE business_id = r.business_id;
    INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
    VALUES ('cash.request.expired', 'cash_request', r.id::text, jsonb_build_object('reason', 'shop_no_response'));
  END LOOP;

  FOR r IN SELECT id FROM public.cash_requests
           WHERE status = 'held' AND expires_at < now() FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.cash_requests SET status = 'expired', closed_reason = 'hold_window_passed' WHERE id = r.id;
    INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
    VALUES ('cash.request.expired', 'cash_request', r.id::text, jsonb_build_object('reason', 'hold_window_passed'));
  END LOOP;

  FOR r IN SELECT id, business_id FROM public.cash_requests
           WHERE status = 'awaiting_confirmation'
             AND shop_completed_at < now() - make_interval(mins => public.cash_cfg('cash_review_minutes', 120))
           FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.cash_requests SET status = 'needs_review', closed_reason = 'customer_did_not_confirm' WHERE id = r.id;
    INSERT INTO public.cash_incidents (request_id, business_id, kind, details, severity, sla_due)
    VALUES (r.id, r.business_id, 'unconfirmed_completion', 'The shop marked this complete but the customer did not confirm.', 'low', now() + interval '24 hours');
    INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
    VALUES ('cash.request.needs_review', 'cash_request', r.id::text, jsonb_build_object('reason', 'customer_did_not_confirm'));
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Customer functions.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cash_quote(p_amount_cents INT, p_rail TEXT) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rail public.cash_rails;
  v_fee public.cash_fee_schedule;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_rail FROM public.cash_rails WHERE id = p_rail AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'rail_unavailable'; END IF;
  SELECT * INTO v_fee FROM public.cash_fee_schedule
    WHERE rail_id = p_rail AND p_amount_cents BETWEEN min_cents AND max_cents AND effective_from <= now()
    ORDER BY effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'amount_not_supported'; END IF;
  RETURN jsonb_build_object(
    'rail_id', v_rail.id,
    'rail_label', v_rail.label,
    'fee_verified', v_rail.fee_verified,
    'amount_cents', p_amount_cents,
    'partner_fee_cents', v_fee.partner_fee_cents,
    'cashnear_fee_cents', v_fee.cashnear_fee_cents,
    'total_fee_cents', v_fee.partner_fee_cents + v_fee.cashnear_fee_cents,
    'min_cents', public.cash_cfg('cash_min_amount_cents', 5000),
    'max_cents', public.cash_customer_cap_cents(v_uid)
  );
END $$;

CREATE FUNCTION public.cash_nearby(
  p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_amount_cents INT, p_rail TEXT, p_small BOOLEAN DEFAULT false
) RETURNS TABLE (business_id UUID, name TEXT, suburb TEXT, distance_m INT, walk_min INT, can_serve BOOLEAN)
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
           AND cp.cash_band_cents - public.cash_reserved_cents(cp.business_id) >= p_amount_cents)
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

CREATE FUNCTION public.cash_create_request(
  p_business UUID, p_amount_cents INT, p_rail TEXT, p_small BOOLEAN, p_idem TEXT, p_distance_m INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing public.cash_requests;
  v_cp public.cash_points;
  v_fee public.cash_fee_schedule;
  v_id UUID;
  v_code TEXT;
  v_hand TEXT;
  v_adj TEXT[] := ARRAY['Amber','Coral','Cedar','Copper','Denim','Ember','Forest','Gold','Hazel','Indigo','Ivory','Jade',
                        'Lemon','Maple','Olive','Pearl','Plum','Ruby','Sand','Silver','Slate','Sunny','Teal','Violet',
                        'Bronze','Cherry','Cocoa','Dusty','Honey','Linen','Mango','Mint'];
  v_noun TEXT[] := ARRAY['River','Mountain','Garden','Bridge','Harbour','Meadow','Island','Valley','Lantern','Anchor','Basket','Candle',
                         'Drum','Feather','Kettle','Ladder','Needle','Orchard','Pebble','Quilt','Rocket','Spoon','Tower','Window',
                         'Acorn','Bucket','Compass','Ribbon','Saddle','Thimble','Wagon','Yarn'];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF p_idem IS NULL OR length(p_idem) NOT BETWEEN 8 AND 64 THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;
  IF NOT public.check_rate_limit('cash_create', v_uid::text, 6, 600) THEN
    RAISE EXCEPTION 'Too many attempts. Please wait a few minutes and try again.';
  END IF;
  PERFORM public.cash_sweep();

  SELECT * INTO v_existing FROM public.cash_requests WHERE customer_id = v_uid AND idempotency_key = p_idem;
  IF FOUND THEN RETURN jsonb_build_object('id', v_existing.id, 'replayed', true); END IF;

  IF p_amount_cents < public.cash_cfg('cash_min_amount_cents', 5000)
     OR p_amount_cents > public.cash_customer_cap_cents(v_uid) OR p_amount_cents % 1000 <> 0 THEN
    RAISE EXCEPTION 'amount_not_allowed';
  END IF;
  -- Three held-then-abandoned requests in a week pause new requests for a while.
  IF (SELECT count(*) FROM public.cash_requests
       WHERE customer_id = v_uid AND closed_reason = 'hold_window_passed' AND created_at > now() - interval '7 days') >= 3 THEN
    RAISE EXCEPTION 'paused_no_shows';
  END IF;
  IF public.is_business_member(v_uid, p_business) THEN RAISE EXCEPTION 'own_shop'; END IF;

  SELECT f.* INTO v_fee FROM public.cash_fee_schedule f
    JOIN public.cash_rails r ON r.id = f.rail_id AND r.active
    WHERE f.rail_id = p_rail AND p_amount_cents BETWEEN f.min_cents AND f.max_cents AND f.effective_from <= now()
    ORDER BY f.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'rail_unavailable'; END IF;

  -- Serialise reservations per shop.
  SELECT cp.* INTO v_cp FROM public.cash_points cp
    JOIN public.operator_businesses b ON b.id = cp.business_id AND b.application_status = 'approved'
    WHERE cp.business_id = p_business FOR UPDATE OF cp;
  IF NOT FOUND OR NOT v_cp.enrolled OR NOT v_cp.online OR v_cp.online_until IS NULL OR v_cp.online_until <= now()
     OR v_cp.paused_reason IS NOT NULL THEN
    RAISE EXCEPTION 'shop_unavailable';
  END IF;
  IF p_small AND NOT v_cp.small_notes THEN RAISE EXCEPTION 'shop_cannot_serve'; END IF;
  IF v_cp.cash_band_cents - public.cash_reserved_cents(p_business) < p_amount_cents THEN
    RAISE EXCEPTION 'shop_cannot_serve';
  END IF;

  v_code := lpad((abs(('x' || encode(substring(uuid_send(gen_random_uuid()) FROM 1 FOR 4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  v_hand := v_adj[1 + get_byte(uuid_send(gen_random_uuid()), 0) % 32] || ' · ' || v_noun[1 + get_byte(uuid_send(gen_random_uuid()), 0) % 32];

  BEGIN
    INSERT INTO public.cash_requests (
      customer_id, business_id, amount_cents, rail_id, small_notes, handshake,
      partner_fee_cents, cashnear_fee_cents, distance_m, idempotency_key, accept_by
    ) VALUES (
      v_uid, p_business, p_amount_cents, p_rail, COALESCE(p_small, false), v_hand,
      v_fee.partner_fee_cents, v_fee.cashnear_fee_cents,
      CASE WHEN p_distance_m IS NULL THEN NULL ELSE least(20000, greatest(0, round(p_distance_m / 100.0)::int * 100)) END,
      p_idem, now() + make_interval(secs => public.cash_cfg('cash_accept_seconds', 90))
    ) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.cash_requests WHERE customer_id = v_uid AND idempotency_key = p_idem;
    IF FOUND THEN RETURN jsonb_build_object('id', v_existing.id, 'replayed', true); END IF;
    RAISE EXCEPTION 'already_active';
  END;

  INSERT INTO public.cash_request_secrets (request_id, code) VALUES (v_id, v_code);
  PERFORM public.log_audit_event('cash.request.created', 'cash_request', v_id::text,
    jsonb_build_object('amount_cents', p_amount_cents, 'rail', p_rail));
  RETURN jsonb_build_object('id', v_id, 'replayed', false);
END $$;

CREATE FUNCTION public.cash_get_request(p_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  r public.cash_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM public.cash_sweep();
  SELECT * INTO r FROM public.cash_requests WHERE id = p_id;
  -- One message for "missing" and "not yours": ids are not enumerable.
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.customer_id = v_uid THEN RETURN public.cash_shape(r, 'customer');
  ELSIF public.is_business_member(v_uid, r.business_id) THEN RETURN public.cash_shape(r, 'shop');
  ELSIF public.is_admin(v_uid) THEN RETURN public.cash_shape(r, 'admin');
  END IF;
  RAISE EXCEPTION 'not_found';
END $$;

CREATE FUNCTION public.cash_my_active() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  r public.cash_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM public.cash_sweep();
  SELECT * INTO r FROM public.cash_requests
    WHERE customer_id = v_uid AND status IN ('awaiting_shop', 'held', 'awaiting_confirmation')
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public.cash_shape(r, 'customer');
END $$;

-- ---------------------------------------------------------------------------
-- Shop functions.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cash_shop_state(p_business UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  cp public.cash_points;
  v_requests JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_business_member(v_uid, p_business) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.cash_sweep();
  SELECT * INTO cp FROM public.cash_points WHERE business_id = p_business;

  SELECT COALESCE(jsonb_agg(public.cash_shape(q, 'shop') ORDER BY q.created_at DESC), '[]'::jsonb) INTO v_requests
  FROM (
    SELECT * FROM public.cash_requests
    WHERE business_id = p_business
      AND (status IN ('awaiting_shop', 'held', 'awaiting_confirmation') OR created_at > now() - interval '24 hours')
    ORDER BY created_at DESC LIMIT 30
  ) q;

  RETURN jsonb_build_object(
    'enrolled', COALESCE(cp.enrolled, false),
    'online', COALESCE(cp.online AND cp.online_until > now(), false),
    'online_until', cp.online_until,
    'cash_band_cents', cp.cash_band_cents,
    'small_notes', cp.small_notes,
    'paused_reason', cp.paused_reason,
    'max_band_cents', public.cash_cfg('cash_max_amount_cents', 50000),
    'requests', v_requests
  );
END $$;

CREATE FUNCTION public.cash_set_availability(p_business UUID, p_minutes INT, p_band_cents INT, p_small BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  cp public.cash_points;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_business_member(v_uid, p_business) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT cp2.* INTO cp FROM public.cash_points cp2
    JOIN public.operator_businesses b ON b.id = cp2.business_id AND b.application_status = 'approved'
    WHERE cp2.business_id = p_business FOR UPDATE OF cp2;
  IF NOT FOUND OR NOT cp.enrolled THEN RAISE EXCEPTION 'not_enrolled'; END IF;

  IF p_band_cents IS NOT NULL THEN
    IF p_band_cents NOT BETWEEN 10000 AND public.cash_cfg('cash_max_amount_cents', 50000) OR p_band_cents % 10000 <> 0 THEN
      RAISE EXCEPTION 'invalid_band';
    END IF;
  END IF;
  IF p_minutes IS NOT NULL AND p_minutes <> 0 AND p_minutes NOT BETWEEN 15 AND 480 THEN
    RAISE EXCEPTION 'invalid_duration';
  END IF;
  IF p_minutes IS NOT NULL AND p_minutes > 0 AND cp.paused_reason = 'dispute_review' THEN
    RAISE EXCEPTION 'paused_for_review';
  END IF;

  UPDATE public.cash_points SET
    cash_band_cents = COALESCE(p_band_cents, cash_band_cents),
    small_notes = COALESCE(p_small, small_notes),
    online = CASE WHEN p_minutes IS NULL THEN online WHEN p_minutes = 0 THEN false ELSE true END,
    online_until = CASE WHEN p_minutes IS NULL THEN online_until WHEN p_minutes = 0 THEN NULL
                        ELSE now() + make_interval(mins => p_minutes) END,
    -- Going online again is how a shop clears an automatic missed-request pause.
    missed_count = CASE WHEN p_minutes > 0 THEN 0 ELSE missed_count END,
    paused_reason = CASE WHEN p_minutes > 0 AND paused_reason = 'missed_requests' THEN NULL ELSE paused_reason END,
    updated_at = now()
  WHERE business_id = p_business;

  PERFORM public.log_audit_event('cash.point.availability', 'cash_point', p_business::text,
    jsonb_build_object('minutes', p_minutes, 'band_cents', p_band_cents, 'small_notes', p_small));
  RETURN public.cash_shop_state(p_business);
END $$;

-- ---------------------------------------------------------------------------
-- The only way a request changes state.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cash_transition(p_id UUID, p_action TEXT, p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  r public.cash_requests;
  v_is_customer BOOLEAN;
  v_is_shop BOOLEAN;
  v_cp public.cash_points;
  v_code TEXT;
  v_ref TEXT;
  v_kind TEXT;
  v_details TEXT;
  v_severity TEXT;
  v_left INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM public.cash_sweep();

  SELECT * INTO r FROM public.cash_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_is_customer := r.customer_id = v_uid;
  v_is_shop := public.is_business_member(v_uid, r.business_id);
  IF NOT v_is_customer AND NOT v_is_shop THEN RAISE EXCEPTION 'not_found'; END IF;

  CASE p_action
    WHEN 'accept' THEN
      IF NOT v_is_shop THEN RAISE EXCEPTION 'forbidden'; END IF;
      IF r.status <> 'awaiting_shop' OR r.accept_by < now() THEN RAISE EXCEPTION 'invalid_state'; END IF;
      SELECT * INTO v_cp FROM public.cash_points WHERE business_id = r.business_id;
      IF v_cp.paused_reason IS NOT NULL THEN RAISE EXCEPTION 'shop_paused'; END IF;
      UPDATE public.cash_requests SET status = 'held', held_at = now(),
        expires_at = now() + make_interval(mins => public.cash_cfg('cash_hold_minutes', 15))
        WHERE id = r.id RETURNING * INTO r;
      UPDATE public.cash_points SET missed_count = 0, updated_at = now() WHERE business_id = r.business_id;

    WHEN 'decline' THEN
      IF NOT v_is_shop THEN RAISE EXCEPTION 'forbidden'; END IF;
      IF r.status <> 'awaiting_shop' THEN RAISE EXCEPTION 'invalid_state'; END IF;
      v_kind := COALESCE(p_payload->>'reason', 'other');
      IF v_kind NOT IN ('no_cash', 'closed', 'other') THEN v_kind := 'other'; END IF;
      UPDATE public.cash_requests SET status = 'declined', closed_reason = 'shop_declined_' || v_kind
        WHERE id = r.id RETURNING * INTO r;

    WHEN 'cancel' THEN
      IF NOT v_is_customer THEN RAISE EXCEPTION 'forbidden'; END IF;
      IF r.status NOT IN ('awaiting_shop', 'held') THEN RAISE EXCEPTION 'invalid_state'; END IF;
      UPDATE public.cash_requests SET status = 'cancelled', closed_reason = 'customer_cancelled'
        WHERE id = r.id RETURNING * INTO r;

    WHEN 'shop_complete' THEN
      IF NOT v_is_shop THEN RAISE EXCEPTION 'forbidden'; END IF;
      IF r.status <> 'held' OR r.expires_at < now() THEN RAISE EXCEPTION 'invalid_state'; END IF;
      v_ref := upper(regexp_replace(COALESCE(p_payload->>'reference', ''), '\s', '', 'g'));
      IF v_ref !~ '^[A-Z0-9-]{4,24}$' THEN RAISE EXCEPTION 'invalid_reference'; END IF;
      IF r.code_locked_until IS NOT NULL AND r.code_locked_until > now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', r.code_locked_until);
      END IF;
      IF NOT public.check_rate_limit('cash_code_try_shop', r.business_id::text, 30, 600) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'too_many_attempts');
      END IF;
      SELECT code INTO v_code FROM public.cash_request_secrets WHERE request_id = r.id;
      IF v_code IS NULL OR regexp_replace(COALESCE(p_payload->>'code', ''), '\s', '', 'g') <> v_code THEN
        -- Return, never raise: raising would roll back the attempt counter.
        UPDATE public.cash_requests SET
          code_attempts = code_attempts + 1,
          code_locked_until = CASE WHEN code_attempts + 1 >= 5 THEN now() + interval '10 minutes' END
        WHERE id = r.id RETURNING * INTO r;
        v_left := greatest(0, 5 - r.code_attempts);
        IF r.code_locked_until IS NOT NULL THEN
          UPDATE public.cash_requests SET code_attempts = 0 WHERE id = r.id;
          v_left := 0;
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'code_mismatch', 'attempts_left', v_left,
                                  'locked_until', r.code_locked_until);
      END IF;
      UPDATE public.cash_requests SET status = 'awaiting_confirmation', shop_completed_at = now(),
        shop_reference = v_ref, code_attempts = 0, code_locked_until = NULL
        WHERE id = r.id RETURNING * INTO r;

    WHEN 'confirm' THEN
      IF NOT v_is_customer THEN RAISE EXCEPTION 'forbidden'; END IF;
      IF r.status NOT IN ('awaiting_confirmation', 'needs_review') THEN RAISE EXCEPTION 'invalid_state'; END IF;
      UPDATE public.cash_requests SET status = 'completed', completed_at = now(),
        rating = CASE WHEN (p_payload->>'stars') ~ '^[1-5]$' THEN (p_payload->>'stars')::smallint END
        WHERE id = r.id RETURNING * INTO r;
      UPDATE public.cash_points SET trust_score = least(100, trust_score + 1), updated_at = now()
        WHERE business_id = r.business_id;

    WHEN 'dispute' THEN
      IF NOT v_is_customer THEN RAISE EXCEPTION 'forbidden'; END IF;
      IF r.status NOT IN ('held', 'awaiting_confirmation', 'needs_review')
         AND NOT (r.status = 'completed' AND r.completed_at > now() - interval '24 hours') THEN
        RAISE EXCEPTION 'invalid_state';
      END IF;
      IF NOT public.check_rate_limit('cash_dispute', v_uid::text, 5, 86400) THEN
        RAISE EXCEPTION 'Too many attempts. Please wait a few minutes and try again.';
      END IF;
      v_kind := COALESCE(p_payload->>'kind', 'other');
      IF v_kind NOT IN ('paid_no_cash', 'shop_closed', 'fee_changed', 'wrong_amount', 'threat', 'other') THEN
        v_kind := 'other';
      END IF;
      v_details := left(COALESCE(p_payload->>'details', ''), 500);
      v_severity := CASE WHEN v_kind IN ('paid_no_cash', 'threat') THEN 'high' WHEN v_kind = 'fee_changed' THEN 'medium' ELSE 'low' END;
      UPDATE public.cash_requests SET status = 'disputed', closed_reason = 'dispute_' || v_kind
        WHERE id = r.id RETURNING * INTO r;
      INSERT INTO public.cash_incidents (request_id, business_id, reporter_id, kind, details, severity, sla_due)
      VALUES (r.id, r.business_id, v_uid, v_kind, v_details, v_severity,
              now() + CASE WHEN v_severity = 'high' THEN interval '2 hours' ELSE interval '24 hours' END);
      -- A claim pauses the shop for review. It does not suspend it: one
      -- unverified claim must not be able to take a business offline for good.
      IF v_severity = 'high' THEN
        UPDATE public.cash_points SET online = false, online_until = NULL, paused_reason = 'dispute_review', updated_at = now()
          WHERE business_id = r.business_id;
      END IF;

    ELSE
      RAISE EXCEPTION 'unknown_action';
  END CASE;

  PERFORM public.log_audit_event('cash.request.' || p_action, 'cash_request', r.id::text,
    jsonb_build_object('status', r.status));
  RETURN jsonb_build_object('ok', true, 'status', r.status);
END $$;

-- ---------------------------------------------------------------------------
-- Operations functions (admins only).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.cash_enrol_point(
  p_business UUID, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_area TEXT, p_enrolled BOOLEAN
) RETURNS public.cash_points LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  cp public.cash_points;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operator_businesses WHERE id = p_business AND application_status = 'approved') THEN
    RAISE EXCEPTION 'business_not_approved';
  END IF;
  IF p_enrolled AND (p_lat IS NULL OR p_lng IS NULL) THEN RAISE EXCEPTION 'location_required'; END IF;
  INSERT INTO public.cash_points (business_id, enrolled, latitude, longitude, area)
  VALUES (p_business, p_enrolled, p_lat, p_lng, left(p_area, 80))
  ON CONFLICT (business_id) DO UPDATE SET
    enrolled = EXCLUDED.enrolled, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
    area = EXCLUDED.area, online = CASE WHEN EXCLUDED.enrolled THEN public.cash_points.online ELSE false END,
    updated_at = now()
  RETURNING * INTO cp;
  PERFORM public.log_audit_event('cash.point.enrolled', 'cash_point', p_business::text,
    jsonb_build_object('enrolled', p_enrolled, 'area', p_area));
  RETURN cp;
END $$;

CREATE FUNCTION public.cash_clear_pause(p_business UUID, p_note TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(trim(COALESCE(p_note, ''))) < 10 THEN RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE public.cash_points SET paused_reason = NULL, missed_count = 0, updated_at = now() WHERE business_id = p_business;
  PERFORM public.log_audit_event('cash.point.pause_cleared', 'cash_point', p_business::text, jsonb_build_object('note', p_note));
END $$;

CREATE FUNCTION public.cash_resolve_incident(p_incident UUID, p_resolution TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(trim(COALESCE(p_resolution, ''))) < 10 THEN RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE public.cash_incidents SET status = 'resolved', resolution = left(p_resolution, 500),
    resolved_by = auth.uid(), resolved_at = now()
    WHERE id = p_incident AND status <> 'resolved';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.log_audit_event('cash.incident.resolved', 'cash_incident', p_incident::text, jsonb_build_object('resolution', p_resolution));
END $$;

CREATE FUNCTION public.cash_set_rail_active(p_rail TEXT, p_active BOOLEAN, p_fee_verified BOOLEAN DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.cash_rails SET active = p_active, fee_verified = COALESCE(p_fee_verified, fee_verified) WHERE id = p_rail;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.log_audit_event('cash.rail.updated', 'cash_rail', p_rail,
    jsonb_build_object('active', p_active, 'fee_verified', p_fee_verified));
END $$;

-- ---------------------------------------------------------------------------
-- Function privileges: closed by default, opened one function at a time.
-- Supabase grants new functions to its API roles, and Postgres grants them to
-- PUBLIC, so both must be revoked explicitly.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.cash_cfg(TEXT, INT),
  public.cash_distance_m(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION),
  public.cash_customer_cap_cents(UUID),
  public.cash_reserved_cents(UUID),
  public.cash_shape(public.cash_requests, TEXT),
  public.cash_sweep(),
  public.cash_drop_secret()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_sweep() TO service_role;

REVOKE ALL ON FUNCTION
  public.cash_quote(INT, TEXT),
  public.cash_nearby(DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT, BOOLEAN),
  public.cash_create_request(UUID, INT, TEXT, BOOLEAN, TEXT, INT),
  public.cash_get_request(UUID),
  public.cash_my_active(),
  public.cash_shop_state(UUID),
  public.cash_set_availability(UUID, INT, INT, BOOLEAN),
  public.cash_transition(UUID, TEXT, JSONB),
  public.cash_enrol_point(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, BOOLEAN),
  public.cash_clear_pause(UUID, TEXT),
  public.cash_resolve_incident(UUID, TEXT),
  public.cash_set_rail_active(TEXT, BOOLEAN, BOOLEAN)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.cash_quote(INT, TEXT),
  public.cash_nearby(DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT, BOOLEAN),
  public.cash_create_request(UUID, INT, TEXT, BOOLEAN, TEXT, INT),
  public.cash_get_request(UUID),
  public.cash_my_active(),
  public.cash_shop_state(UUID),
  public.cash_set_availability(UUID, INT, INT, BOOLEAN),
  public.cash_transition(UUID, TEXT, JSONB),
  public.cash_enrol_point(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, BOOLEAN),
  public.cash_clear_pause(UUID, TEXT),
  public.cash_resolve_incident(UUID, TEXT),
  public.cash_set_rail_active(TEXT, BOOLEAN, BOOLEAN)
TO authenticated;
