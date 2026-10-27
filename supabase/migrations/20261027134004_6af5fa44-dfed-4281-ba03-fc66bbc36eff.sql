DROP FUNCTION public.ct_admin_adjust_credits(text,int,text);
DROP FUNCTION public.ct_admin_set_role(uuid,public.ct_role,boolean);
REVOKE EXECUTE ON FUNCTION public.ct_job_set_payout() FROM authenticated;

-- Service-role only: the server verifies the caller is ADMIN, then passes their id.
CREATE FUNCTION public.ct_admin_adjust_credits(_admin uuid, _org text, _amount int, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bal int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ct_user_roles WHERE user_id = _admin AND role = 'ADMIN') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _amount = 0 OR abs(_amount) > 10000000 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE ct_organizations SET credit_balance = credit_balance + _amount, updated_at = now()
    WHERE id = _org AND credit_balance + _amount >= 0 RETURNING credit_balance INTO bal;
  IF bal IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND_OR_NEGATIVE'); END IF;
  INSERT INTO ct_credit_transactions(organization_id, type, amount, description, breakdown_json)
    VALUES (_org, 'ADMIN_ADJUSTMENT', _amount, left(_reason,300), jsonb_build_object('adminId', _admin));
  INSERT INTO ct_admin_audit(admin_id, action, target, details) VALUES (_admin, 'credits.adjust', _org, jsonb_build_object('amount',_amount,'reason',_reason,'balance',bal));
  RETURN jsonb_build_object('balance', bal);
END $$;

CREATE FUNCTION public.ct_admin_set_role(_admin uuid, _user uuid, _role public.ct_role, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ct_user_roles WHERE user_id = _admin AND role = 'ADMIN') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user = _admin AND _role = 'ADMIN' AND NOT _grant THEN RAISE EXCEPTION 'cannot remove your own admin role'; END IF;
  IF _grant THEN INSERT INTO ct_user_roles(user_id, role) VALUES (_user, _role) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM ct_user_roles WHERE user_id = _user AND role = _role; END IF;
  INSERT INTO ct_admin_audit(admin_id, action, target, details) VALUES (_admin, CASE WHEN _grant THEN 'role.grant' ELSE 'role.revoke' END, _user::text, jsonb_build_object('role',_role));
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_admin_adjust_credits(uuid,text,int,text), public.ct_admin_set_role(uuid,uuid,public.ct_role,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ct_admin_adjust_credits(uuid,text,int,text), public.ct_admin_set_role(uuid,uuid,public.ct_role,boolean) TO service_role;