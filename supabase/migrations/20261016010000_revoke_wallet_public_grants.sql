-- NOT APPLIED; needs Kyle approval.
-- support_saas manual-credit tool (yousafe-saas repo) should adopt reference 'manual:<uuid>'.
REVOKE ALL ON TABLE public.student_wallets, public.wallet_transactions, public.wallets FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_credit(uuid,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_debit(uuid,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_wallet(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit(uuid,integer,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_debit(uuid,integer,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_wallet(uuid) TO service_role;
