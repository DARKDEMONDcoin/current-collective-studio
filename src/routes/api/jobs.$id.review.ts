import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx, short } from "@/lib/org-api";

// Rate the linguist who completed a job in your organization (1–5 stars, once per job).
export const Route = createFileRoute("/api/jobs/$id/review")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const rating = Number(b.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return jerr("Rating must be 1–5");
        const { data: job } = await ctx.supabase.from("ct_jobs").select("id,status,linguist_id,project:ct_projects(organization_id)").eq("id", params.id).maybeSingle();
        if (!job || (job as any).project?.organization_id !== ctx.orgId) return jerr("Job not found", 404);
        if (job.status !== "COMPLETED" || !job.linguist_id) return jerr("Only completed jobs with a linguist can be rated");
        const { error } = await ctx.supabase.from("ct_linguist_reviews").insert({
          job_id: job.id, organization_id: ctx.orgId, reviewer_id: ctx.userId, linguist_id: job.linguist_id, rating, comment: short(b.comment, 1000),
        });
        if (error) return jerr(error.code === "23505" ? "This job has already been rated" : "Could not save rating", error.code === "23505" ? 409 : 500);
        return Response.json({ ok: true });
      },
    },
  },
});
