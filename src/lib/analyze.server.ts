// Server-side document analysis shared by the order wizard and OCR Requests.
// Any scan (AI OCR) is billed per page through ct_charge_ocr BEFORE results are
// returned, and logged as an OCR request, so OCR can never be used for free.
import type { OrgCtx } from "@/lib/org-api";

export const MAX_BYTES = 20 * 1024 * 1024;
const IMG = ["jpg", "jpeg", "png", "webp"];

export type AnalyzeOpts = { workflowType?: string; clientAccountId?: string | null; idempotencyKey?: string | null; testBilling?: boolean; forceOcr?: boolean };

export async function analyzeFile(ctx: OrgCtx, file: File, opts: AnalyzeOpts = {}) {
  const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => ({ ok: false as const, status, body: { error, ...extra } });
  if (file.size > MAX_BYTES) return fail("File is too large (max 20 MB).", 413);
  const { parsePlainText, parseDocx, parsePptx, parsePdf, countWords, detectLanguage } = await import("@/lib/doc-parse.server");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const buf = new Uint8Array(await file.arrayBuffer());
  let segments: { text: string; formatHint: string }[] = [];
  let pageCount = 0;
  let needOcr: string | null = null;
  try {
    if (["txt", "md", "csv"].includes(ext)) segments = parsePlainText(new TextDecoder().decode(buf));
    else if (ext === "docx") segments = parseDocx(buf);
    else if (ext === "pptx") segments = await parsePptx(buf);
    else if (ext === "pdf") {
      const r = await parsePdf(buf);
      segments = r.segments;
      pageCount = r.pages;
      if (opts.forceOcr || countWords(segments.map((x) => x.text).join(" ")) < 5 * Math.max(1, pageCount)) needOcr = "application/pdf";
    } else if (IMG.includes(ext)) {
      pageCount = 1;
      needOcr = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    } else return fail("Unsupported file type. Please upload a PDF, DOCX, PPTX, TXT, or image (JPG/PNG) file.", 415);
  } catch (e) {
    console.error("[analyze] parse failed", e);
    return fail("Could not read that file.", 500);
  }
  if (opts.forceOcr && !needOcr) return fail("OCR is only for scanned PDFs and images.", 415);

  let ocrRequestId: string | null = null, ocrCharged = 0;
  if (needOcr) {
    pageCount = Math.max(1, pageCount);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Pre-check so we don't run OCR for an org that can't pay (test accounts skip this inside the charge).
    const [{ data: org }, { data: rate }, { data: isTest }] = await Promise.all([
      supabaseAdmin.from("ct_organizations").select("credit_balance").eq("id", ctx.orgId).single(),
      supabaseAdmin.from("ct_credit_rates").select("credits_per_word").eq("workflow_type", "OCR_PAGE").maybeSingle(),
      supabaseAdmin.rpc("ct_is_test_user", { _user: ctx.userId }),
    ]);
    const need = Math.ceil(pageCount * Number(rate?.credits_per_word ?? 0));
    const free = !!isTest && !opts.testBilling;
    if (!free && (org?.credit_balance ?? 0) < need)
      return fail(`Scanning this document needs ${need} credits (${pageCount} page${pageCount > 1 ? "s" : ""}). Your balance is ${org?.credit_balance ?? 0}.`, 402, { code: "INSUFFICIENT_CREDITS", required: need, balance: org?.credit_balance ?? 0 });
    let text: string;
    try {
      const { ocrDocument } = await import("@/lib/ai.server");
      text = await ocrDocument(buf, file.name, needOcr);
    } catch (e) {
      console.error("[analyze] ocr failed", e);
      return fail("We could not scan this document. You have not been charged — please try again.", 502);
    }
    segments = parsePlainText(text);
    if (!segments.length) return fail("No readable text was found in this scan. You have not been charged.", 422);
    const all = segments.map((s) => s.text).join(" ");
    const { data: charged, error } = await supabaseAdmin.rpc("ct_charge_ocr", {
      _user: ctx.userId, _org: ctx.orgId,
      p: {
        pageCount, filename: file.name.slice(0, 200), name: file.name.slice(0, 200), mimeType: needOcr,
        sourceLanguage: detectLanguage(all), wordCount: countWords(all), extractedText: text.slice(0, 1_000_000),
        workflowType: opts.workflowType === "AI_HUMAN" ? "AI_HUMAN" : "AI_ONLY",
        clientAccountId: opts.clientAccountId ?? null, idempotencyKey: opts.idempotencyKey ?? null, testBilling: !!opts.testBilling,
      },
    });
    const r = charged as any;
    if (error || r?.error) {
      if (r?.error === "INSUFFICIENT_CREDITS") return fail(`Scanning needs ${r.required} credits; your balance is ${r.balance}.`, 402, { code: "INSUFFICIENT_CREDITS" });
      console.error("[analyze] charge failed", error ?? r);
      return fail("Could not record the scan charge. Please try again.", 500);
    }
    ocrRequestId = r.id;
    ocrCharged = r.charged ?? 0;
  }
  if (!segments.length) return fail(ext === "pdf" ? "We could not find any readable text in this PDF." : "No text found in the document.", 422);
  const allText = segments.map((s) => s.text).join(" ");
  // Keep the original so the translation can be delivered in the same format and layout.
  let storedPath: string | null = null;
  if (["docx", "pptx", "pdf"].includes(ext)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${ctx.orgId}/${crypto.randomUUID()}/${file.name.replace(/[^\w.\- ]+/g, "_").slice(-120)}`;
    const { error } = await supabaseAdmin.storage.from("ct-originals").upload(path, buf, { contentType: file.type || "application/octet-stream" });
    if (error) console.error("[analyze] original upload failed", error.message);
    else storedPath = path;
  }
  return {
    ok: true as const, status: 200,
    body: {
      filename: file.name, wordCount: countWords(allText), sourceLanguage: detectLanguage(allText), docType: "General Document",
      segments, segmentCount: segments.length, pageCount, scanned: !!needOcr, ocrConfidence: null,
      sourceMimeType: file.type || null, ocrRequestId, ocrCharged,
      docxStoredPath: ext === "docx" ? storedPath : null, pptxStoredPath: ext === "pptx" ? storedPath : null, pdfStoredPath: ext === "pdf" ? storedPath : null,
    },
  };
}
