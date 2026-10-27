import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb, linguistRole, loadJob, poolVisible, shapeJob } from "@/lib/linguist.server";

// Job details: the assigned Linguist, a Linguist the job is open to, or the client's organization.
export const Route = createFileRoute("/api/jobs/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const db = await adminDb();
        const job = await loadJob(db, params.id);
        if (!job) return Response.json({ error: "Not found" }, { status: 404 });
        let allowed = job.linguist_id === me.userId;
        if (!allowed && (await linguistRole(me.supabase, me.userId))) allowed = await poolVisible(db, job, me.userId);
        if (!allowed) {
          // Organization members can read their own jobs (RLS decides).
          const { data } = await me.supabase.from("ct_jobs").select("id").eq("id", params.id).maybeSingle();
          allowed = !!data;
        }
        if (!allowed) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json(shapeJob(job), { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
