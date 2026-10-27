import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

// Bring-your-own AI keys are not offered yet: storing customer provider keys needs a secure vault.
// Lists stay empty and saving returns a clear message.
export const Route = createFileRoute("/api/api-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        return Response.json([]);
      },
      POST: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        return Response.json({ error: "Using your own AI provider keys is not available yet. All translations run on Contentech's built-in AI." }, { status: 501 });
      },
    },
  },
});
