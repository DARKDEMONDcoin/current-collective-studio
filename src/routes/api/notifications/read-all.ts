import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

export const Route = createFileRoute("/api/notifications/read-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        await me.supabase
          .from("ct_in_app_notifications")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("user_id", me.userId)
          .eq("is_read", false);
        return Response.json({ ok: true });
      },
    },
  },
});
