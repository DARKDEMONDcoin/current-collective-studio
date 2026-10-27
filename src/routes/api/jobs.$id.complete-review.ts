import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { submitJob } from "@/lib/job-submit.server";

export const Route = createFileRoute("/api/jobs/$id/complete-review")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        return submitJob(params.id, me.userId);
      },
    },
  },
});
