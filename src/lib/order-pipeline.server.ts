// Order execution after a project is created:
//  CREDITS / BYOK  -> AI translates every segment for each job -> jobs + project COMPLETED
//  AI_HUMAN        -> AI draft for each job -> project IN_PROGRESS (jobs stay open for Linguists)
//  HUMAN_ONLY      -> nothing here; jobs wait in the Linguist pool
// Any AI failure refunds the project's credits once (ct_refund_project) and marks it FAILED.
import { translateBatch } from "@/lib/ai.server";

const BATCH = 40;

export async function runOrderPipeline(projectId: string): Promise<{ ok: true } | { ok: false; refunded: number; reason: string }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: project } = await db
    .from("ct_projects")
    .select("id,name,client_id,organization_id,workflow_type,source_language,status")
    .eq("id", projectId)
    .single();
  if (!project) return { ok: false, refunded: 0, reason: "Project not found" };
  const wf = project.workflow_type;
  const needsAI = wf === "CREDITS" || wf === "BYOK" || wf === "AI_HUMAN";
  if (!needsAI || project.status !== "PENDING") return { ok: true };

  try {
    const [{ data: org }, { data: docs }, { data: jobs }] = await Promise.all([
      db.from("ct_organizations").select("industry,company_bio").eq("id", project.organization_id).single(),
      db.from("ct_documents").select("id").eq("project_id", projectId),
      db.from("ct_jobs").select("id,target_language").eq("project_id", projectId),
    ]);
    const docIds = (docs ?? []).map((d) => d.id);
    const { data: segs } = docIds.length
      ? await db.from("ct_segments").select("id,source_text").in("document_id", docIds).order("segment_index")
      : { data: [] };
    const segments = segs ?? [];

    for (const job of jobs ?? []) {
      for (let i = 0; i < segments.length; i += BATCH) {
        const chunk = segments.slice(i, i + BATCH);
        const out = await translateBatch(
          chunk.map((s) => s.source_text),
          project.source_language,
          job.target_language,
          { industry: org?.industry, companyBio: org?.company_bio },
        );
        const { error } = await db.from("ct_segment_translations").upsert(
          chunk.map((s, k) => ({ segment_id: s.id, job_id: job.id, target_text: out[k], status: "TRANSLATED" })),
          { onConflict: "segment_id,job_id" },
        );
        if (error) throw new Error(error.message);
      }
    }

    if (segments.length) await db.from("ct_segments").update({ status: "TRANSLATED" }).in("document_id", docIds);
    if (docIds.length) await db.from("ct_documents").update({ processing_status: "COMPLETED" }).in("id", docIds);
    const pureAI = wf !== "AI_HUMAN";
    if (pureAI) {
      await db.from("ct_jobs").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("project_id", projectId);
    }
    await db.from("ct_projects").update({ status: pureAI ? "COMPLETED" : "IN_PROGRESS" }).eq("id", projectId);
    await db.from("ct_in_app_notifications").insert({
      user_id: project.client_id,
      event_key: pureAI ? "project.completed" : "project.ai_draft_ready",
      title: pureAI ? "Translation ready" : "AI draft ready",
      body: pureAI
        ? `"${project.name}" has been translated and is ready to download.`
        : `The AI draft for "${project.name}" is done. Linguists will now review it.`,
      link: `/dashboard/projects/${projectId}`,
    });
    return { ok: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("[pipeline] failed", projectId, reason);
    const { data: refunded } = await db.rpc("ct_refund_project", { _project: projectId, _reason: reason });
    await db.from("ct_in_app_notifications").insert({
      user_id: project.client_id,
      event_key: "project.failed",
      title: "Order could not be completed",
      body: `"${project.name}" failed during AI translation. ${refunded ? `${refunded} credits were refunded.` : ""}`.trim(),
      link: `/dashboard/projects/${projectId}`,
      priority: "high",
    });
    return { ok: false, refunded: (refunded as number) ?? 0, reason };
  }
}
