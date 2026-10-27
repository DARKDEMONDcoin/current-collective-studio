import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx, validClientAccount } from "@/lib/org-api";
import { analyzeFile } from "@/lib/analyze.server";

const COLS = "id,name,source_filename,source_language,page_count,word_count,status,workflow_type,provider,avg_confidence,credits_charged,created_at,clientAccount:ct_client_accounts(id,name)";

export const Route = createFileRoute("/api/ocr-requests")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data, error } = await ctx.supabase.from("ct_ocr_requests").select(COLS).order("created_at", { ascending: false }).limit(200);
        if (error) return jerr("Failed to load OCR requests", 500);
        return Response.json((camel(data ?? []) as any[]).map((r) => ({ ...r, avgConfidence: Number(r.avgConfidence) })));
      },
      // Multipart upload: the file is scanned and billed here (per page) in one step.
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) return jerr("Please choose a file to scan.");
        const clientAccountId = (form!.get("clientAccountId") as string) || null;
        if (!(await validClientAccount(ctx, clientAccountId))) return jerr("Invalid client account");
        const r = await analyzeFile(ctx, file, {
          forceOcr: true, clientAccountId,
          workflowType: (form!.get("workflowType") as string) || "AI_ONLY",
          idempotencyKey: (form!.get("idempotencyKey") as string) || null,
          testBilling: form!.get("testBilling") === "true",
        });
        if (!r.ok) return Response.json(r.body, { status: r.status });
        return Response.json({ id: r.body.ocrRequestId, charged: r.body.ocrCharged, pageCount: r.body.pageCount }, { status: 201 });
      },
    },
  },
});
