import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { camel } from "@/lib/ct-shape";

export const Route = createFileRoute("/api/organization")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const { data: prof } = await me.supabase
          .from("ct_profiles")
          .select("organization_id")
          .eq("user_id", me.userId)
          .maybeSingle();
        if (!prof?.organization_id) return Response.json(null);
        const { data } = await me.supabase
          .from("ct_organizations")
          .select("id,name,plan,credit_balance,website_url,industry,company_bio")
          .eq("id", prof.organization_id)
          .maybeSingle();
        return Response.json(camel(data));
      },
      // Business-context fields only; restricted to CLIENT / ADMIN roles.
      PATCH: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const [{ data: prof }, { data: roles }] = await Promise.all([
          me.supabase.from("ct_profiles").select("organization_id").eq("user_id", me.userId).maybeSingle(),
          me.supabase.from("ct_user_roles").select("role").eq("user_id", me.userId),
        ]);
        if (!prof?.organization_id) return Response.json({ error: "No organization" }, { status: 400 });
        const rs = (roles ?? []).map((r) => r.role as string);
        if (!rs.includes("CLIENT") && !rs.includes("ADMIN"))
          return Response.json({ error: "Insufficient permissions" }, { status: 403 });

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const clean = (v: unknown, max: number) => {
          if (v === null) return null;
          const s = String(v).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
          return s ? s.slice(0, max) : null;
        };
        const data: Record<string, string | null> = {};
        if (body.websiteUrl !== undefined) data.website_url = clean(body.websiteUrl, 300);
        if (body.industry !== undefined) data.industry = clean(body.industry, 120);
        if (body.companyBio !== undefined) {
          const bio =
            body.companyBio === null
              ? ""
              : String(body.companyBio).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ").trim();
          data.company_bio = bio ? bio.slice(0, 1500) : null;
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: updated, error } = await supabaseAdmin
          .from("ct_organizations")
          .update(data)
          .eq("id", prof.organization_id)
          .select("id,name,website_url,industry,company_bio")
          .single();
        if (error) return Response.json({ error: "Could not save" }, { status: 500 });
        return Response.json(camel(updated));
      },
    },
  },
});
