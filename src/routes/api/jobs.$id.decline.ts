import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb } from "@/lib/linguist.server";

// Assigned Linguist returns a job to the pool (only before submitting it).
export const Route = createFileRoute("/api/jobs/$id/decline")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const db = await adminDb();
        const { data } = await db
          .from("ct_jobs")
          .update({ linguist_id: null, status: "AVAILABLE", accepted_at: null })
          .eq("id", params.id)
          .eq("linguist_id", me.userId)
          .in("status", ["ACCEPTED", "IN_PROGRESS"])
          .select("id");
        return Response.json({ message: data?.length ? "Job returned to the pool." : "Job declined — it will remain in the pool." });
      },
    },
  },
});
