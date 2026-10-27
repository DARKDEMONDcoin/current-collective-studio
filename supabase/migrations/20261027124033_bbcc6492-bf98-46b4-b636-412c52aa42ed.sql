-- lovable-cron-fallback-reviewed: large orders must keep processing after the browser closes; Workers cannot run work after the response, so a 1-minute wake-up resumes queued orders (exits immediately when the queue is empty).
ALTER TABLE public.ct_projects
  ADD COLUMN IF NOT EXISTS progress_done integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.ct_jobs
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS revision_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ct_projects_processing_idx ON public.ct_projects(status, next_attempt_at)
  WHERE status IN ('PENDING','PROCESSING');

CREATE TABLE IF NOT EXISTS public.ct_internal_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.ct_internal_secrets FROM anon, authenticated;
GRANT ALL ON public.ct_internal_secrets TO service_role;
ALTER TABLE public.ct_internal_secrets ENABLE ROW LEVEL SECURITY;
INSERT INTO public.ct_internal_secrets(key, value)
  VALUES ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex'))
  ON CONFLICT (key) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule('ct-process-orders', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://current-collective-studio.lovable.app/api/public/process-orders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT value FROM public.ct_internal_secrets WHERE key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);