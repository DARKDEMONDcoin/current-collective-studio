import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { camel } from "@/lib/ct-shape";

async function myOrg(me: NonNullable<Awaited<ReturnType<typeof requireApiUser>>>) {
  const { data } = await me.supabase
    .from("ct_profiles")
    .select("organization_id")
    .eq("user_id", me.userId)
    .maybeSingle();
  return (data?.organization_id as string | null) ?? null;
}

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const orgId = await myOrg(me);
        if (!orgId) return Response.json([]);
        const { data } = await me.supabase
          .from("ct_projects")
          .select("*, documents:ct_documents(*), jobs:ct_jobs(*)")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });
        return Response.json(camel(data ?? []));
      },
      POST: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const orgId = await myOrg(me);
        if (!orgId) return Response.json({ error: "No organization" }, { status: 400 });
        const general = await (await import("@/lib/settings.server")).getSetting("general");
        if (general.ordersPaused) return Response.json({ error: general.pauseMessage }, { status: 503 });
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object")
          return Response.json({ error: "Invalid request" }, { status: 400 });
        const allowedWf = ["AI_HUMAN", "HUMAN_ONLY", "CREDITS", "BYOK"];
        const allowedSrc = ["SYSTEM_POOL", "PREFERRED", "INTERNAL"];
        const payload = {
          name: String(body.name ?? "").slice(0, 200),
          sourceLanguage: String(body.sourceLanguage ?? "English").slice(0, 60),
          targetLanguages: Array.isArray(body.targetLanguages)
            ? body.targetLanguages.map(String).slice(0, 50)
            : [],
          workflowType: allowedWf.includes(body.workflowType) ? body.workflowType : "AI_HUMAN",
          linguistSource: allowedSrc.includes(body.linguistSource) ? body.linguistSource : "SYSTEM_POOL",
          // Never charge for fewer words than the segments that will actually be translated.
          wordCount: Math.max(
            Math.floor(Number(body.wordCount) || 0),
            (Array.isArray(body.segments) ? body.segments.slice(0, 20000) : []).reduce(
              (n: number, sg: any) =>
                n + String(typeof sg === "string" ? sg : sg?.text ?? "").trim().split(/\s+/).filter(Boolean).length,
              0,
            ),
            0,
          ),
          dueDate: body.dueDate ?? null,
          notes: body.notes ?? null,
          segments: Array.isArray(body.segments) ? body.segments.slice(0, 20000) : [],
          filename: body.filename ?? null,
          docType: body.docType ?? null,
          layoutHtml: body.layoutHtml ?? null,
          structuredData: body.structuredData ?? null,
          attachedTmIds: Array.isArray(body.attachedTmIds) ? body.attachedTmIds : [],
          attachedGlossaryIds: Array.isArray(body.attachedGlossaryIds) ? body.attachedGlossaryIds : [],
          attachedStyleGuideIds: Array.isArray(body.attachedStyleGuideIds) ? body.attachedStyleGuideIds : [],
          ocrConfidenceWarning: !!body.ocrConfidenceWarning,
          idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 100) : null,
          // Original file saved by /api/upload/analyze; only accept paths inside this organization's folder.
          storedPath: [body.docxStoredPath, body.pptxStoredPath, body.pdfStoredPath].find(
            (x: unknown) => typeof x === "string" && x.startsWith(`${orgId}/`) && !x.includes(".."),
          ) ?? null,
        };
        if (!payload.name || payload.targetLanguages.length === 0)
          return Response.json({ error: "Project name and target languages are required" }, { status: 400 });

        // Caller and organization verified above; the DB function re-checks
        // membership and performs the balance-guarded debit atomically.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("ct_create_project_once", {
          _user: me.userId,
          _org: orgId,
          p: payload,
        });
        if (error) {
          console.error("[projects] create failed", error);
          return Response.json({ error: "Could not create the project." }, { status: 500 });
        }
        const r = data as { id?: string; error?: string; required?: number; balance?: number; duplicate?: boolean };
        if (r.error === "WORKFLOW_UNAVAILABLE")
          return Response.json(
            { error: "Using your own AI key (BYOK) is not available yet. Please choose system credits." },
            { status: 400 },
          );
        if (r.error === "RATE_NOT_CONFIGURED")
          return Response.json({ error: "Pricing for this service is not set up yet. Please contact support." }, { status: 503 });
        if (r.error === "INSUFFICIENT_CREDITS")
          return Response.json(
            {
              error: `Insufficient credits. This project requires ${r.required} credits but your balance is ${r.balance}.`,
            },
            { status: 402 },
          );
        // Start translating right away; anything that doesn't fit in this request keeps
        // running in the background (project page polling + the 1-minute scheduler).
        if (!r.duplicate) {
          const { processProject } = await import("@/lib/order-pipeline.server");
          await processProject(r.id!, 20_000).catch((e) => console.error("[projects] first step", e));
        }
        const { data: project } = await me.supabase
          .from("ct_projects")
          .select("*, jobs:ct_jobs(*)")
          .eq("id", r.id!)
          .maybeSingle();
        if (!r.duplicate && project?.status === "FAILED")
          return Response.json(
            { error: "AI translation failed, so the order was stopped and your credits were refunded. Please try again.", projectId: r.id },
            { status: 502 },
          );
        if (r.duplicate && project?.status === "FAILED")
          return Response.json({ error: "This order failed earlier and was refunded. Please submit it again." }, { status: 409 });
        return Response.json(camel(project), { status: 201 });
      },
    },
  },
});
