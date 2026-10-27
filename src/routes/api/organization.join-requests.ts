import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

export const Route = createFileRoute("/api/organization/join-requests")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const [{ data: prof }, { data: roles }] = await Promise.all([
          me.supabase.from("ct_profiles").select("organization_id").eq("user_id", me.userId).maybeSingle(),
          me.supabase.from("ct_user_roles").select("role").eq("user_id", me.userId),
        ]);
        const orgId = prof?.organization_id;
        if (!orgId) return Response.json({ error: "No organization" }, { status: 403 });
        const rs = (roles ?? []).map((r) => r.role as string);
        if (!rs.includes("CLIENT") && !rs.includes("ADMIN"))
          return Response.json({ error: "Insufficient permissions" }, { status: 403 });
        const { requestId, action } = (await request.json().catch(() => ({}))) as {
          requestId?: string;
          action?: string;
        };
        if (!requestId || !["APPROVED", "REJECTED"].includes(action ?? ""))
          return Response.json({ error: "Invalid request" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: jr } = await supabaseAdmin
          .from("ct_join_requests")
          .select("id,organization_id,user_id,status")
          .eq("id", requestId)
          .maybeSingle();
        if (!jr || jr.organization_id !== orgId || jr.status !== "PENDING")
          return Response.json({ error: "Not found" }, { status: 404 });
        await supabaseAdmin.from("ct_join_requests").update({ status: action }).eq("id", requestId);
        if (action === "APPROVED")
          await supabaseAdmin.from("ct_profiles").update({ organization_id: orgId }).eq("user_id", jr.user_id);
        return Response.json({ success: true });
      },
    },
  },
});
