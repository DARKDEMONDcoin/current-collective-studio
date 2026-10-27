import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { adminDb } from "@/lib/linguist.server";

const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(Boolean));
const score = (a: string, b: string) => {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((w) => B.has(w) && n++);
  return Math.round((2 * n * 100) / (A.size + B.size));
};

// Matches from the translation memories the client attached to this project.
export const Route = createFileRoute("/api/jobs/$id/tm-matches")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const q = (new URL(request.url).searchParams.get("sourceText") ?? "").slice(0, 2000);
        const db = await adminDb();
        const { data: job } = await db.from("ct_jobs").select("id,linguist_id,project:ct_projects(attached_tm_ids)").eq("id", params.id).maybeSingle();
        if (!job || job.linguist_id !== me.userId || !q) return Response.json([]);
        const tmIds = ((job.project as any)?.attached_tm_ids ?? []) as string[];
        if (!tmIds.length) return Response.json([]);
        const key = q.split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
        let query = db.from("ct_tm_entries").select("id,source_text,target_text").in("tm_id", tmIds).limit(200);
        if (key.length) query = query.or(key.map((k) => `source_text.ilike.%${k.replace(/[%,()]/g, "")}%`).join(","));
        const { data } = await query;
        const out = (data ?? [])
          .map((e) => ({ id: e.id, sourceText: e.source_text, targetText: e.target_text, matchScore: score(q, e.source_text) }))
          .filter((m) => m.matchScore >= 50)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 5);
        return Response.json(out);
      },
    },
  },
});
