CREATE OR REPLACE FUNCTION public.cash_set_availability(p_business UUID, p_minutes INT DEFAULT NULL, p_band_cents INT DEFAULT NULL, p_small BOOLEAN DEFAULT NULL)
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
    missed_count = CASE WHEN p_minutes > 0 THEN 0 ELSE missed_count END,
    paused_reason = CASE WHEN p_minutes > 0 AND paused_reason = 'missed_requests' THEN NULL ELSE paused_reason END,
    updated_at = now()
  WHERE business_id = p_business;

  PERFORM public.log_audit_event('cash.point.availability', 'cash_point', p_business::text,
    jsonb_build_object('minutes', p_minutes, 'band_cents', p_band_cents, 'small_notes', p_small));
  RETURN public.cash_shop_state(p_business);
END $$;
REVOKE ALL ON FUNCTION public.cash_set_availability(UUID, INT, INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_set_availability(UUID, INT, INT, BOOLEAN) TO authenticated;