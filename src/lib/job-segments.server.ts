/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** All segments of a job's project, merged with this job's translation. Caller must be authorized. */
export async function loadJobSegments(db: Db, jobId: string, projectId: string) {
  const { data: docs } = await db.from("ct_documents").select("id").eq("project_id", projectId);
  const ids = (docs ?? []).map((d) => d.id);
  if (!ids.length) return [];
  const segs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("ct_segments").select("id,document_id,segment_index,source_text,format_hint").in("document_id", ids).order("segment_index").range(from, from + 999);
    segs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const tr = new Map<string, any>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("ct_segment_translations").select("segment_id,target_text,status").eq("job_id", jobId).range(from, from + 999);
    (data ?? []).forEach((r) => tr.set(r.segment_id, r));
    if (!data || data.length < 1000) break;
  }
  return segs.map((s) => ({
    id: s.id, documentId: s.document_id, segmentIndex: s.segment_index, sourceText: s.source_text, formatHint: s.format_hint,
    translatedText: tr.get(s.id)?.target_text ?? null, status: tr.get(s.id)?.status ?? "PENDING",
  }));
}

/** Verifies the caller is the assigned Linguist and the job is still editable. */
export async function editableJob(db: Db, jobId: string, userId: string) {
  const { data: job } = await db.from("ct_jobs").select("id,project_id,status,linguist_id,source_language,target_language").eq("id", jobId).maybeSingle();
  if (!job || job.linguist_id !== userId) return null;
  if (!["ACCEPTED", "IN_PROGRESS"].includes(job.status)) return null;
  return job;
}
