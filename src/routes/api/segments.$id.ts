import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb } from "@/lib/linguist.server";
import { editableJob } from "@/lib/job-segments.server";

const STATUSES = ["IN_PROGRESS", "TRANSLATED", "REVIEWED"];

// Linguist saves one segment of their job.
export const Route = createFileRoute("/api/segments/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const body = await request.json().catch(() => null);
        if (!body || typeof body.jobId !== "string") return Response.json({ error: "jobId is required" }, { status: 400 });
        const text = String(body.translatedText ?? "").slice(0, 20000);
        const status = STATUSES.includes(body.status) ? body.status : text.trim() ? "TRANSLATED" : "IN_PROGRESS";
        const db = await adminDb();
        const job = await editableJob(db, body.jobId, me.userId);
        if (!job) return Response.json({ error: "This job is not editable." }, { status: 403 });
        const { data: seg } = await db.from("ct_segments").select("id, document:ct_documents(project_id)").eq("id", params.id).maybeSingle();
        if (!seg || (seg.document as any)?.project_id !== job.project_id) return Response.json({ error: "Segment not found" }, { status: 404 });
        const { error } = await db.from("ct_segment_translations").upsert(
          { segment_id: seg.id, job_id: job.id, target_text: text, status },
          { onConflict: "segment_id,job_id" },
        );
        if (error) return Response.json({ error: "Could not save" }, { status: 500 });
        if (job.status === "ACCEPTED") await db.from("ct_jobs").update({ status: "IN_PROGRESS" }).eq("id", job.id).eq("status", "ACCEPTED");
        return Response.json({ id: seg.id, translatedText: text, status });
      },
    },
  },
});
