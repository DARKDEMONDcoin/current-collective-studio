CREATE TABLE public.ct_test_entitlements (
  user_id uuid PRIMARY KEY,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ct_test_entitlements TO authenticated;
GRANT ALL ON public.ct_test_entitlements TO service_role;
ALTER TABLE public.ct_test_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own test entitlement" ON public.ct_test_entitlements FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.ct_test_entitlements(user_id, note)
SELECT id, 'Dedicated QA account (free orders)' FROM auth.users WHERE lower(email) = 'abdallamohamed55xx@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ct_is_test_user(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM ct_test_entitlements WHERE user_id = _user AND active)
$$;
REVOKE EXECUTE ON FUNCTION public.ct_is_test_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ct_is_test_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ct_create_project(_user uuid, _org text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wf text := coalesce(p->>'workflowType', 'AI_HUMAN');
  wc int := greatest(coalesce((p->>'wordCount')::int, 0), 0);
  langs text[] := coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'targetLanguages')), '{}');
  src text := coalesce(p->>'sourceLanguage', 'English');
  lsrc text := coalesce(p->>'linguistSource', 'SYSTEM_POOL');
  rate_key text := CASE wf WHEN 'CREDITS' THEN 'AI_TRANSLATION' WHEN 'AI_HUMAN' THEN 'HUMAN_REVISION' WHEN 'HUMAN_ONLY' THEN 'HUMAN_TRANSLATION' END;
  per_word numeric; charge int := 0; bal int; pid text; did text; fname text;
  jstatus text := 'AVAILABLE'; excl timestamptz; lang text; seg jsonb; i int := 0;
  free_test boolean := ct_is_test_user(_user) AND coalesce((p->>'testBilling')::boolean, false) = false;
BEGIN
  IF ct_user_org(_user) IS DISTINCT FROM _org THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(trim(p->>'name'), '') = '' THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  IF array_length(langs, 1) IS NULL THEN RAISE EXCEPTION 'LANGS_REQUIRED'; END IF;
  IF rate_key IS NULL THEN RETURN jsonb_build_object('error', 'WORKFLOW_UNAVAILABLE'); END IF;
  SELECT credits_per_word INTO per_word FROM ct_credit_rates WHERE workflow_type = rate_key;
  IF per_word IS NULL THEN RETURN jsonb_build_object('error', 'RATE_NOT_CONFIGURED'); END IF;
  charge := ceil(wc * per_word * array_length(langs, 1));
  IF charge > 0 AND NOT free_test THEN
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
      VALUES (_org, CASE WHEN free_test THEN 'TEST_USAGE' ELSE 'USAGE' END, CASE WHEN free_test THEN 0 ELSE -charge END,
        format('%sTranslation credits — %s (%s words × %s languages)', CASE WHEN free_test THEN '[Test, not charged] ' ELSE '' END, p->>'name', wc, array_length(langs, 1)),
        pid, jsonb_build_object('kind', 'project_translation', 'workflow', wf, 'wordCount', wc,
          'languages', array_length(langs, 1), 'creditsPerWord', per_word, 'wouldCharge', charge, 'testMode', free_test));
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
  RETURN jsonb_build_object('id', pid, 'charged', CASE WHEN free_test THEN 0 ELSE charge END, 'testMode', free_test);
END $$;
REVOKE EXECUTE ON FUNCTION public.ct_create_project(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ct_create_project(uuid, text, jsonb) TO service_role;