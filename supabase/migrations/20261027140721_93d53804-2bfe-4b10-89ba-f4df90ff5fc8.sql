CREATE TABLE public.ct_admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_admin_settings TO authenticated;
GRANT ALL ON public.ct_admin_settings TO service_role;
ALTER TABLE public.ct_admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct admin manage settings" ON public.ct_admin_settings FOR ALL TO authenticated
  USING (public.ct_has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.ct_has_role(auth.uid(), 'ADMIN'));

CREATE TABLE public.ct_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  project_id text,
  organization_id text,
  ok boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ct_ai_usage_created_idx ON public.ct_ai_usage(created_at DESC);
GRANT SELECT ON public.ct_ai_usage TO authenticated;
GRANT ALL ON public.ct_ai_usage TO service_role;
ALTER TABLE public.ct_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct admin read ai usage" ON public.ct_ai_usage FOR SELECT TO authenticated
  USING (public.ct_has_role(auth.uid(), 'ADMIN'));