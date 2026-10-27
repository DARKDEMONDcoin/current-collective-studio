CREATE TYPE public.ct_role AS ENUM ('CLIENT','LINGUIST','ADMIN');

CREATE TABLE public.ct_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.ct_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.ct_user_roles TO authenticated;
GRANT ALL ON public.ct_user_roles TO service_role;
ALTER TABLE public.ct_user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ct_has_role(_user_id uuid, _role public.ct_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.ct_user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "ct roles: read own" ON public.ct_user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.ct_has_role(auth.uid(), 'ADMIN'));

CREATE OR REPLACE FUNCTION public.ct_assign_signup_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := upper(coalesce(NEW.raw_user_meta_data->>'ct_role',''));
BEGIN
  IF r IN ('CLIENT','LINGUIST') THEN
    INSERT INTO public.ct_user_roles(user_id, role) VALUES (NEW.id, r::public.ct_role) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ct_on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ct_assign_signup_role();

CREATE OR REPLACE FUNCTION public.ct_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.ct_site_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_plan_config (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  price numeric(10,2) NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT '/mo',
  description text,
  features text[] NOT NULL DEFAULT '{}',
  credits_per_cycle integer NOT NULL DEFAULT 0,
  is_popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  cta_text text NOT NULL DEFAULT 'Get Started',
  cta_href text NOT NULL DEFAULT '/register',
  stripe_price_id text,
  limits_json jsonb,
  name_ar text,
  description_ar text,
  features_ar text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_page_meta (
  page_key text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  title text, description text, og_title text, og_description text, og_image text, canonical text,
  no_index boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_key, locale)
);
CREATE TABLE public.ct_resource_categories (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text, icon text,
  color text DEFAULT '#0091AE',
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_resource_articles (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL, subtitle text,
  slug text NOT NULL UNIQUE,
  excerpt text, body text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'GUIDE',
  audiences text[] NOT NULL DEFAULT '{}',
  category_id text REFERENCES public.ct_resource_categories(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  icon text,
  featured boolean NOT NULL DEFAULT false,
  seo_title text, meta_description text,
  status text NOT NULL DEFAULT 'DRAFT',
  sort_order integer NOT NULL DEFAULT 0,
  author_id uuid,
  related_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ct_resource_faq_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  question text NOT NULL, answer text NOT NULL,
  category_id text REFERENCES public.ct_resource_categories(id) ON DELETE SET NULL,
  audiences text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'PUBLISHED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ct_site_config','ct_plan_config','ct_page_meta','ct_resource_categories','ct_resource_articles','ct_resource_faq_items'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "ct admin write" ON public.%I FOR ALL TO authenticated USING (public.ct_has_role(auth.uid(), ''ADMIN'')) WITH CHECK (public.ct_has_role(auth.uid(), ''ADMIN''))', t);
    EXECUTE format('CREATE TRIGGER ct_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at()', t);
  END LOOP;
END $$;

CREATE POLICY "public read" ON public.ct_site_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read active" ON public.ct_plan_config FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "public read" ON public.ct_page_meta FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read visible" ON public.ct_resource_categories FOR SELECT TO anon, authenticated USING (is_visible);
CREATE POLICY "public read published" ON public.ct_resource_articles FOR SELECT TO anon, authenticated USING (status = 'PUBLISHED');
CREATE POLICY "public read published" ON public.ct_resource_faq_items FOR SELECT TO anon, authenticated USING (status = 'PUBLISHED');