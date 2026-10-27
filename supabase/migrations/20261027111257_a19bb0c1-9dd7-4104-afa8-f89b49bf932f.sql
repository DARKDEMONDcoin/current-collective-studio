CREATE TABLE public.ct_segments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id text NOT NULL REFERENCES public.ct_documents(id) ON DELETE CASCADE,
  segment_index integer NOT NULL,
  source_text text NOT NULL,
  target_text text,
  format_hint text NOT NULL DEFAULT 'p',
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ct_segments(document_id, segment_index);
CREATE TABLE public.ct_favorite_linguists (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linguist_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id text REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, linguist_id)
);
CREATE TABLE public.ct_join_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id text NOT NULL REFERENCES public.ct_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ct_segments','ct_favorite_linguists','ct_join_requests'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "ct admin all" ON public.%I FOR ALL TO authenticated USING (public.ct_has_role(auth.uid(), ''ADMIN'')) WITH CHECK (public.ct_has_role(auth.uid(), ''ADMIN''))', t);
  END LOOP;
END $$;

CREATE POLICY "org or linguist read segments" ON public.ct_segments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ct_documents d JOIN public.ct_projects p ON p.id = d.project_id
    WHERE d.id = document_id AND (p.organization_id = public.ct_user_org(auth.uid())
      OR EXISTS (SELECT 1 FROM public.ct_jobs j WHERE j.project_id = p.id AND j.linguist_id = auth.uid()))));
CREATE POLICY "own favorites" ON public.ct_favorite_linguists FOR ALL TO authenticated
  USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
CREATE POLICY "org read join requests" ON public.ct_join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR organization_id = public.ct_user_org(auth.uid()));
CREATE POLICY "own join request" ON public.ct_join_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'PENDING');
CREATE TRIGGER ct_touch BEFORE UPDATE ON public.ct_segments FOR EACH ROW EXECUTE FUNCTION public.ct_touch_updated_at();

-- Atomic project creation: balance-guarded debit + project + jobs + document + segments.
CREATE OR REPLACE FUNCTION public.ct_create_project(_user uuid, _org text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wf text := coalesce(p->>'workflowType', 'AI_HUMAN');
  wc int := greatest(coalesce((p->>'wordCount')::int, 0), 0);
  langs text[] := coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'targetLanguages')), '{}');
  src text := coalesce(p->>'sourceLanguage', 'English');
  lsrc text := coalesce(p->>'linguistSource', 'SYSTEM_POOL');
  rate_key text := CASE wf WHEN 'CREDITS' THEN 'AI_TRANSLATION' WHEN 'AI_HUMAN' THEN 'HUMAN_REVISION' WHEN 'HUMAN_ONLY' THEN 'HUMAN_TRANSLATION' END;
  per_word numeric := 0; charge int := 0; bal int; pid text; did text; fname text;
  jstatus text := 'AVAILABLE'; excl timestamptz; lang text; seg jsonb; i int := 0;
BEGIN
  IF ct_user_org(_user) IS DISTINCT FROM _org THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(trim(p->>'name'), '') = '' THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  IF array_length(langs, 1) IS NULL THEN RAISE EXCEPTION 'LANGS_REQUIRED'; END IF;
  IF rate_key IS NOT NULL AND wc > 0 THEN
    SELECT credits_per_word INTO per_word FROM ct_credit_rates WHERE workflow_type = rate_key;
    charge := ceil(wc * coalesce(per_word, 0) * greatest(array_length(langs, 1), 1));
  END IF;
  IF charge > 0 THEN
    UPDATE ct_organizations SET credit_balance = credit_balance - charge
      WHERE id = _org AND credit_balance >= charge;
    IF NOT FOUND THEN
      SELECT credit_balance INTO bal FROM ct_organizations WHERE id = _org;
      RETURN jsonb_build_object('error', 'INSUFFICIENT_CREDITS', 'required', charge, 'balance', coalesce(bal, 0));
    END IF;
  END IF;
  INSERT INTO ct_projects(name, organization_id, client_id, status, workflow_type, source_language,
      target_languages, total_word_count, due_date, notes, attached_tm_ids, attached_glossary_ids,
      attached_style_guide_ids, ocr_confidence_warning)
    VALUES (left(p->>'name', 200), _org, _user, 'PENDING', wf, src, langs, wc,
      nullif(p->>'dueDate', '')::timestamptz, p->>'notes',
      coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'attachedTmIds')), '{}'),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'attachedGlossaryIds')), '{}'),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'attachedStyleGuideIds')), '{}'),
      coalesce((p->>'ocrConfidenceWarning')::boolean, false))
    RETURNING id INTO pid;
  IF charge > 0 THEN
    INSERT INTO ct_credit_transactions(organization_id, type, amount, description, related_project_id, breakdown_json)
      VALUES (_org, 'USAGE', -charge,
        format('Translation credits — %s (%s words × %s languages)', p->>'name', wc, array_length(langs, 1)),
        pid, jsonb_build_object('kind', 'project_translation', 'workflow', wf, 'wordCount', wc,
          'languages', array_length(langs, 1), 'creditsPerWord', per_word));
  END IF;
  IF lsrc = 'PREFERRED' AND EXISTS (SELECT 1 FROM ct_favorite_linguists WHERE customer_id = _user) THEN
    jstatus := 'EXCLUSIVE'; excl := now() + interval '24 hours';
  END IF;
  FOREACH lang IN ARRAY langs LOOP
    INSERT INTO ct_jobs(project_id, status, linguist_source, exclusive_until, source_language, target_language,
        word_count, payout_amount, business_share, breakdown_json)
      VALUES (pid, jstatus, lsrc, excl, src, lang, wc, 0, 0,
        jsonb_build_object('workflowType', wf, 'wordCount', wc, 'linguistSource', lsrc));
  END LOOP;
  IF jsonb_typeof(p->'segments') = 'array' AND jsonb_array_length(p->'segments') > 0 THEN
    fname := coalesce(p->>'filename', p->>'name' || '.txt');
    INSERT INTO ct_documents(project_id, original_filename, original_file_url, file_type, word_count,
        processing_status, detected_language, detected_doc_type, layout_html, structured_data)
      VALUES (pid, fname, coalesce(p->>'storedPath', '#'), lower(split_part(fname, '.', -1)), wc,
        'PENDING', src, coalesce(p->>'docType', 'General Document'), p->>'layoutHtml', p->'structuredData')
      RETURNING id INTO did;
    FOR seg IN SELECT * FROM jsonb_array_elements(p->'segments') LOOP
      i := i + 1;
      INSERT INTO ct_segments(document_id, segment_index, source_text, format_hint)
        VALUES (did, i,
          CASE WHEN jsonb_typeof(seg) = 'string' THEN seg #>> '{}' ELSE seg->>'text' END,
          CASE WHEN jsonb_typeof(seg) = 'object' THEN coalesce(seg->>'formatHint', 'p') ELSE 'p' END);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('id', pid, 'charged', charge);
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_create_project(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ct_create_project(uuid, text, jsonb) TO service_role;