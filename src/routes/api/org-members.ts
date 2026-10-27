import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

export const Route = createFileRoute("/api/org-members")({
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
        const orgId = prof?.organization_id;
        if (!orgId) return Response.json({ error: "No organization" }, { status: 400 });
        const { data: members } = await me.supabase
          .from("ct_profiles")
          .select("user_id,name,email,created_at")
          .eq("organization_id", orgId)
          .order("name");
        // Roles of fellow members are only readable server-side.
        const ids = (members ?? []).map((m) => m.user_id);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: roles } = ids.length
          ? await supabaseAdmin.from("ct_user_roles").select("user_id,role").in("user_id", ids)
          : { data: [] };
        const roleOf = (id: string) => {
          const rs = (roles ?? []).filter((r) => r.user_id === id).map((r) => r.role as string);
          return rs.includes("ADMIN") ? "ADMIN" : rs.includes("LINGUIST") ? "LINGUIST" : "CLIENT";
        };
        return Response.json(
          (members ?? []).map((m) => ({
            id: m.user_id,
            name: m.name,
            email: m.email,
            role: roleOf(m.user_id),
            createdAt: m.created_at,
            clientAccountIds: [],
          })),
        );
      },
    },
  },
});
