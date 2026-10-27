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
- Project creation goes through the `ct_create_project` DB function (service-role only, called from `/api/projects` after verifying the caller). Why: credit debit, project, jobs, document and segments must commit atomically.
- Document text extraction lives in `src/lib/doc-parse.server.ts` (fflate for DOCX, unpdf for PDF). Why: the original Python parsers cannot run on the Worker runtime.
