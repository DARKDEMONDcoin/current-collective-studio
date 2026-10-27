import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/auth/register-linguist")({
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
        const password = String(body.password ?? "");
        const languages = Array.isArray(body.languages)
          ? body.languages.slice(0, 50).map(String)
          : [];
        const specializations = Array.isArray(body.specializations)
          ? body.specializations.slice(0, 50).map(String)
          : [];
        if (!name || !email || !password) {
          return Response.json({ message: "All fields are required." }, { status: 400 });
        }
        if (password.length < 8) {
          return Response.json(
            { message: "Password must be at least 8 characters." },
            { status: 400 },
          );
        }
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const origin = new URL(request.url).origin;
        const { error } = await sb.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${origin}/linguist-login`,
            data: {
              full_name: name,
              ct_role: "LINGUIST",
              ct_languages: languages,
              ct_specializations: specializations,
            },
          },
        });
        if (error) {
          const exists = /registered|exists/i.test(error.message);
          return Response.json(
            { message: exists ? "An account with this email already exists." : error.message },
            { status: exists ? 409 : 400 },
          );
        }
        return Response.json({ message: "Linguist account created." }, { status: 201 });
      },
    },
  },
});
