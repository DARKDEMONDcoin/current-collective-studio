// Resumable order execution. Each call processes as many segments as fit in `budgetMs`
// and stops; the next call (order POST, project-page poll, or the 1-minute scheduler)
// continues where it left off. Progress lives in the database, so nobody has to keep a
// page open.
//
//  CREDITS / BYOK  -> AI translates every segment for each job -> jobs + project COMPLETED
//  AI_HUMAN        -> AI draft for each job -> project IN_PROGRESS, jobs open for Linguists
//  HUMAN_ONLY      -> nothing here; project IN_PROGRESS, jobs wait in the Linguist pool
//
// Safety: a lease row lock (lease_until) means only one worker runs per project; finished
// segments are upserted per batch so retries never redo/double work; transient failures
// retry with backoff up to MAX_ATTEMPTS, then the project is refunded once (ct_refund_project).
import { translateBatch } from "@/lib/ai.server";
import { loadTranslationContext, tmLookup, relevantTerms, checkSegment } from "@/lib/translation-context.server";

const BATCH = 40;
const LEASE_MS = 90_000;
export const MAX_ATTEMPTS = 3;

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
export type StepResult = { status: string; done: number; total: number; refunded?: number; error?: string };

async function notify(db: Db, userId: string, event: string, title: string, body: string, link: string, priority?: string) {
  await db.from("ct_in_app_notifications").insert({ user_id: userId, event_key: event, title, body, link, ...(priority ? { priority } : {}) });
}

/** Errors that will never succeed on retry (account / policy / refusal). */
function isTerminal(msg: string) {
  return /\b(402|403|400)\b|refus|denied|not enabled|credit/i.test(msg);
}

export async function processProject(projectId: string, budgetMs = 20_000): Promise<StepResult> {
  const started = Date.now();
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: project } = await db
    .from("ct_projects")
    .select("id,name,client_id,organization_id,workflow_type,source_language,status,attempts,progress_done,progress_total,next_attempt_at,notes,attached_glossary_ids,attached_tm_ids,attached_style_guide_ids")
    .eq("id", projectId)
    .single();
  if (!project) return { status: "MISSING", done: 0, total: 0 };
  const wf = project.workflow_type;
  const needsAI = wf === "CREDITS" || wf === "BYOK" || wf === "AI_HUMAN";
  if (!["PENDING", "PROCESSING"].includes(project.status))
    return { status: project.status, done: project.progress_done, total: project.progress_total };
  if (new Date(project.next_attempt_at).getTime() > Date.now())
    return { status: project.status, done: project.progress_done, total: project.progress_total };

  if (!needsAI) {
    await db.from("ct_projects").update({ status: "IN_PROGRESS" }).eq("id", projectId).eq("status", "PENDING");
    return { status: "IN_PROGRESS", done: 0, total: 0 };
  }

  // Acquire the lease (single worker per project).
  const now = new Date();
  const { data: leased } = await db
    .from("ct_projects")
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString(), status: "PROCESSING" })
    .eq("id", projectId)
    .in("status", ["PENDING", "PROCESSING"])
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("id");
  if (!leased?.length) return { status: "PROCESSING", done: project.progress_done, total: project.progress_total };

  try {
    const [{ data: org }, { data: docs }, { data: jobs }] = await Promise.all([
      db.from("ct_organizations").select("industry,company_bio").eq("id", project.organization_id).single(),
      db.from("ct_documents").select("id").eq("project_id", projectId),
      db.from("ct_jobs").select("id,target_language").eq("project_id", projectId).neq("status", "CANCELLED"),
    ]);
    const docIds = (docs ?? []).map((d) => d.id);
    const segments: { id: string; source_text: string }[] = [];
    for (let from = 0; docIds.length; from += 1000) {
      const { data } = await db.from("ct_segments").select("id,source_text").in("document_id", docIds).order("segment_index").range(from, from + 999);
      segments.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const total = segments.length * (jobs ?? []).length;
    let done = 0;
    let outOfTime = false;

    for (const job of jobs ?? []) {
      const finished = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data } = await db.from("ct_segment_translations").select("segment_id").eq("job_id", job.id).range(from, from + 999);
        (data ?? []).forEach((r) => finished.add(r.segment_id));
        if (!data || data.length < 1000) break;
      }
      done += finished.size;
      const todo = segments.filter((s) => !finished.has(s.id));
      const tctx = todo.length ? await loadTranslationContext(db, project as any, job.target_language) : null;
      for (let i = 0; i < todo.length; i += BATCH) {
        if (Date.now() - started > budgetMs) { outOfTime = true; break; }
        const chunk = todo.slice(i, i + BATCH);
        const out = await translateChunk(chunk.map((s) => s.source_text), project.source_language, job.target_language, tctx!, {
          industry: org?.industry,
          companyBio: org?.company_bio,
        });
        const { error } = await db.from("ct_segment_translations").upsert(
          chunk.map((s, k) => ({ segment_id: s.id, job_id: job.id, target_text: out[k], status: "TRANSLATED" })),
          { onConflict: "segment_id,job_id" },
        );
        if (error) throw new Error(error.message);
        done += chunk.length;
        await db.from("ct_projects").update({ progress_done: done, progress_total: total, lease_until: new Date(Date.now() + LEASE_MS).toISOString() }).eq("id", projectId);
      }
      if (outOfTime) break;
    }

    if (outOfTime) {
      await db.from("ct_projects").update({ progress_done: done, progress_total: total, lease_until: null, attempts: 0, last_error: null }).eq("id", projectId);
      return { status: "PROCESSING", done, total };
    }

    // All segments translated for every job.
    if (segments.length) await db.from("ct_segments").update({ status: "TRANSLATED" }).in("document_id", docIds);
    if (docIds.length) await db.from("ct_documents").update({ processing_status: "COMPLETED" }).in("id", docIds);
    const pureAI = wf !== "AI_HUMAN";
    if (pureAI)
      await db.from("ct_jobs").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("project_id", projectId).neq("status", "CANCELLED");
    const finalStatus = pureAI ? "COMPLETED" : "IN_PROGRESS";
    await db.from("ct_projects").update({ status: finalStatus, progress_done: total, progress_total: total, lease_until: null, last_error: null }).eq("id", projectId);
    await notify(
      db, project.client_id,
      pureAI ? "project.completed" : "project.ai_draft_ready",
      pureAI ? "Translation ready" : "AI draft ready",
      pureAI ? `"${project.name}" has been translated and is ready to download.` : `The AI draft for "${project.name}" is done. Linguists can now pick up the review.`,
      `/dashboard/projects/${projectId}`,
    );
    return { status: finalStatus, done: total, total };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("[pipeline] step failed", projectId, reason);
    const attempts = (project.attempts ?? 0) + 1;
    if (attempts < MAX_ATTEMPTS && !isTerminal(reason)) {
      const backoff = 60_000 * 2 ** (attempts - 1);
      await db.from("ct_projects").update({
        attempts, last_error: reason.slice(0, 500), lease_until: null,
        next_attempt_at: new Date(Date.now() + backoff).toISOString(),
      }).eq("id", projectId);
      return { status: "PROCESSING", done: project.progress_done, total: project.progress_total, error: "retrying" };
    }
    return failProject(db, project, reason, attempts);
  }
}

