<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Contentech migration rules
- Imported Next.js pages live in `src/views/` unchanged where possible; `src/routes/*` files only wire params/loaders into them. Why: keeps the original source diffable against the Replit repo.
- `next/link`, `next/navigation` and `next-auth/react` imports are redirected to shims in `src/compat/`. Why: lets original components run on TanStack Router + Supabase Auth without rewriting them.
- All Contentech tables are prefixed `ct_` and roles live in `ct_user_roles` (checked via `ct_has_role`). Why: the Supabase project also hosts another app's tables (profiles, organizations, notifications...).
- Original `/api/*` endpoints called from the browser are recreated as TanStack server routes at the same path. Why: imported pages fetch them by URL.
- tsconfig strictness flags are relaxed to match the original project. Why: imported code was written with `strict: false`.
- Browser `fetch("/api/...")` gets the Supabase bearer token added by `src/compat/fetch-auth.ts`; server routes verify it with `requireApiUser` (src/lib/api-auth.ts). Why: original pages used cookie sessions.
- DB rows are converted to the original camelCase Prisma shape with `camel()` (src/lib/ct-shape.ts) before reaching views. Why: views keep their original field names.
- Project creation goes through `ct_create_project_once` (idempotency key per order, wraps `ct_create_project`; service-role only, called from `/api/projects` after verifying the caller). Members have no direct INSERT on ct_projects. Why: credit debit, project, jobs, document and segments must commit atomically and exactly once.
- Order execution is resumable: `processProject` in `src/lib/order-pipeline.server.ts` takes a lease on the project, translates only missing segments within a time budget, retries with backoff and calls `ct_refund_project` after the last attempt; it is driven by the order POST, `/api/projects/$id/progress` polling and `/api/public/process-orders` (pg_cron, secret in ct_internal_secrets). Why: Workers can't run after the response, and a failed order must never keep credits.
- AI calls go through `@lovable.dev/ai-gateway` in `src/lib/ai.server.ts` (translation + scanned PDF/image OCR). Why: Worker-safe, no provider keys in code.
- Document text extraction lives in `src/lib/doc-parse.server.ts` (fflate for DOCX, unpdf for PDF). Why: the original Python parsers cannot run on the Worker runtime.
- Free QA access is a row in `ct_test_entitlements` (service-role writes only), checked inside `ct_create_project`; orders still log a zero-amount TEST_USAGE transaction. Why: entitlement must be server-enforced and unforgeable, separate from admin roles.
- Org-scoped /api/* routes use `orgCtx` (src/lib/org-api.ts) and the caller's own Supabase client; ct_* portal tables use the "org members manage" policy via `ct_my_org()`. Why: organization isolation is enforced by the database, not by route code.
- Any AI OCR scan runs through `analyzeFile` (src/lib/analyze.server.ts), which bills per page via `ct_charge_ocr` and logs a ct_ocr_requests row. Why: scanning must never be free or billed from client-supplied page counts.
- Run `bun scripts/e2e-client-portal.ts` (needs SUPABASE_PUBLISHABLE_KEY) to re-test portal APIs with throwaway accounts. Why: sandbox cannot sign in through the UI.
- Job lifecycle: AVAILABLE/EXCLUSIVE -> ACCEPTED -> IN_PROGRESS -> SUBMITTED -> (client) COMPLETED; projects complete only via `syncProjectStatus` when every job is COMPLETED. Linguist routes use the service client only after `linguistRole` + `poolVisible`/assignment checks (src/lib/linguist.server.ts). Why: human work must be approved before delivery and linguists must only see jobs open to them.
- Originals are stored in the private `ct-originals` bucket under `<orgId>/`; deliveries rebuild DOCX/PPTX from them via `src/lib/doc-export.server.ts`. Why: keeps the client's formatting; the org prefix is checked before linking a file to an order.
- Run `bun scripts/e2e-workflow.ts` to re-test ordering, background processing, the Linguist/approval flow and downloads. Why: covers billing and access rules end to end.
- Order/editor AI translation goes through `translateChunk` (order-pipeline.server.ts) using `loadTranslationContext` + `checkSegment` (translation-context.server.ts). Why: terminology, TM reuse and output validation must be identical everywhere, scoped to the project's org.
- Admin Panel data goes through `src/lib/admin.functions.ts` (ct_has_role ADMIN check, then caller's client); credit adjustments and role changes only via service-role `ct_admin_adjust_credits` / `ct_admin_set_role`, which re-check ADMIN and write `ct_admin_audit`. Run `bun scripts/e2e-admin.ts` to re-test. Why: money and privilege changes must be authorized in the DB and always audited.
- Linguist pay is snapshotted into `ct_jobs.payout_amount` by trigger `ct_job_set_payout` when a job is accepted (from `ct_linguist_rates`). Why: later rate edits must never change agreed pay.
- Accounts without a Contentech workspace get one from `ct_ensure_client_workspace` on first `getDashboardShell`. Why: the auth users table is shared with another app, so pre-existing accounts never hit the signup trigger.
