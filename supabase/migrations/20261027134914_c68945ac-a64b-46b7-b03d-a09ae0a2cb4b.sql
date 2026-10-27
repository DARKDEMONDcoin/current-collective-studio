-- Accounts created before Contentech existed (shared auth) get a client workspace the first
-- time they open the Contentech dashboard. Idempotent; never touches linguists/admins with a profile.
CREATE OR REPLACE FUNCTION public.ct_ensure_client_workspace(_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u record; existing text; base text; s text; n int := 1; oid text; nm text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ct_ws_' || _user::text));
  SELECT organization_id INTO existing FROM ct_profiles WHERE user_id = _user;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF EXISTS (SELECT 1 FROM ct_user_roles WHERE user_id = _user AND role IN ('LINGUIST','ADMIN'))
     AND EXISTS (SELECT 1 FROM ct_profiles WHERE user_id = _user) THEN RETURN NULL; END IF;
  SELECT id, email, raw_user_meta_data INTO u FROM auth.users WHERE id = _user;
  IF NOT FOUND THEN RETURN NULL; END IF;
  nm := coalesce(nullif(trim(u.raw_user_meta_data->>'ct_org_name'),''), nullif(trim(u.raw_user_meta_data->>'full_name'),''), split_part(coalesce(u.email,'workspace'),'@',1)) || '''s workspace';
  base := coalesce(nullif(trim(both '-' from regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g')), ''), 'org');
  s := base;
  WHILE EXISTS (SELECT 1 FROM ct_organizations WHERE slug = s) LOOP s := base || '-' || n; n := n + 1; END LOOP;
  INSERT INTO ct_organizations(name, slug, plan, credit_balance, credits_reset_at)
    VALUES (left(nm,200), s, 'STARTER', 1000, now() + interval '30 days') RETURNING id INTO oid;
  INSERT INTO ct_credit_transactions(organization_id, type, amount, description, breakdown_json)
    VALUES (oid, 'BONUS', 1000, 'Welcome bonus — 1,000 free credits', '{"kind":"signup_bonus"}');
  INSERT INTO ct_user_roles(user_id, role) VALUES (_user, 'CLIENT') ON CONFLICT DO NOTHING;
  INSERT INTO ct_profiles(user_id, email, name, organization_id)
    VALUES (_user, coalesce(u.email,''), left(u.raw_user_meta_data->>'full_name',200), oid)
    ON CONFLICT (user_id) DO UPDATE SET organization_id = EXCLUDED.organization_id WHERE ct_profiles.organization_id IS NULL;
  RETURN oid;
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_ensure_client_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ct_ensure_client_workspace(uuid) TO service_role;

-- Fix the welcome-bonus wording (amount is 1,000, text said 100).
CREATE OR REPLACE FUNCTION public.ct_assign_signup_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r text := upper(coalesce(NEW.raw_user_meta_data->>'ct_role',''));
  org_name text := nullif(trim(coalesce(NEW.raw_user_meta_data->>'ct_org_name','')), '');
  base text; s text; n int := 1; oid text;
BEGIN
  IF r NOT IN ('CLIENT','LINGUIST') THEN RETURN NEW; END IF;
  INSERT INTO public.ct_user_roles(user_id, role) VALUES (NEW.id, r::public.ct_role) ON CONFLICT DO NOTHING;
  IF r = 'CLIENT' AND org_name IS NOT NULL THEN
    base := coalesce(nullif(trim(both '-' from regexp_replace(lower(org_name), '[^a-z0-9]+', '-', 'g')), ''), 'org');
    s := base;
    WHILE EXISTS (SELECT 1 FROM public.ct_organizations WHERE slug = s) LOOP s := base || '-' || n; n := n + 1; END LOOP;
    INSERT INTO public.ct_organizations(name, slug, plan, credit_balance, credits_reset_at)
      VALUES (left(org_name, 200), s, 'STARTER', 1000, now() + interval '30 days') RETURNING id INTO oid;
    INSERT INTO public.ct_credit_transactions(organization_id, type, amount, description, breakdown_json)
      VALUES (oid, 'BONUS', 1000, 'Welcome bonus — 1,000 free credits', '{"kind":"signup_bonus"}');
  END IF;
  INSERT INTO public.ct_profiles(user_id, email, name, organization_id)
    VALUES (NEW.id, coalesce(NEW.email,''), left(NEW.raw_user_meta_data->>'full_name', 200), oid)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_assign_signup_role() FROM PUBLIC, anon, authenticated;
UPDATE public.ct_credit_transactions SET description = 'Welcome bonus — 1,000 free credits'
  WHERE type = 'BONUS' AND amount = 1000 AND description = 'Welcome bonus — 100 free credits on sign-up';