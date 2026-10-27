import { createFileRoute } from "@tanstack/react-router";
import { orgCtx } from "@/lib/org-api";
import { linguistCards } from "@/lib/linguists.server";

export const Route = createFileRoute("/api/organization/linguists")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const u = new URL(request.url).searchParams;
        const search = (u.get("search") ?? "").toLowerCase(), type = u.get("type") ?? "all";
        const sl = u.get("sourceLang") ?? "", tl = u.get("targetLang") ?? "", status = u.get("status") ?? "all";
        const [{ data: favs }, { data: blocked }, all] = await Promise.all([
          ctx.supabase.from("ct_favorite_linguists").select("linguist_id").eq("customer_id", ctx.userId),
          ctx.supabase.from("ct_linguist_blacklist").select("linguist_id"),
          linguistCards(),
        ]);
        const fav = new Set((favs ?? []).map((f) => f.linguist_id));
        const blk = new Set((blocked ?? []).map((b) => b.linguist_id));
        const ok = (l: any) =>
          (!search || l.name?.toLowerCase().includes(search) || l.email.toLowerCase().includes(search)) &&
          (status !== "inactive") &&
          (!sl && !tl ? true : l.languagePairs.some((p: any) => (!sl || p.sourceLang === sl) && (!tl || p.targetLang === tl)));
        const tag = (l: any, t: string) => ({ ...l, type: t, isBlocked: blk.has(l.id), orgId: undefined });
        let internal = all.filter((l) => l.orgId === ctx.orgId).map((l) => tag(l, "INTERNAL")).filter(ok);
        let preferred = all.filter((l) => fav.has(l.id) && l.orgId !== ctx.orgId).map((l) => tag(l, "PREFERRED")).filter(ok);
        let pool = all.filter((l) => !fav.has(l.id) && l.orgId !== ctx.orgId).map((l) => tag(l, "SYSTEM")).filter(ok);
        if (type === "internal") { preferred = []; pool = []; }
        if (type === "preferred") { internal = []; pool = []; }
        if (type === "pool") { internal = []; preferred = []; }
        return Response.json({ internal, preferred, pool, invitations: [] });
      },
    },
  },
});
