-- Management views for CashNear's own team: the weekly numbers, every
-- transaction, and how each shop is doing.
--
-- Admin only (ops_admin or super_admin). Nothing here is reachable by a
-- customer or a shop, and nothing here returns a completion code or the two
-- words. Exporting the ledger is written to the audit log. Safe to run twice.

-- ---------------------------------------------------------------------------
-- The numbers: what happened in the last N days, plus the weekly north-star
-- (collections the customer confirmed) with the week before for comparison.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cash_admin_summary(p_days INT DEFAULT 7) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_days INT := least(greatest(COALESCE(p_days, 7), 1), 365);
  v_from TIMESTAMPTZ := now() - make_interval(days => least(greatest(COALESCE(p_days, 7), 1), 365));
  v_win JSONB;
  v_week JSONB;
  v_shops JSONB;
  v_people JSONB;
  v_daily JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.cash_sweep();

  SELECT jsonb_build_object(
    'requests', count(*),
    'accepted', count(*) FILTER (WHERE held_at IS NOT NULL),
    'collected', count(*) FILTER (WHERE status = 'completed'),
    'collected_cents', COALESCE(sum(amount_cents) FILTER (WHERE status = 'completed'), 0),
    'shop_no_answer', count(*) FILTER (WHERE status = 'expired' AND closed_reason = 'shop_no_response'),
    'declined', count(*) FILTER (WHERE status = 'declined'),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
    'time_ran_out', count(*) FILTER (WHERE status = 'expired' AND closed_reason = 'hold_window_passed'),
    'in_progress', count(*) FILTER (WHERE status IN ('awaiting_shop', 'held', 'awaiting_confirmation')),
    'under_review', count(*) FILTER (WHERE status IN ('disputed', 'needs_review')),
    'cashnear_fees_cents', COALESCE(sum(cashnear_fee_cents) FILTER (WHERE status = 'completed'), 0),
    'partner_fees_cents', COALESCE(sum(partner_fee_cents) FILTER (WHERE status = 'completed'), 0),
    'median_accept_seconds',
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM held_at - created_at))
         FILTER (WHERE held_at IS NOT NULL))::numeric(10,1)
  ) INTO v_win
  FROM public.cash_requests WHERE created_at >= v_from;

  SELECT jsonb_build_object(
    'collected_this_week', count(*) FILTER (WHERE status = 'completed' AND completed_at >= now() - interval '7 days'),
    'collected_last_week', count(*) FILTER (WHERE status = 'completed'
        AND completed_at >= now() - interval '14 days' AND completed_at < now() - interval '7 days')
  ) INTO v_week
  FROM public.cash_requests;

  SELECT jsonb_build_object(
    'approved', count(*) FILTER (WHERE b.application_status = 'approved'),
    'enrolled', count(*) FILTER (WHERE cp.enrolled),
    'online_now', count(*) FILTER (WHERE cp.enrolled AND cp.online AND cp.online_until > now() AND cp.paused_reason IS NULL),
    'paused', count(*) FILTER (WHERE cp.paused_reason IS NOT NULL),
    'waiting_for_review', count(*) FILTER (WHERE b.application_status IN ('submitted', 'under_review'))
  ) INTO v_shops
  FROM public.operator_businesses b
  LEFT JOIN public.cash_points cp ON cp.business_id = b.id;

  SELECT jsonb_build_object(
    'joined', (SELECT count(*) FROM public.profiles WHERE created_at >= v_from),
    'collected_once', (SELECT count(DISTINCT customer_id) FROM public.cash_requests
                        WHERE status = 'completed' AND completed_at >= v_from),
    'came_back', (SELECT count(*) FROM (
                    SELECT customer_id FROM public.cash_requests
                     WHERE status = 'completed' AND completed_at >= v_from
                     GROUP BY customer_id HAVING count(*) >= 2) t),
    'open_reports', (SELECT count(*) FROM public.cash_incidents WHERE status <> 'resolved')
  ) INTO v_people;

  -- One bar per day, in South African time, for up to the last 30 days.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d.day, 'requests', COALESCE(x.requests, 0),
                                               'collected', COALESCE(x.collected, 0)) ORDER BY d.day), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT g::date AS day
    FROM generate_series(
           (timezone('Africa/Johannesburg', now()))::date - (least(v_days, 30) - 1),
           (timezone('Africa/Johannesburg', now()))::date, interval '1 day') g
  ) d
  LEFT JOIN (
    SELECT (timezone('Africa/Johannesburg', created_at))::date AS day,
           count(*) AS requests,
           count(*) FILTER (WHERE status = 'completed') AS collected
    FROM public.cash_requests WHERE created_at >= v_from
    GROUP BY 1
  ) x ON x.day = d.day;

  RETURN jsonb_build_object('days', v_days, 'from', v_from, 'window', v_win, 'week', v_week,
                            'shops', v_shops, 'people', v_people, 'daily', v_daily);
END $$;

