CREATE OR REPLACE FUNCTION public.ct_my_org() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM ct_profiles WHERE user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.ct_my_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ct_my_org() TO authenticated, service_role;

CREATE TABLE public.ct_client_accounts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  name text NOT NULL, notes text, website_url text, industry text, company_bio text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_departments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  name text NOT NULL, description text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_department_members (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  department_id text NOT NULL REFERENCES public.ct_departments(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text NOT NULL DEFAULT 'MEMBER',
  can_access_tm boolean NOT NULL DEFAULT false, can_access_glossary boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT true, joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id));
CREATE TABLE public.ct_translation_memories (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  client_account_id text REFERENCES public.ct_client_accounts(id) ON DELETE SET NULL,
  name text NOT NULL, source_language text NOT NULL, target_language text NOT NULL,
  entry_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_tm_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tm_id text NOT NULL REFERENCES public.ct_translation_memories(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  source_text text NOT NULL, target_text text NOT NULL, context text,
  created_by text NOT NULL DEFAULT 'human', usage_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tm_id, source_text));
CREATE TABLE public.ct_glossaries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  client_account_id text REFERENCES public.ct_client_accounts(id) ON DELETE SET NULL,
  name text NOT NULL, languages text[] NOT NULL DEFAULT '{}', term_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_glossary_terms (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  glossary_id text NOT NULL REFERENCES public.ct_glossaries(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  term text NOT NULL, translations jsonb NOT NULL DEFAULT '{}', definition text, notes text,
  case_sensitive boolean NOT NULL DEFAULT false, do_not_translate boolean NOT NULL DEFAULT false,
  keep_uppercase boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_style_guides (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  client_account_id text REFERENCES public.ct_client_accounts(id) ON DELETE SET NULL,
  name text NOT NULL, file_name text NOT NULL DEFAULT 'manual.txt', mime_type text NOT NULL DEFAULT 'text/plain',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_ocr_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  client_account_id text REFERENCES public.ct_client_accounts(id) ON DELETE SET NULL,
  created_by_id uuid NOT NULL, name text, source_filename text NOT NULL, source_file_url text NOT NULL DEFAULT '#',
  source_mime_type text, source_language text, page_count int NOT NULL DEFAULT 0, word_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'NEEDS_VERIFICATION', workflow_type text NOT NULL DEFAULT 'AI_ONLY',
  provider text NOT NULL DEFAULT 'ai', avg_confidence numeric NOT NULL DEFAULT 0.9,
  extracted_text text, verified_text text, notes text, credits_charged int NOT NULL DEFAULT 0,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX ct_ocr_requests_idem ON public.ct_ocr_requests(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.ct_api_keys (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  name text NOT NULL, key_prefix text NOT NULL, key_hash text NOT NULL UNIQUE,
  permissions text[] NOT NULL DEFAULT '{}', last_used_at timestamptz, expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_webhook_subscriptions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  url text NOT NULL, events text[] NOT NULL DEFAULT '{}', secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true, last_fired_at timestamptz, failure_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_linguist_reviews (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id text NOT NULL UNIQUE REFERENCES public.ct_jobs(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL, linguist_id uuid NOT NULL,
  rating int NOT NULL, comment text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ct_linguist_blacklist (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL, linguist_id uuid NOT NULL, reason text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, linguist_id));

CREATE OR REPLACE FUNCTION public.ct_review_rating_check() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN IF NEW.rating < 1 OR NEW.rating > 5 THEN RAISE EXCEPTION 'rating must be 1-5'; END IF; RETURN NEW; END $$;
CREATE TRIGGER ct_review_rating BEFORE INSERT OR UPDATE ON public.ct_linguist_reviews FOR EACH ROW EXECUTE FUNCTION public.ct_review_rating_check();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ct_client_accounts','ct_departments','ct_department_members','ct_translation_memories','ct_tm_entries','ct_glossaries','ct_glossary_terms','ct_style_guides','ct_ocr_requests','ct_api_keys','ct_webhook_subscriptions','ct_linguist_reviews','ct_linguist_blacklist'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "org members manage" ON public.%I FOR ALL TO authenticated USING (organization_id = public.ct_my_org()) WITH CHECK (organization_id = public.ct_my_org())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ct_client_accounts','ct_departments','ct_translation_memories','ct_glossaries','ct_style_guides','ct_ocr_requests'] LOOP
    EXECUTE format('CREATE TRIGGER touch_%s BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at()', t, t);
  END LOOP;
END $$;

-- OCR requests are charged by the server only (service role); members can read and edit notes/verified text but not create billed rows or change charges.
DROP POLICY "org members manage" ON public.ct_ocr_requests;
CREATE POLICY "org members read ocr" ON public.ct_ocr_requests FOR SELECT TO authenticated USING (organization_id = public.ct_my_org());
CREATE POLICY "org members delete ocr" ON public.ct_ocr_requests FOR DELETE TO authenticated USING (organization_id = public.ct_my_org());
REVOKE INSERT, UPDATE ON public.ct_ocr_requests FROM authenticated;
-- API key hashes are written by the server only.
REVOKE INSERT, UPDATE ON public.ct_api_keys FROM authenticated;

-- Atomic per-page OCR charge (test accounts are not charged).
CREATE OR REPLACE FUNCTION public.ct_charge_ocr(_user uuid, _org text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pages int := greatest(coalesce((p->>'pageCount')::int, 1), 1); rate numeric; charge int; rid text; bal int;
  free_test boolean := ct_is_test_user(_user) AND coalesce((p->>'testBilling')::boolean, false) = false;
  idem text := nullif(p->>'idempotencyKey', '');
BEGIN
  IF ct_user_org(_user) IS DISTINCT FROM _org THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF idem IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(_org || ':ocr:' || idem));
    SELECT id, credits_charged INTO rid, charge FROM ct_ocr_requests WHERE organization_id = _org AND idempotency_key = idem;
    IF rid IS NOT NULL THEN RETURN jsonb_build_object('id', rid, 'charged', charge, 'duplicate', true); END IF;
  END IF;
  SELECT credits_per_word INTO rate FROM ct_credit_rates WHERE workflow_type = 'OCR_PAGE';
  IF rate IS NULL THEN RETURN jsonb_build_object('error', 'RATE_NOT_CONFIGURED'); END IF;
  charge := ceil(pages * rate);
  IF NOT free_test THEN
    UPDATE ct_organizations SET credit_balance = credit_balance - charge WHERE id = _org AND credit_balance >= charge;
    IF NOT FOUND THEN
      SELECT credit_balance INTO bal FROM ct_organizations WHERE id = _org;
      RETURN jsonb_build_object('error', 'INSUFFICIENT_CREDITS', 'required', charge, 'balance', coalesce(bal, 0));
    END IF;
  END IF;
  INSERT INTO ct_ocr_requests(organization_id, client_account_id, created_by_id, name, source_filename, source_mime_type,
      source_language, page_count, word_count, workflow_type, extracted_text, credits_charged, idempotency_key, status)
    VALUES (_org, nullif(p->>'clientAccountId', ''), _user, left(p->>'name', 200), coalesce(p->>'filename', 'scan'), p->>'mimeType',
      p->>'sourceLanguage', pages, coalesce((p->>'wordCount')::int, 0), coalesce(p->>'workflowType', 'AI_ONLY'),
      p->>'extractedText', CASE WHEN free_test THEN 0 ELSE charge END, idem,
      CASE WHEN coalesce(p->>'workflowType', 'AI_ONLY') = 'AI_ONLY' THEN 'COMPLETED' ELSE 'NEEDS_VERIFICATION' END)
    RETURNING id INTO rid;
  INSERT INTO ct_credit_transactions(organization_id, type, amount, description, breakdown_json)
    VALUES (_org, CASE WHEN free_test THEN 'TEST_USAGE' ELSE 'USAGE' END, CASE WHEN free_test THEN 0 ELSE -charge END,
      format('%sOCR — %s (%s pages)', CASE WHEN free_test THEN '[Test, not charged] ' ELSE '' END, coalesce(p->>'filename', 'scan'), pages),
      jsonb_build_object('kind', 'ocr', 'ocrRequestId', rid, 'pages', pages, 'rate', rate, 'wouldCharge', charge, 'testMode', free_test));
  RETURN jsonb_build_object('id', rid, 'charged', CASE WHEN free_test THEN 0 ELSE charge END, 'testMode', free_test);
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_charge_ocr(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ct_charge_ocr(uuid, text, jsonb) TO service_role;