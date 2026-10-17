-- NOT APPLIED. Install only after review and explicit approval.
CREATE OR REPLACE FUNCTION public.wallet_refund_tx(
  p_debit_tx_id uuid,
  p_amount_cents int,
  p_reference text,
  p_description text,
  p_metadata jsonb
) RETURNS SETOF public.wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_debit public.wallet_transactions%ROWTYPE;
  v_meta jsonb;
  v_result public.wallet_transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_debit FROM public.wallet_transactions WHERE id = p_debit_tx_id FOR UPDATE;
  IF NOT FOUND OR v_debit.type <> 'debit' THEN RAISE EXCEPTION 'wallet charge not found' USING ERRCODE = 'P0001'; END IF;
  v_meta := COALESCE(v_debit.metadata, '{}'::jsonb);
  IF v_meta ? 'refunded_at' OR COALESCE((v_meta->>'refunded_cents')::int, 0) + p_amount_cents > v_debit.amount_cents THEN
    RAISE EXCEPTION 'charge already refunded or refund exceeds charge' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_result FROM public.wallet_credit(
    v_debit.profile_id, p_amount_cents, p_description, p_reference,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('kind','refund','refund_method','wallet','debit_tx_id',p_debit_tx_id)
  );
  UPDATE public.wallet_transactions SET metadata = v_meta || jsonb_build_object(
    'refunded_at', now(), 'refunded_cents', COALESCE((v_meta->>'refunded_cents')::int, 0) + p_amount_cents
  ) WHERE id = p_debit_tx_id;
  RETURN NEXT v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_refund_tx(uuid,int,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_refund_tx(uuid,int,text,text,jsonb) TO service_role;
