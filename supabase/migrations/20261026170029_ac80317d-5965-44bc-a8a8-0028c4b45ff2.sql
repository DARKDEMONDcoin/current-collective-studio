CREATE TABLE public.ct_organizations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'STARTER',
  credit_balance integer NOT NULL DEFAULT 0,
  website_url text, industry text, company_bio text,
  credits_reset_at timestamptz,
  stripe_customer_id text UNIQUE, stripe_subscription_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  avatar_url text,
  organization_id text REFERENCES public.ct_organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_projects (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  workflow_type text NOT NULL DEFAULT 'AI_HUMAN',
  source_language text NOT NULL,
  target_languages text[] NOT NULL DEFAULT '{}',
  total_word_count integer NOT NULL DEFAULT 0,
  due_date timestamptz, notes text,
  attached_tm_ids text[] NOT NULL DEFAULT '{}',
  attached_glossary_ids text[] NOT NULL DEFAULT '{}',
  attached_style_guide_ids text[] NOT NULL DEFAULT '{}',
  ocr_confidence_warning boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_documents (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id text NOT NULL REFERENCES public.ct_projects(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  original_file_url text NOT NULL,
  translated_file_url text,
  file_type text NOT NULL,
  word_count integer NOT NULL DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'PENDING',
  detected_language text, detected_doc_type text, layout_html text,
  structured_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_jobs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id text NOT NULL REFERENCES public.ct_projects(id) ON DELETE CASCADE,
  linguist_id uuid,
  status text NOT NULL DEFAULT 'AVAILABLE',
  linguist_source text NOT NULL DEFAULT 'SYSTEM_POOL',
  exclusive_until timestamptz,
  source_language text NOT NULL,
  target_language text NOT NULL,
  word_count integer NOT NULL DEFAULT 0,
  payout_amount numeric(10,2), business_share numeric(10,2),
  breakdown_json jsonb,
  accepted_at timestamptz, completed_at timestamptz, audit_report_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_credit_transactions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount integer NOT NULL,
  description text,
  related_project_id text REFERENCES public.ct_projects(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  breakdown_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_credit_packages (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL, credits integer NOT NULL, bonus_credits integer NOT NULL DEFAULT 0,
  price_usd numeric(10,2) NOT NULL, is_popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_credit_rates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_type text NOT NULL UNIQUE,
  credits_per_word numeric(10,4) NOT NULL,
  label text NOT NULL, description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_plan_features (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feature text NOT NULL, plan_slug text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature, plan_slug)
);
CREATE TABLE public.ct_in_app_notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL, title text NOT NULL, body text NOT NULL, link text,
  priority text NOT NULL DEFAULT 'normal',
  is_read boolean NOT NULL DEFAULT false, read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.ct_user_org(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.ct_profiles WHERE user_id = _uid
$$;
REVOKE EXECUTE ON FUNCTION public.ct_user_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ct_user_org(uuid) TO authenticated;

-- grants + RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ct_organizations','ct_profiles','ct_projects','ct_documents','ct_jobs','ct_credit_transactions','ct_credit_packages','ct_credit_rates','ct_plan_features','ct_in_app_notifications'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "ct admin all" ON public.%I FOR ALL TO authenticated USING (public.ct_has_role(auth.uid(), ''ADMIN'')) WITH CHECK (public.ct_has_role(auth.uid(), ''ADMIN''))', t);
  END LOOP;
END $$;
GRANT SELECT ON public.ct_credit_packages, public.ct_credit_rates, public.ct_plan_features TO anon;

CREATE POLICY "members read org" ON public.ct_organizations FOR SELECT TO authenticated USING (id = public.ct_user_org(auth.uid()));
CREATE POLICY "read own profile" ON public.ct_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (organization_id IS NOT NULL AND organization_id = public.ct_user_org(auth.uid())));
CREATE POLICY "update own profile name" ON public.ct_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND organization_id IS NOT DISTINCT FROM public.ct_user_org(auth.uid()));
CREATE POLICY "org read projects" ON public.ct_projects FOR SELECT TO authenticated USING (organization_id = public.ct_user_org(auth.uid()));
CREATE POLICY "org create projects" ON public.ct_projects FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.ct_user_org(auth.uid()) AND client_id = auth.uid());
CREATE POLICY "org read documents" ON public.ct_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ct_projects p WHERE p.id = project_id AND p.organization_id = public.ct_user_org(auth.uid())));
CREATE POLICY "org or linguist read jobs" ON public.ct_jobs FOR SELECT TO authenticated
  USING (linguist_id = auth.uid() OR EXISTS (SELECT 1 FROM public.ct_projects p WHERE p.id = project_id AND p.organization_id = public.ct_user_org(auth.uid())));
CREATE POLICY "org read transactions" ON public.ct_credit_transactions FOR SELECT TO authenticated USING (organization_id = public.ct_user_org(auth.uid()));
CREATE POLICY "read active packages" ON public.ct_credit_packages FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "read rates" ON public.ct_credit_rates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "read plan features" ON public.ct_plan_features FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "own notifications read" ON public.ct_in_app_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications mark read" ON public.ct_in_app_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER ct_touch BEFORE UPDATE ON public.ct_organizations FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at();
CREATE TRIGGER ct_touch BEFORE UPDATE ON public.ct_profiles FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at();
CREATE TRIGGER ct_touch BEFORE UPDATE ON public.ct_projects FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at();
CREATE TRIGGER ct_touch BEFORE UPDATE ON public.ct_credit_packages FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at();
CREATE TRIGGER ct_touch BEFORE UPDATE ON public.ct_credit_rates FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at();
CREATE TRIGGER ct_touch BEFORE UPDATE ON public.ct_plan_features FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at();

-- signup: role + profile + (client) organization with 1000 welcome credits
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
      VALUES (oid, 'BONUS', 1000, 'Welcome bonus — 100 free credits on sign-up', '{"kind":"signup_bonus"}');
  END IF;
  INSERT INTO public.ct_profiles(user_id, email, name, organization_id)
    VALUES (NEW.id, coalesce(NEW.email,''), left(NEW.raw_user_meta_data->>'full_name', 200), oid)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_assign_signup_role() FROM PUBLIC, anon, authenticated;