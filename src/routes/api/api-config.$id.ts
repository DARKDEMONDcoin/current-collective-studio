import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

export const Route = createFileRoute("/api/api-config/$id")({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        return Response.json({ ok: true });
      },
    },
  },
});
