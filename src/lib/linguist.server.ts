// Linguist-side rules shared by the portal server functions and /api/jobs/* routes.
// All reads/writes here use the service client, so every caller MUST first pass
// requireLinguist() and the per-job checks below.
/* eslint-disable @typescript-eslint/no-explicit-any */

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export async function adminDb(): Promise<Db> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Role check through the caller's own client (RLS: users read only their own role rows). */
export async function linguistRole(sb: any, userId: string): Promise<"LINGUIST" | "ADMIN" | null> {
  const { data } = await sb.from("ct_user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  return roles.includes("ADMIN") ? "ADMIN" : roles.includes("LINGUIST") ? "LINGUIST" : null;
}

const JOB_COLS =
  "id,project_id,linguist_id,status,linguist_source,exclusive_until,source_language,target_language,word_count,payout_amount,accepted_at,completed_at,submitted_at,review_note,revision_count,created_at," +
  "project:ct_projects(id,name,status,workflow_type,due_date,client_id,organization_id,notes,organization:ct_organizations(name))";

/** Whether this job is open for this Linguist to see/accept (pool rules). */
export async function poolVisible(db: Db, job: any, userId: string): Promise<boolean> {
  if (job.linguist_id || !["AVAILABLE", "EXCLUSIVE"].includes(job.status)) return false;
  const p = job.project;
  if (!p || !["AI_HUMAN", "HUMAN_ONLY"].includes(p.workflow_type) || p.status !== "IN_PROGRESS") return false;
  const [{ data: blocked }, { data: me }, { data: fav }] = await Promise.all([
    db.from("ct_linguist_blacklist").select("id").eq("organization_id", p.organization_id).eq("linguist_id", userId).limit(1),
    db.from("ct_profiles").select("organization_id").eq("user_id", userId).maybeSingle(),
    db.from("ct_favorite_linguists").select("id").eq("customer_id", p.client_id).eq("linguist_id", userId).limit(1),
  ]);
  if (blocked?.length) return false;
  if (job.linguist_source === "INTERNAL") return me?.organization_id === p.organization_id;
  // Preferred jobs without an explicit window stay with favourites for the admin-set number of hours.
  const { getSetting } = await import("./settings.server");
  const windowEnd = job.exclusive_until
    ? new Date(job.exclusive_until).getTime()
    : new Date(job.created_at).getTime() + (await getSetting("routing")).preferredWindowHours * 3600_000;
  const exclusive = windowEnd > Date.now();
  if ((job.linguist_source === "PREFERRED" || job.status === "EXCLUSIVE") && exclusive) return !!fav?.length;
  return true;
}

export async function loadJob(db: Db, id: string) {
  const { data } = await db.from("ct_jobs").select(JOB_COLS).eq("id", id).maybeSingle();
  return data as any;
}

/** Open jobs this Linguist may take. Bounded. */
export async function listPool(db: Db, userId: string, limit = 50) {
  const { data } = await db
    .from("ct_jobs")
    .select(JOB_COLS)
    .in("status", ["AVAILABLE", "EXCLUSIVE"])
    .is("linguist_id", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const out: any[] = [];
  for (const j of data ?? []) {
    if (out.length >= limit) break;
    if (await poolVisible(db, j, userId)) out.push(j);
  }
  return out;
}

export async function myJobs(db: Db, userId: string, statuses: string[], limit = 100) {
  const { data } = await db.from("ct_jobs").select(JOB_COLS).eq("linguist_id", userId).in("status", statuses).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as any[];
}

/** Recomputes the project status from its jobs: COMPLETED only when every job is. */
export async function syncProjectStatus(db: Db, projectId: string) {
  const { data: jobs } = await db.from("ct_jobs").select("status").eq("project_id", projectId);
  const live = (jobs ?? []).filter((j) => j.status !== "CANCELLED");
  if (live.length && live.every((j) => j.status === "COMPLETED")) {
    await db.from("ct_projects").update({ status: "COMPLETED" }).eq("id", projectId).eq("status", "IN_PROGRESS");
    return "COMPLETED";
  }
  return null;
}

export async function notify(db: Db, userId: string, event: string, title: string, body: string, link: string) {
  await db.from("ct_in_app_notifications").insert({ user_id: userId, event_key: event, title, body, link });
}

/** Camel-cased job in the shape the original portal views expect. */
export function shapeJob(j: any) {
  const p = j.project ?? {};
  return {
    id: j.id, projectId: j.project_id, linguistId: j.linguist_id, status: j.status,
    linguistSource: j.linguist_source, exclusiveUntil: j.exclusive_until,
    sourceLanguage: j.source_language, targetLanguage: j.target_language,
    wordCount: j.word_count ?? 0, payoutAmount: Number(j.payout_amount ?? 0),
    acceptedAt: j.accepted_at, completedAt: j.completed_at, submittedAt: j.submitted_at,
    reviewNote: j.review_note, revisionCount: j.revision_count ?? 0, createdAt: j.created_at,
    project: {
      id: p.id, name: p.name, status: p.status, workflowType: p.workflow_type, dueDate: p.due_date,
      clientId: p.client_id, notes: p.notes, sourceLanguage: j.source_language,
      organization: { name: p.organization?.name ?? "" }, client: { id: p.client_id, name: null },
    },
  };
}
