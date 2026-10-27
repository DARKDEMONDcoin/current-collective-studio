import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb, linguistRole, loadJob, notify, poolVisible } from "@/lib/linguist.server";

// A Linguist takes an open job. The conditional update makes acceptance first-come, exactly once.
export const Route = createFileRoute("/api/jobs/$id/accept")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        if (!(await linguistRole(me.supabase, me.userId))) return Response.json({ message: "Forbidden" }, { status: 403 });
        const db = await adminDb();
        const job = await loadJob(db, params.id);
        if (!job || !(await poolVisible(db, job, me.userId)))
          return Response.json({ message: "Job is no longer available" }, { status: 409 });
        const { data: taken } = await db
          .from("ct_jobs")
          .update({ linguist_id: me.userId, status: "ACCEPTED", accepted_at: new Date().toISOString() })
          .eq("id", job.id)
          .in("status", ["AVAILABLE", "EXCLUSIVE"])
          .is("linguist_id", null)
          .select("id");
        if (!taken?.length) return Response.json({ message: "Job is no longer available" }, { status: 409 });
        await notify(db, me.userId, "task.assigned", "Job accepted", `You accepted "${job.project.name}" (${job.target_language}).`, `/portal/jobs/${job.id}/edit`);
        await notify(db, job.project.client_id, "project.linguist_assigned", "A Linguist started your project", `A Linguist accepted the ${job.target_language} job for "${job.project.name}".`, `/dashboard/projects/${job.project_id}`);
        return Response.json({ id: job.id, status: "ACCEPTED" });
      },
    },
  },
});
