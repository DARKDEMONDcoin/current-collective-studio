import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

export const Route = createFileRoute("/api/notifications/$id/read")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        await me.supabase
          .from("ct_in_app_notifications")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("id", params.id)
          .eq("user_id", me.userId);
        return Response.json({ ok: true });
      },
    },
  },
});
