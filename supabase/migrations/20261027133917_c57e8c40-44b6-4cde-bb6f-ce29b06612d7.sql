CREATE TABLE public.ct_linguist_rates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_type text NOT NULL UNIQUE,
  rate_per_word numeric(10,4) NOT NULL DEFAULT 0 CHECK (rate_per_word >= 0),
  min_payout numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_payout >= 0),
  label text,
  updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_linguist_rates TO authenticated;
GRANT ALL ON public.ct_linguist_rates TO service_role;
ALTER TABLE public.ct_linguist_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct admin all" ON public.ct_linguist_rates FOR ALL TO authenticated
  USING (public.ct_has_role(auth.uid(),'ADMIN')) WITH CHECK (public.ct_has_role(auth.uid(),'ADMIN'));
CREATE POLICY "linguists read rates" ON public.ct_linguist_rates FOR SELECT TO authenticated
  USING (public.ct_has_role(auth.uid(),'LINGUIST'));
INSERT INTO public.ct_linguist_rates(workflow_type, rate_per_word, min_payout, label) VALUES
  ('AI_HUMAN', 0, 0, 'AI draft + human review'), ('HUMAN_ONLY', 0, 0, 'Human translation');

CREATE TABLE public.ct_admin_audit (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_id uuid NOT NULL, action text NOT NULL, target text, details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ct_admin_audit TO authenticated;
GRANT ALL ON public.ct_admin_audit TO service_role;
ALTER TABLE public.ct_admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.ct_admin_audit FOR SELECT TO authenticated USING (public.ct_has_role(auth.uid(),'ADMIN'));

-- Admins can see roles (users list); writes only through ct_admin_set_role.
CREATE POLICY "admins read roles" ON public.ct_user_roles FOR SELECT TO authenticated USING (public.ct_has_role(auth.uid(),'ADMIN'));

-- Payout is snapshotted when a linguist accepts, so later rate edits never change agreed pay.
CREATE OR REPLACE FUNCTION public.ct_job_set_payout() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wf text; r record;
BEGIN
  IF NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED' AND COALESCE(NEW.payout_amount,0) = 0 THEN
    SELECT workflow_type INTO wf FROM ct_projects WHERE id = NEW.project_id;
    SELECT * INTO r FROM ct_linguist_rates WHERE workflow_type = wf;
    IF FOUND THEN NEW.payout_amount := round(greatest(COALESCE(NEW.word_count,0) * r.rate_per_word, r.min_payout), 2); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ct_job_set_payout BEFORE UPDATE OF status ON public.ct_jobs FOR EACH ROW EXECUTE FUNCTION public.ct_job_set_payout();

CREATE OR REPLACE FUNCTION public.ct_admin_adjust_credits(_org text, _amount int, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bal int;
BEGIN
  IF NOT ct_has_role(auth.uid(),'ADMIN') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _amount = 0 OR abs(_amount) > 10000000 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE ct_organizations SET credit_balance = credit_balance + _amount, updated_at = now()
    WHERE id = _org AND credit_balance + _amount >= 0 RETURNING credit_balance INTO bal;
  IF bal IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND_OR_NEGATIVE'); END IF;
  INSERT INTO ct_credit_transactions(organization_id, type, amount, description, breakdown_json)
    VALUES (_org, 'ADMIN_ADJUSTMENT', _amount, left(_reason,300), jsonb_build_object('adminId', auth.uid()));
  INSERT INTO ct_admin_audit(admin_id, action, target, details) VALUES (auth.uid(), 'credits.adjust', _org, jsonb_build_object('amount',_amount,'reason',_reason,'balance',bal));
  RETURN jsonb_build_object('balance', bal);
END $$;

CREATE OR REPLACE FUNCTION public.ct_admin_set_role(_user uuid, _role public.ct_role, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT ct_has_role(auth.uid(),'ADMIN') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user = auth.uid() AND _role = 'ADMIN' AND NOT _grant THEN RAISE EXCEPTION 'cannot remove your own admin role'; END IF;
  IF _grant THEN INSERT INTO ct_user_roles(user_id, role) VALUES (_user, _role) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM ct_user_roles WHERE user_id = _user AND role = _role; END IF;
  INSERT INTO ct_admin_audit(admin_id, action, target, details) VALUES (auth.uid(), CASE WHEN _grant THEN 'role.grant' ELSE 'role.revoke' END, _user::text, jsonb_build_object('role',_role));
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_admin_adjust_credits(text,int,text), public.ct_admin_set_role(uuid,public.ct_role,boolean), public.ct_job_set_payout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ct_admin_adjust_credits(text,int,text), public.ct_admin_set_role(uuid,public.ct_role,boolean) TO authenticated;