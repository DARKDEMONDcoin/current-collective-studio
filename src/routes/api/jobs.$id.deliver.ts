import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

const MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};

// Download a job's translation. ?format=docx|pdf|pptx
//  docx: original Word file with translated text (layout kept) or a clean Word file
//  pptx: original PowerPoint with translated text (only when the source was a .pptx)
//  pdf : real PDF with the translated text
export const Route = createFileRoute("/api/jobs/$id/deliver")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const format = (new URL(request.url).searchParams.get("format") ?? "docx").toLowerCase();
        if (!MIME[format]) return Response.json({ error: "Unknown format" }, { status: 400 });
        // RLS: only the project's organization or the assigned Linguist can see the job.
        const { data: job } = await me.supabase
          .from("ct_jobs")
          .select("id,status,linguist_id,target_language,project_id,project:ct_projects(name)")
          .eq("id", params.id)
          .maybeSingle();
        if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
        const isLinguist = job.linguist_id === me.userId;
        if (job.status !== "COMPLETED" && !isLinguist)
          return Response.json({ error: "The translation is not ready yet." }, { status: 409 });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        // Access verified above; read segment text + original file with the service client.
        const { data: docs } = await db.from("ct_documents").select("id,original_filename,original_file_url,file_type").eq("project_id", job.project_id).order("created_at");
        const doc = docs?.[0];
        const rows: { target_text: string | null; segment: any }[] = [];
        for (let from = 0; ; from += 1000) {
          const { data } = await db
            .from("ct_segment_translations")
            .select("target_text, segment:ct_segments(segment_index, source_text, format_hint)")
            .eq("job_id", job.id)
            .range(from, from + 999);
          rows.push(...((data ?? []) as any));
          if (!data || data.length < 1000) break;
        }
        const pairs = rows
          .filter((r) => r.target_text && r.segment)
          .sort((a, b) => a.segment.segment_index - b.segment.segment_index)
          .map((r) => ({ source: r.segment.source_text as string, target: r.target_text as string, hint: (r.segment.format_hint as string) ?? "p" }));
        if (pairs.length === 0) return Response.json({ error: "The translation is not ready yet." }, { status: 409 });

        const ex = await import("@/lib/doc-export.server");
        const rtl = ex.isRtl(job.target_language);
        const base = String((job.project as any)?.name ?? "translation").replace(/[^\w\- ]+/g, "").trim() || "translation";
        const srcType = String(doc?.file_type ?? "").toLowerCase();
        const stored = doc?.original_file_url && doc.original_file_url !== "#" ? doc.original_file_url : null;
        const loadOriginal = async () => {
          if (!stored) return null;
          const { data } = await db.storage.from("ct-originals").download(stored);
          return data ? new Uint8Array(await data.arrayBuffer()) : null;
        };

        let bytes: Uint8Array;
        try {
          if (format === "pptx") {
            if (srcType !== "pptx") return Response.json({ error: "PowerPoint download is only available for PowerPoint source files." }, { status: 400 });
            const orig = await loadOriginal();
            if (!orig) return Response.json({ error: "The original PowerPoint file is no longer available." }, { status: 410 });
            bytes = ex.translatePptx(orig, pairs, rtl).bytes;
          } else if (format === "docx") {
            const orig = srcType === "docx" ? await loadOriginal() : null;
            bytes = orig ? ex.translateDocx(orig, pairs, rtl).bytes : ex.buildDocx(pairs, rtl);
          } else {
            bytes = await ex.buildPdf(pairs, rtl, base);
          }
        } catch (e) {
          if (e instanceof ex.PdfScriptUnsupported)
            return Response.json({ error: "PDF download is not available for this language yet. Please download the Word file." }, { status: 422 });
          console.error("[deliver] build failed", e);
          return Response.json({ error: "Could not build the file. Please try again." }, { status: 500 });
        }
        const name = `${base}_${job.target_language}.${format}`;
        return new Response(bytes as BodyInit, {
          headers: { "Content-Type": MIME[format], "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
