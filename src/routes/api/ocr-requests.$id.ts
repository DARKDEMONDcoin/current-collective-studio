import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx } from "@/lib/org-api";

export const Route = createFileRoute("/api/ocr-requests/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_ocr_requests").select("*, clientAccount:ct_client_accounts(id,name)").eq("id", params.id).maybeSingle();
        if (!data) return jerr("Not found", 404);
        return Response.json(camel(data));
      },
      // Client-side verification: save corrected text and mark VERIFIED.
      PATCH: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data: own } = await ctx.supabase.from("ct_ocr_requests").select("id").eq("id", params.id).maybeSingle();
        if (!own) return jerr("Not found", 404);
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const text = typeof b.verifiedText === "string" ? b.verifiedText.slice(0, 1_000_000) : null;
        if (!text?.trim()) return jerr("Verified text is required");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("ct_ocr_requests")
          .update({ verified_text: text, status: "VERIFIED" }).eq("id", own.id).eq("organization_id", ctx.orgId).select().single();
        return Response.json(camel(data));
      },
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_ocr_requests").delete().eq("id", params.id).select("id");
        if (!data?.length) return jerr("Not found", 404);
        return Response.json({ ok: true });
      },
    },
  },
});