-- ---------------------------------------------------------------------------
-- Every transaction, newest first, with filters. The same call powers the
-- on-screen list and the CSV export; an export is recorded in the audit log.
-- Returns the payment slip number (what a shop typed from its own payment
-- device) so a row can be matched against the payment partner's statement. It
-- never returns the code or the two words.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cash_admin_requests(
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0,
  p_export BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_status public.cash_request_status;
  v_cap INT := CASE WHEN COALESCE(p_export, false) THEN 2000 ELSE 100 END;
  v_limit INT;
  v_offset INT := greatest(COALESCE(p_offset, 0), 0);
  v_like TEXT;
  v_total BIGINT;
  v_rows JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_limit := least(greatest(COALESCE(p_limit, 25), 1), v_cap);
  IF p_status IS NOT NULL AND length(trim(p_status)) > 0 THEN
    BEGIN
      v_status := trim(p_status)::public.cash_request_status;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_status';
    END;
  END IF;
  IF p_search IS NOT NULL AND length(trim(p_search)) > 0 THEN
    -- Treat the search as plain text: a typed % or _ must not act as a wildcard.
    v_like := '%' || replace(replace(replace(left(trim(p_search), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  PERFORM public.cash_sweep();

  SELECT count(*) INTO v_total
  FROM public.cash_requests r
  JOIN public.operator_businesses b ON b.id = r.business_id
  LEFT JOIN public.profiles p ON p.id = r.customer_id
  WHERE (v_status IS NULL OR r.status = v_status)
    AND (p_from IS NULL OR r.created_at >= p_from)
    AND (p_to IS NULL OR r.created_at < p_to)
    AND (v_like IS NULL OR COALESCE(b.trading_name, b.legal_name, '') ILIKE v_like
         OR COALESCE(p.full_name, '') ILIKE v_like OR COALESCE(p.email, '') ILIKE v_like
         OR r.id::text ILIKE v_like OR COALESCE(r.shop_reference, '') ILIKE v_like);

  SELECT COALESCE(jsonb_agg(item ORDER BY created DESC, rid DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT r.created_at AS created, r.id AS rid,
           jsonb_build_object(
             'id', r.id,
             'created_at', r.created_at,
             'status', r.status,
             'amount_cents', r.amount_cents,
             'partner_fee_cents', r.partner_fee_cents,
             'cashnear_fee_cents', r.cashnear_fee_cents,
             'closed_reason', r.closed_reason,
             'shop_reference', r.shop_reference,
             'held_at', r.held_at,
             'shop_completed_at', r.shop_completed_at,
             'completed_at', r.completed_at,
             'accept_seconds', CASE WHEN r.held_at IS NOT NULL
                                    THEN round(extract(epoch FROM r.held_at - r.created_at)::numeric, 0) END,
             'shop', jsonb_build_object('business_id', b.id, 'name', COALESCE(b.trading_name, b.legal_name), 'suburb', b.suburb),
             'customer', jsonb_build_object('id', r.customer_id, 'name', p.full_name, 'email', p.email)
           ) AS item
    FROM public.cash_requests r
    JOIN public.operator_businesses b ON b.id = r.business_id
    LEFT JOIN public.profiles p ON p.id = r.customer_id
    WHERE (v_status IS NULL OR r.status = v_status)
      AND (p_from IS NULL OR r.created_at >= p_from)
      AND (p_to IS NULL OR r.created_at < p_to)
      AND (v_like IS NULL OR COALESCE(b.trading_name, b.legal_name, '') ILIKE v_like
           OR COALESCE(p.full_name, '') ILIKE v_like OR COALESCE(p.email, '') ILIKE v_like
           OR r.id::text ILIKE v_like OR COALESCE(r.shop_reference, '') ILIKE v_like)
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_limit OFFSET v_offset
  ) t;

  IF COALESCE(p_export, false) THEN
    PERFORM public.log_audit_event('cash.admin.exported', 'cash_request', 'ledger',
      jsonb_build_object('rows', jsonb_array_length(v_rows), 'status', v_status, 'from', p_from, 'to', p_to,
                         'searched', v_like IS NOT NULL));
  END IF;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $$;

-- ---------------------------------------------------------------------------
-- How each enrolled shop is doing over the last N days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cash_admin_shops(p_days INT DEFAULT 30) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_from TIMESTAMPTZ := now() - make_interval(days => least(greatest(COALESCE(p_days, 30), 1), 365));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.cash_sweep();
  RETURN COALESCE((
    SELECT jsonb_agg(item ORDER BY collected DESC, requests DESC, name)
    FROM (
      SELECT COALESCE(b.trading_name, b.legal_name, 'Unnamed shop') AS name,
             count(r.id) AS requests,
             count(r.id) FILTER (WHERE r.status = 'completed') AS collected,
             jsonb_build_object(
               'business_id', b.id,
               'name', COALESCE(b.trading_name, b.legal_name, 'Unnamed shop'),
               'suburb', b.suburb,
               'enrolled', cp.enrolled,
               'online', (cp.online AND cp.online_until > now()),
               'paused_reason', cp.paused_reason,
               'trust_score', cp.trust_score,
               'requests', count(r.id),
               'collected', count(r.id) FILTER (WHERE r.status = 'completed'),
               'collected_cents', COALESCE(sum(r.amount_cents) FILTER (WHERE r.status = 'completed'), 0),
               'no_answer', count(r.id) FILTER (WHERE r.status = 'expired' AND r.closed_reason = 'shop_no_response'),
               'declined', count(r.id) FILTER (WHERE r.status = 'declined'),
               'under_review', count(r.id) FILTER (WHERE r.status IN ('disputed', 'needs_review')),
               'median_accept_seconds',
                 (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.held_at - r.created_at))
                   FILTER (WHERE r.held_at IS NOT NULL))::numeric(10,1)
             ) AS item
      FROM public.cash_points cp
      JOIN public.operator_businesses b ON b.id = cp.business_id
      LEFT JOIN public.cash_requests r ON r.business_id = b.id AND r.created_at >= v_from
      WHERE cp.enrolled
      GROUP BY b.id, b.trading_name, b.legal_name, b.suburb, cp.enrolled, cp.online, cp.online_until,
               cp.paused_reason, cp.trust_score
    ) t
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION
  public.cash_admin_summary(INT),
  public.cash_admin_requests(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, BOOLEAN),
  public.cash_admin_shops(INT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.cash_admin_summary(INT),
  public.cash_admin_requests(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, BOOLEAN),
  public.cash_admin_shops(INT)
TO authenticated;
