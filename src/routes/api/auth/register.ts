import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Same request/response shape as the original /api/auth/register endpoint.
// Organization + credit setup is stored in the account details and finished in the client-portal stage.
export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const name = String(body.name ?? "")
          .trim()
          .slice(0, 200);
        const email = String(body.email ?? "")
          .trim()
          .toLowerCase()
          .slice(0, 320);
        const orgName = String(body.orgName ?? "")
          .trim()
          .slice(0, 200);
        const password = String(body.password ?? "");
        if (!name || !email || !orgName || !password) {
          return Response.json({ message: "All fields are required." }, { status: 400 });
        }
        if (password.length < 8) {
          return Response.json(
            { message: "Password must be at least 8 characters." },
            { status: 400 },
          );
        }
        const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const sb = createClient(process.env.SUPABASE_URL!, key, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const origin = new URL(request.url).origin;
        const { error } = await sb.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${origin}/login?registered=true`,
            data: { full_name: name, ct_role: "CLIENT", ct_org_name: orgName },
          },
        });
        if (error) {
          const exists = /registered|exists/i.test(error.message);
          return Response.json(
            { message: exists ? "An account with this email already exists." : error.message },
            { status: exists ? 409 : 400 },
          );
        }
        return Response.json({ message: "Account created successfully." }, { status: 201 });
      },
    },
  },
});
