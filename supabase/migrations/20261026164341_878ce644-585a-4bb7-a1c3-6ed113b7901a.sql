REVOKE EXECUTE ON FUNCTION public.ct_assign_signup_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ct_has_role(uuid, public.ct_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ct_has_role(uuid, public.ct_role) TO authenticated;