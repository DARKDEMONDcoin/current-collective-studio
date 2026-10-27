import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

// Progress for the project page. Visible only to the project's organization (RLS).
// While the page is open each poll also advances processing a little, so orders move
// even between scheduler runs.
export const Route = createFileRoute("/api/projects/$id/progress")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const { data: p } = await me.supabase
          .from("ct_projects")
          .select("id,status,progress_done,progress_total,attempts,last_error,failure_reason")
          .eq("id", params.id)
          .maybeSingle();
        if (!p) return Response.json({ error: "Not found" }, { status: 404 });
        let status = p.status, done = p.progress_done, total = p.progress_total;
        if (status === "PENDING" || status === "PROCESSING") {
          const { processProject } = await import("@/lib/order-pipeline.server");
          const r = await processProject(p.id, 15_000);
          status = r.status; done = r.done || done; total = r.total || total;
        }
        return Response.json(
          { status, done, total, retrying: (p.attempts ?? 0) > 0 && status === "PROCESSING", failureReason: status === "FAILED" ? "AI translation failed; credits were refunded." : null },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
