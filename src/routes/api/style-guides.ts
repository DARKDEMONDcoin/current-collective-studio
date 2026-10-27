import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

// Placeholder until this feature is migrated (see roadmap.md): returns an empty list.
export const Route = createFileRoute("/api/style-guides")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        return Response.json([]);
      },
    },
  },
});
