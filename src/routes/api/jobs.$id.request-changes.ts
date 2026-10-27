import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb, notify } from "@/lib/linguist.server";

// Client sends delivered work back to the Linguist with a note.
export const Route = createFileRoute("/api/jobs/$id/request-changes")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const body = await request.json().catch(() => ({}));
        const note = String(body?.note ?? "").trim().slice(0, 2000);
        if (!note) return Response.json({ error: "Please describe what needs to change." }, { status: 400 });
        const { data: job } = await me.supabase.from("ct_jobs").select("id,project_id,status,linguist_id,target_language,revision_count").eq("id", params.id).maybeSingle();
        if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
        const { data: mine } = await me.supabase.from("ct_projects").select("id,name").eq("id", job.project_id).maybeSingle();
        if (!mine) return Response.json({ error: "Forbidden" }, { status: 403 });
        if (job.status !== "SUBMITTED") return Response.json({ error: "Only delivered work can be sent back." }, { status: 409 });
        const db = await adminDb();
        const { data: moved } = await db.from("ct_jobs")
          .update({ status: "IN_PROGRESS", review_note: note, revision_count: (job.revision_count ?? 0) + 1, submitted_at: null })
          .eq("id", job.id).eq("status", "SUBMITTED").select("id");
        if (!moved?.length) return Response.json({ error: "Only delivered work can be sent back." }, { status: 409 });
        if (job.linguist_id)
          await notify(db, job.linguist_id, "task.changes_requested", "Changes requested", `The client asked for changes to "${mine.name}" (${job.target_language}): ${note.slice(0, 200)}`, `/portal/jobs/${job.id}/edit`);
        return Response.json({ ok: true, status: "IN_PROGRESS" });
      },
    },
  },
});
