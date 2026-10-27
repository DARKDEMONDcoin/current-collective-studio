// Shared helpers for organization-scoped /api/* server routes.
// Queries run through the caller's own Supabase client, so the ct_* row rules
// ("org members manage") keep every read and write inside the caller's organization.
import { requireApiUser } from "@/lib/api-auth";

export const jerr = (error: string, status = 400) => Response.json({ error }, { status });

export async function orgCtx(request: Request) {
  const me = await requireApiUser(request);
  if (!me) return jerr("Unauthorized", 401);
  const { data } = await me.supabase.from("ct_profiles").select("organization_id").eq("user_id", me.userId).maybeSingle();
  if (!data?.organization_id) return jerr("Unauthorized", 401);
  return { ...me, orgId: data.organization_id as string };
}
export type OrgCtx = Exclude<Awaited<ReturnType<typeof orgCtx>>, Response>;

export function short(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
export function longText(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return s ? s.slice(0, max) : null;
}

/** Verifies a client account belongs to the caller's org (RLS hides others). */
export async function validClientAccount(ctx: OrgCtx, id: unknown) {
  if (!id) return true;
  const { data } = await ctx.supabase.from("ct_client_accounts").select("id").eq("id", String(id)).maybeSingle();
  return !!data;
}

/** Applies the original ?clientAccountId= filter (shared | <id> → that client + shared). */
export function clientFilter<T extends { is: any; or: any }>(q: T, url: string): T {
  const c = new URL(url).searchParams.get("clientAccountId");
  if (c === "shared") return q.is("client_account_id", null);
  if (c && /^[\w-]+$/.test(c)) return q.or(`client_account_id.eq.${c},client_account_id.is.null`);
  return q;
}

export function parseCsvPairs(csv: string): [string, string][] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const out: [string, string][] = [];
  const start = /source|term/i.test(lines[0] ?? "") ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].match(/("(?:[^"]|"")*"|[^,\t;]+)(?:[,\t;]|$)/g);
    if (!parts || parts.length < 2) continue;
    const clean = (s: string) => s.replace(/[,\t;]$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim();
    const a = clean(parts[0]), b = clean(parts[1]);
    if (a && b) out.push([a, b]);
  }
  return out;
}

export function parseTmxPairs(xml: string, src: string, tgt: string): [string, string][] {
  const out: [string, string][] = [];
  const s = src.toUpperCase().slice(0, 2), t = tgt.toUpperCase().slice(0, 2);
  for (const tu of xml.matchAll(/<tu[^>]*>([\s\S]*?)<\/tu>/gi)) {
    const m: Record<string, string> = {};
    for (const tuv of tu[1].matchAll(/<tuv[^>]+(?:xml:lang|lang)="([^"]+)"[^>]*>([\s\S]*?)<\/tuv>/gi)) {
      const seg = /<seg>([\s\S]*?)<\/seg>/i.exec(tuv[2]);
      if (seg) m[tuv[1].toUpperCase().slice(0, 2)] = seg[1].trim();
    }
    if (m[s] && m[t]) out.push([m[s], m[t]]);
  }
  return out;
}
