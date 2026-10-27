import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb, notify, syncProjectStatus } from "@/lib/linguist.server";

// Client approves a delivered job -> COMPLETED. The project completes when all its jobs are.
export const Route = createFileRoute("/api/jobs/$id/approve")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        // RLS: only members of the project's organization can see this job.
        const { data: job } = await me.supabase.from("ct_jobs").select("id,project_id,status,linguist_id,target_language").eq("id", params.id).maybeSingle();
        if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
        const { data: mine } = await me.supabase.from("ct_projects").select("id,name").eq("id", job.project_id).maybeSingle();
        if (!mine) return Response.json({ error: "Forbidden" }, { status: 403 });
        if (job.status !== "SUBMITTED") return Response.json({ error: "Only delivered work can be approved." }, { status: 409 });
        const db = await adminDb();
        const { data: moved } = await db.from("ct_jobs").update({ status: "COMPLETED", completed_at: new Date().toISOString(), review_note: null })
          .eq("id", job.id).eq("status", "SUBMITTED").select("id");
        if (!moved?.length) return Response.json({ error: "Only delivered work can be approved." }, { status: 409 });
        await db.from("ct_segment_translations").update({ status: "APPROVED" }).eq("job_id", job.id);
        const projectStatus = await syncProjectStatus(db, job.project_id);
        if (job.linguist_id)
          await notify(db, job.linguist_id, "task.approved", "Your work was approved", `The client approved your ${job.target_language} translation of "${mine.name}".`, `/portal/assignments`);
        return Response.json({ ok: true, status: "COMPLETED", projectStatus });
      },
    },
  },
});
