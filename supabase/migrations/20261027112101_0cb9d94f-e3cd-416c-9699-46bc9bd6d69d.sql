DROP POLICY IF EXISTS "org create projects" ON public.ct_projects;

CREATE OR REPLACE FUNCTION public.ct_user_org(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.ct_profiles
  WHERE user_id = _uid AND (auth.uid() IS NULL OR _uid = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.ct_has_role(_user_id uuid, _role public.ct_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.ct_user_roles WHERE user_id = _user_id AND role = _role)
    AND (auth.uid() IS NULL OR _user_id = auth.uid())
$$;

ALTER TABLE public.ct_projects ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX ct_projects_idem ON public.ct_projects(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.ct_projects ADD COLUMN failure_reason text;

CREATE TABLE public.ct_segment_translations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  segment_id text NOT NULL REFERENCES public.ct_segments(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES public.ct_jobs(id) ON DELETE CASCADE,
  target_text text,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (segment_id, job_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_segment_translations TO authenticated;
GRANT ALL ON public.ct_segment_translations TO service_role;
ALTER TABLE public.ct_segment_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct admin all" ON public.ct_segment_translations FOR ALL TO authenticated
  USING (public.ct_has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.ct_has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "org or linguist read translations" ON public.ct_segment_translations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ct_jobs j JOIN public.ct_projects p ON p.id = j.project_id
    WHERE j.id = job_id AND (j.linguist_id = auth.uid() OR p.organization_id = public.ct_user_org(auth.uid()))));
CREATE TRIGGER ct_touch BEFORE UPDATE ON public.ct_segment_translations FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at();

-- Idempotent wrapper: same (org, key) returns the existing project without charging again.
CREATE OR REPLACE FUNCTION public.ct_create_project_once(_user uuid, _org text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := nullif(left(p->>'idempotencyKey', 100), ''); existing text; r jsonb;
BEGIN
  IF k IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(_org || ':' || k));
    SELECT id INTO existing FROM ct_projects WHERE organization_id = _org AND idempotency_key = k;
    IF existing IS NOT NULL THEN RETURN jsonb_build_object('id', existing, 'charged', 0, 'duplicate', true); END IF;
  END IF;
  r := ct_create_project(_user, _org, p);
  IF k IS NOT NULL AND r ? 'id' THEN UPDATE ct_projects SET idempotency_key = k WHERE id = r->>'id'; END IF;
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_create_project_once(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ct_create_project_once(uuid, text, jsonb) TO service_role;

-- Refund all net usage charged to a project exactly once, mark it FAILED.
CREATE OR REPLACE FUNCTION public.ct_refund_project(_project text, _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o text; used int;
BEGIN
  SELECT organization_id INTO o FROM ct_projects WHERE id = _project FOR UPDATE;
  IF o IS NULL THEN RETURN 0; END IF;
  UPDATE ct_projects SET status = 'FAILED', failure_reason = left(_reason, 500) WHERE id = _project;
  UPDATE ct_jobs SET status = 'CANCELLED' WHERE project_id = _project AND status <> 'COMPLETED';
  IF EXISTS (SELECT 1 FROM ct_credit_transactions WHERE related_project_id = _project AND type = 'REFUND') THEN RETURN 0; END IF;
  SELECT coalesce(-sum(amount), 0) INTO used FROM ct_credit_transactions WHERE related_project_id = _project AND type = 'USAGE';
  IF used <= 0 THEN RETURN 0; END IF;
  UPDATE ct_organizations SET credit_balance = credit_balance + used WHERE id = o;
  INSERT INTO ct_credit_transactions(organization_id, type, amount, description, related_project_id, breakdown_json)
    VALUES (o, 'REFUND', used, 'Refund — order could not be completed', _project, jsonb_build_object('kind', 'project_refund', 'reason', left(_reason, 500)));
  RETURN used;
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_refund_project(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ct_refund_project(text, text) TO service_role;