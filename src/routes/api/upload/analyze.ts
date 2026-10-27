import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

const MAX_BYTES = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/upload/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Invalid form data" }, { status: 400 });
        }
        const file = form.get("file");
        if (!(file instanceof File)) return Response.json({ error: "No file provided" }, { status: 400 });
        if (file.size > MAX_BYTES)
          return Response.json({ error: "File is too large (max 20 MB)." }, { status: 413 });

        const { parsePlainText, parseDocx, parsePdf, countWords, detectLanguage } = await import(
          "@/lib/doc-parse.server"
        );
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const buf = new Uint8Array(await file.arrayBuffer());
        let segments: { text: string; formatHint: string }[] = [];
        let pageCount = 0;
        let scanned = false;
        const ocr = async (mime: string) => {
          const { ocrDocument } = await import("@/lib/ai.server");
          const text = await ocrDocument(buf, file.name, mime);
          scanned = true;
          return parsePlainText(text);
        };
        try {
          if (["txt", "md", "csv"].includes(ext)) segments = parsePlainText(new TextDecoder().decode(buf));
          else if (ext === "docx") segments = parseDocx(buf);
          else if (ext === "pdf") {
            const r = await parsePdf(buf);
            segments = r.segments;
            pageCount = r.pages;
            // Little or no selectable text -> treat as a scan and read it with AI OCR.
            if (countWords(segments.map((x) => x.text).join(" ")) < 5 * Math.max(1, pageCount))
              segments = await ocr("application/pdf");
          } else if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
            segments = await ocr(ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
            pageCount = 1;
          } else
            return Response.json(
              { error: "Unsupported file type. Please upload a PDF, DOCX, TXT, or image (JPG/PNG) file." },
              { status: 415 },
            );
        } catch (e) {
          console.error("[analyze] parse failed", e);
          return Response.json({ error: "Could not read that file." }, { status: 500 });
        }
        if (segments.length === 0)
          return Response.json(
            {
              error:
                ext === "pdf"
                  ? "We could not find any readable text in this PDF, even after scanning it."
                  : "No text found in the document.",
            },
            { status: 422 },
          );
        const allText = segments.map((s) => s.text).join(" ");
        return Response.json({
          filename: file.name,
          wordCount: countWords(allText),
          sourceLanguage: detectLanguage(allText),
          docType: "General Document",
          segments,
          segmentCount: segments.length,
          pageCount,
          scanned,
          ocrConfidence: null,
          sourceMimeType: file.type || null,
        });
      },
    },
  },
});
