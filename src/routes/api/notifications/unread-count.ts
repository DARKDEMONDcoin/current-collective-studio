import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

export const Route = createFileRoute("/api/notifications/unread-count")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const { count } = await me.supabase
          .from("ct_in_app_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", me.userId)
          .eq("is_read", false);
        return Response.json({ count: count ?? 0 });
      },
    },
  },
});
