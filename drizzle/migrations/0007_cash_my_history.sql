-- A customer's own history, newest first, for the Activity screen.
--
-- It returns only the caller's own requests, and only what a receipt would
-- show: the shop's name, the amount, the date and how it ended. It never
-- returns the code, the two words, the shop's address or location. Safe to
-- run twice.

CREATE OR REPLACE FUNCTION public.cash_my_history(p_limit INT DEFAULT 20) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_limit INT := least(greatest(COALESCE(p_limit, 20), 1), 50);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM public.cash_sweep();
  RETURN COALESCE((
    SELECT jsonb_agg(item ORDER BY created DESC)
    FROM (
      SELECT r.created_at AS created,
             jsonb_build_object(
               'id', r.id,
               'status', r.status,
               'amount_cents', r.amount_cents,
               'created_at', r.created_at,
               'completed_at', r.completed_at,
               'closed_reason', r.closed_reason,
               'shop_name', COALESCE(b.trading_name, b.legal_name)
             ) AS item
      FROM public.cash_requests r
      JOIN public.operator_businesses b ON b.id = r.business_id
      WHERE r.customer_id = v_uid
      ORDER BY r.created_at DESC
      LIMIT v_limit
    ) t
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.cash_my_history(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_my_history(INT) TO authenticated;
