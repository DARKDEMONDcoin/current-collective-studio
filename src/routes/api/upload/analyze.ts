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
        try {
          if (["txt", "md", "csv"].includes(ext)) segments = parsePlainText(new TextDecoder().decode(buf));
          else if (ext === "docx") segments = parseDocx(buf);
          else if (ext === "pdf") {
            const r = await parsePdf(buf);
            segments = r.segments;
            pageCount = r.pages;
          } else
            return Response.json(
              { error: "Unsupported file type. Please upload a PDF, DOCX, or TXT file." },
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
                  ? "This PDF has no selectable text (it may be a scan). Scanned documents are not supported yet."
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
          scanned: false,
          ocrConfidence: null,
          sourceMimeType: file.type || null,
        });
      },
    },
  },
});
