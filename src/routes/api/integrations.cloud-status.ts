import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

// Which cloud file pickers have app keys configured (public client IDs only).
export const Route = createFileRoute("/api/integrations/cloud-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const e = process.env;
        return Response.json({
          dropbox: { configured: !!e.DROPBOX_APP_KEY, appKey: e.DROPBOX_APP_KEY ?? null },
          google_drive: { configured: !!(e.GOOGLE_PICKER_CLIENT_ID && e.GOOGLE_PICKER_API_KEY), clientId: e.GOOGLE_PICKER_CLIENT_ID ?? null, apiKey: e.GOOGLE_PICKER_API_KEY ?? null },
          onedrive: { configured: !!e.ONEDRIVE_CLIENT_ID, clientId: e.ONEDRIVE_CLIENT_ID ?? null },
        });
      },
    },
  },
});
