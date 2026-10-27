import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb } from "@/lib/linguist.server";
import { editableJob, loadJobSegments } from "@/lib/job-segments.server";

// AI suggestion for one segment (segmentId) or for up to 40 segments still missing a translation.
export const Route = createFileRoute("/api/jobs/$id/retranslate")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const body = await request.json().catch(() => ({}));
        const db = await adminDb();
        const job = await editableJob(db, params.id, me.userId);
        if (!job) return Response.json({ error: "This job is not editable." }, { status: 403 });
        const segs = await loadJobSegments(db, job.id, job.project_id);
        const pick = typeof body?.segmentId === "string"
          ? segs.filter((s) => s.id === body.segmentId)
          : segs.filter((s) => !s.translatedText).slice(0, 40);
        if (!pick.length) return Response.json({ translated: 0 });
        const { translateBatch } = await import("@/lib/ai.server");
        try {
          const out = await translateBatch(pick.map((s) => s.sourceText), job.source_language, job.target_language, {});
          await db.from("ct_segment_translations").upsert(
            pick.map((s, i) => ({ segment_id: s.id, job_id: job.id, target_text: out[i], status: "TRANSLATED" })),
            { onConflict: "segment_id,job_id" },
          );
          return Response.json({ translated: pick.length, segments: pick.map((s, i) => ({ id: s.id, translatedText: out[i] })) });
        } catch (e) {
          console.error("[retranslate]", e);
          return Response.json({ error: "AI suggestion failed. Please try again." }, { status: 502 });
        }
      },
    },
  },
});
