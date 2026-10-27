import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

// Review issue tracking is not available yet; the editor shows an empty list.
export const Route = createFileRoute("/api/jobs/$id/issues")({
  server: { handlers: { GET: async ({ request }) => ((await requireApiUser(request)) ? Response.json([]) : unauthorized()) } },
});