async function failProject(db: Db, project: { id: string; name: string; client_id: string }, reason: string, attempts: number): Promise<StepResult> {
  const { data: refunded } = await db.rpc("ct_refund_project", { _project: project.id, _reason: reason.slice(0, 500) });
  await db.from("ct_projects").update({ attempts, last_error: reason.slice(0, 500), lease_until: null }).eq("id", project.id);
  await notify(
    db, project.client_id, "project.failed", "Order could not be completed",
    `"${project.name}" failed during AI translation. ${refunded ? `${refunded} credits were refunded.` : ""}`.trim(),
    `/dashboard/projects/${project.id}`, "high",
  );
  return { status: "FAILED", done: 0, total: 0, refunded: (refunded as number) ?? 0, error: reason };
}

/** Picks up queued projects (used by the scheduler). Bounded per run. */
export async function processQueue(maxProjects = 3, budgetMs = 45_000) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db
    .from("ct_projects")
    .select("id")
    .in("status", ["PENDING", "PROCESSING"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at")
    .limit(maxProjects);
  const results: Record<string, StepResult> = {};
  const started = Date.now();
  for (const p of data ?? []) {
    const left = budgetMs - (Date.now() - started);
    if (left < 5_000) break;
    results[p.id] = await processProject(p.id, left - 3_000);
  }
  return results;
}

// Back-compat name used by older imports.
export const runOrderPipeline = (id: string) => processProject(id);

const LATIN = /^(english|french|german|spanish|italian|portuguese|dutch|swedish|norwegian|danish|polish|romanian|turkish|indonesian|malay)/i;

/** TM exact matches are reused verbatim; the rest goes to AI with glossary/style
 *  context, then each output is validated and failing segments get one corrective pass. */
export async function translateChunk(texts: string[], source: string, target: string, ctx: Awaited<ReturnType<typeof loadTranslationContext>>, org: { industry?: string | null; companyBio?: string | null }) {
  const out: string[] = texts.map((t) => tmLookup(ctx, t) ?? "");
  const idx = texts.map((_, i) => i).filter((i) => !out[i]);
  if (!idx.length) return out;
  const sub = idx.map((i) => texts[i]);
  const terms = relevantTerms(ctx, sub);
  const base = { ...org, glossary: terms, style: ctx.style, notes: ctx.notes };
  const first = await translateBatch(sub, source, target, base);
  const sameScript = LATIN.test(source) && LATIN.test(target);
  const fb = sub.map((t, k) => {
    const issues = checkSegment(t, first[k], terms, sameScript, target);
    return issues.length ? issues.join("; ") : null;
  });
  const bad = fb.map((f, k) => (f ? k : -1)).filter((k) => k >= 0);
  if (bad.length && (await (await import("@/lib/settings.server")).getSetting("ai")).correctivePass) {
    try {
      const fixed = await translateBatch(bad.map((k) => sub[k]), source, target, { ...base, feedback: bad.map((k) => fb[k]) });
      bad.forEach((k, j) => {
        const before = checkSegment(sub[k], first[k], terms, sameScript, target).length;
        const after = checkSegment(sub[k], fixed[j], terms, sameScript, target).length;
        if (fixed[j]?.trim() && after <= before) first[k] = fixed[j];
      });
    } catch (e) {
      console.warn("[pipeline] corrective pass failed", e instanceof Error ? e.message : e);
    }
  }
  idx.forEach((i, k) => (out[i] = first[k]));
  return out;
}
