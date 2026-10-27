import { createFileRoute } from "@tanstack/react-router";
import { zipSync, strToU8 } from "fflate";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildDocx(paragraphs: { text: string; hint: string }[], rtl: boolean) {
  const body = paragraphs
    .map(({ text, hint }) => {
      const h = hint.match(/^h(\d)$/)?.[1];
      const pPr = `<w:pPr>${h ? `<w:pStyle w:val="Heading${h}"/>` : ""}${rtl ? "<w:bidi/>" : ""}</w:pPr>`;
      return `<w:p>${pPr}<w:r>${rtl ? "<w:rPr><w:rtl/></w:rPr>" : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
    })
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  });
}

const RTL = ["ar", "he", "fa", "ur", "arabic", "hebrew", "persian", "urdu"];

// Download a job's translation as a Word document (all formats are delivered as DOCX for now).
export const Route = createFileRoute("/api/jobs/$id/deliver")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        // RLS: only the project's organization or the assigned Linguist can see the job.
        const { data: job } = await me.supabase
          .from("ct_jobs")
          .select("id,target_language,project:ct_projects(name)")
          .eq("id", params.id)
          .maybeSingle();
        if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
        const { data: rows } = await me.supabase
          .from("ct_segment_translations")
          .select("target_text, segment:ct_segments(segment_index, format_hint)")
          .eq("job_id", job.id);
        const paras = (rows ?? [])
          .filter((r) => r.target_text && r.segment)
          .sort((a, b) => (a.segment as any).segment_index - (b.segment as any).segment_index)
          .map((r) => ({ text: r.target_text as string, hint: (r.segment as any).format_hint as string }));
        if (paras.length === 0)
          return Response.json({ error: "The translation is not ready yet." }, { status: 409 });
        const rtl = RTL.includes(String(job.target_language).toLowerCase());
        const bytes = buildDocx(paras, rtl);
        const name = `${String((job.project as any)?.name ?? "translation").replace(/[^\w\- ]+/g, "")}_${job.target_language}.docx`;
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${name}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
