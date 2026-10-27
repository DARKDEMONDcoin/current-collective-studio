import { createFileRoute } from "@tanstack/react-router";
import { orgCtx } from "@/lib/org-api";
import { analyzeFile } from "@/lib/analyze.server";

export const Route = createFileRoute("/api/upload/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) return Response.json({ error: "No file provided" }, { status: 400 });
        const r = await analyzeFile(ctx, file, {
          idempotencyKey: (form!.get("idempotencyKey") as string) || null,
          testBilling: form!.get("testBilling") === "true",
        });
        return Response.json(r.body, { status: r.status });
      },
    },
  },
});
