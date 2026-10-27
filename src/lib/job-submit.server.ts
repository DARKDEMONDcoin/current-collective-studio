import { adminDb, notify } from "@/lib/linguist.server";
import { loadJobSegments } from "@/lib/job-segments.server";

/** Linguist hands in the job. Every segment must have a translation; the client then approves. */
export async function submitJob(jobId: string, userId: string): Promise<Response> {
  const db = await adminDb();
  const { data: job } = await db.from("ct_jobs").select("id,project_id,status,linguist_id,target_language,project:ct_projects(name,client_id)").eq("id", jobId).maybeSingle();
  if (!job) return Response.json({ message: "Job not found" }, { status: 404 });
  if (job.linguist_id !== userId) return Response.json({ message: "Forbidden" }, { status: 403 });
  if (!["ACCEPTED", "IN_PROGRESS"].includes(job.status)) return Response.json({ message: "This job was already submitted." }, { status: 409 });
  const segs = await loadJobSegments(db, job.id, job.project_id);
  const missing = segs.filter((s) => !String(s.translatedText ?? "").trim()).length;
  if (!segs.length || missing)
    return Response.json({ message: `${missing || "All"} segment(s) still need a translation before you can submit.` }, { status: 409 });
  const { data: moved } = await db
    .from("ct_jobs")
    .update({ status: "SUBMITTED", submitted_at: new Date().toISOString() })
    .eq("id", job.id).eq("linguist_id", userId).in("status", ["ACCEPTED", "IN_PROGRESS"]).select("id");
  if (!moved?.length) return Response.json({ message: "This job was already submitted." }, { status: 409 });
  await db.from("ct_segment_translations").update({ status: "REVIEWED" }).eq("job_id", job.id);
  const p = job.project as any;
  await notify(db, p.client_id, "task.delivered", "Translation ready for your approval",
    `The ${job.target_language} translation of "${p.name}" was delivered. Please review and approve it.`, `/dashboard/projects/${job.project_id}`);
  return Response.json({ message: "Submitted for client approval", status: "SUBMITTED" });
}
