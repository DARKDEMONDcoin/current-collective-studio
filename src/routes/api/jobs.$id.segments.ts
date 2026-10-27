import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb } from "@/lib/linguist.server";
import { loadJobSegments } from "@/lib/job-segments.server";

// Segments + current translation for the editor. Assigned Linguist or the client's organization.
export const Route = createFileRoute("/api/jobs/$id/segments")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const db = await adminDb();
        const { data: job } = await db.from("ct_jobs").select("id,project_id,linguist_id").eq("id", params.id).maybeSingle();
        let allowed = !!job && job.linguist_id === me.userId;
        if (job && !allowed) allowed = !!(await me.supabase.from("ct_jobs").select("id").eq("id", job.id).maybeSingle()).data;
        if (!job || !allowed) return Response.json({ message: "Job not found" }, { status: 404 });
        const segments = await loadJobSegments(db, job.id, job.project_id);
        if (!segments.length)
          return Response.json({ segments: [], status: "pending", message: "No document has been attached to this project yet." });
        return Response.json({ segments, status: "ready", message: null }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
