import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Admin Panel data. Every function first checks the caller holds ADMIN via ct_has_role,
// then reads through the caller's own client (ct "admin all" RLS policies).
// Credit adjustments and role changes go through service-role-only DB functions that
// re-check the admin role and write an audit row in the same transaction.

async function admin(context: any) {
  const { data: ok } = await context.supabase.rpc("ct_has_role", { _user_id: context.userId, _role: "ADMIN" });
  if (!ok) throw new Error("Forbidden");
  return context.supabase as any;
}

export const getAdminShell = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("ct_has_role", { _user_id: context.userId, _role: "ADMIN" });
    const { data: p } = await context.supabase.from("ct_profiles").select("name,email,avatar_url").eq("user_id", context.userId).maybeSingle();
    return { isAdmin: !!ok, user: { id: context.userId, name: p?.name ?? null, email: p?.email ?? null, image: p?.avatar_url ?? null, role: ok ? "ADMIN" : "CLIENT" } };
  });

const count = async (q: any) => (await q).count ?? 0;

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const h = { count: "exact", head: true } as const;
    const [users, orgs, projects, jobs, completed, linguists, failed, processing] = await Promise.all([
      count(db.from("ct_profiles").select("user_id", h)),
      count(db.from("ct_organizations").select("id", h)),
      count(db.from("ct_projects").select("id", h)),
      count(db.from("ct_jobs").select("id", h)),
      count(db.from("ct_jobs").select("id", h).eq("status", "COMPLETED")),
      count(db.from("ct_user_roles").select("id", h).eq("role", "LINGUIST")),
      count(db.from("ct_projects").select("id", h).eq("status", "FAILED")),
      count(db.from("ct_projects").select("id", h).in("status", ["PROCESSING", "PENDING"])),
    ]);
    const { data: recent } = await db.from("ct_projects").select("id,name,status,workflow_type,total_word_count,created_at,last_error,organization:ct_organizations(name)").order("created_at", { ascending: false }).limit(10);
    return { stats: { users, orgs, projects, jobs, completed, linguists, failed, processing }, recent: recent ?? [] };
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q?: string; role?: string }) => ({ q: String(d?.q ?? "").slice(0, 100), role: String(d?.role ?? "") }))
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    let q = db.from("ct_profiles").select("user_id,name,email,created_at,organization:ct_organizations(id,name)").order("created_at", { ascending: false }).limit(200);
    if (data.q) q = q.or(`email.ilike.%${data.q.replace(/[%,()]/g, "")}%,name.ilike.%${data.q.replace(/[%,()]/g, "")}%`);
    const [{ data: profiles }, { data: roles }] = await Promise.all([q, db.from("ct_user_roles").select("user_id,role")]);
    const byUser = new Map<string, string[]>();
    for (const r of roles ?? []) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]);
    let users = (profiles ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.user_id) ?? [] }));
    if (data.role) users = users.filter((u: any) => u.roles.includes(data.role));
    return { users, me: context.userId };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "CLIENT" | "LINGUIST" | "ADMIN"; grant: boolean }) => {
    if (!["CLIENT", "LINGUIST", "ADMIN"].includes(d?.role)) throw new Error("Invalid role");
    if (!/^[0-9a-f-]{36}$/i.test(String(d?.userId))) throw new Error("Invalid user");
    return { userId: d.userId, role: d.role, grant: !!d.grant };
  })
  .handler(async ({ context, data }) => {
    await admin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).rpc("ct_admin_set_role", { _admin: context.userId, _user: data.userId, _role: data.role, _grant: data.grant });
    if (error) throw new Error(error.message.includes("own admin") ? "You cannot remove your own admin role." : "Could not change the role.");
    return { ok: true };
  });

export const getAdminFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const [{ data: orgs }, { data: tx }, { data: jobs }] = await Promise.all([
      db.from("ct_organizations").select("id,name,plan,credit_balance,created_at").order("name").limit(500),
      db.from("ct_credit_transactions").select("id,organization_id,type,amount,description,created_at,related_project_id").order("created_at", { ascending: false }).limit(200),
      db.from("ct_jobs").select("payout_amount,status").in("status", ["COMPLETED", "ACCEPTED", "IN_PROGRESS", "SUBMITTED"]).limit(10000),
    ]);
    const sumBy = (t: string[]) => (tx ?? []).filter((x: any) => t.includes(x.type)).reduce((n: number, x: any) => n + Number(x.amount), 0);
    const payouts = (jobs ?? []).reduce((a: any, j: any) => {
      const k = j.status === "COMPLETED" ? "owed" : "committed";
      a[k] += Number(j.payout_amount ?? 0);
      return a;
    }, { owed: 0, committed: 0 });
    return {
      orgs: orgs ?? [],
      transactions: tx ?? [],
      totals: { usage: -sumBy(["USAGE", "OCR_USAGE"]), refunds: sumBy(["REFUND"]), adjustments: sumBy(["ADMIN_ADJUSTMENT"]), balance: (orgs ?? []).reduce((n: number, o: any) => n + Number(o.credit_balance ?? 0), 0) },
      payouts,
      windowNote: "Totals cover the latest 200 transactions.",
    };
  });

export const adjustOrgCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; amount: number; reason: string }) => {
    const amount = Math.trunc(Number(d?.amount));
    if (!amount || Math.abs(amount) > 10_000_000) throw new Error("Enter a non-zero amount up to 10,000,000.");
    const reason = String(d?.reason ?? "").trim().slice(0, 300);
    if (!reason) throw new Error("A reason is required.");
    return { orgId: String(d.orgId), amount, reason };
  })
  .handler(async ({ context, data }) => {
    await admin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await (supabaseAdmin as any).rpc("ct_admin_adjust_credits", { _admin: context.userId, _org: data.orgId, _amount: data.amount, _reason: data.reason });
    if (error) throw new Error("Could not adjust credits.");
    if (r?.error) throw new Error("Organization not found, or the balance would go below zero.");
    return r as { balance: number };
  });

export const getAdminRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const [{ data: credit }, { data: linguist }, { data: packages }] = await Promise.all([
      db.from("ct_credit_rates").select("*").order("workflow_type"),
      db.from("ct_linguist_rates").select("*").order("workflow_type"),
      db.from("ct_credit_packages").select("*").order("display_order"),
    ]);
    return { credit: credit ?? [], linguist: linguist ?? [], packages: packages ?? [] };
  });

const num = (v: unknown, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error("Invalid number");
  return n;
};

export const saveCreditRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; creditsPerWord: number }) => ({ id: String(d.id), creditsPerWord: num(d.creditsPerWord, 1000) }))
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { error } = await db.from("ct_credit_rates").update({ credits_per_word: data.creditsPerWord, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error("Could not save the rate.");
    await audit(context, "credit_rate.update", data.id, data);
    return { ok: true };
  });

export const saveLinguistRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; ratePerWord: number; minPayout: number }) => ({ id: String(d.id), ratePerWord: num(d.ratePerWord, 10), minPayout: num(d.minPayout, 100000) }))
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { error } = await db.from("ct_linguist_rates").update({ rate_per_word: data.ratePerWord, min_payout: data.minPayout, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error("Could not save the rate.");
    await audit(context, "linguist_rate.update", data.id, data);
    return { ok: true };
  });

export const savePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => ({
    id: d?.id ? String(d.id) : null,
    name: String(d?.name ?? "").trim().slice(0, 80),
    credits: Math.trunc(num(d?.credits, 100_000_000)),
    bonus_credits: Math.trunc(num(d?.bonusCredits ?? 0, 100_000_000)),
    price_usd: num(d?.priceUsd, 1_000_000),
    is_active: d?.isActive !== false,
    is_popular: !!d?.isPopular,
    display_order: Math.trunc(num(d?.displayOrder ?? 0, 1000)),
  }))
  .handler(async ({ context, data }) => {
    if (!data.name || !data.credits) throw new Error("Name and credits are required.");
    const db = await admin(context);
    const { id, ...row } = data;
    const { error } = id ? await db.from("ct_credit_packages").update(row).eq("id", id) : await db.from("ct_credit_packages").insert(row);
    if (error) throw new Error("Could not save the package.");
    await audit(context, id ? "package.update" : "package.create", id ?? data.name, row);
    return { ok: true };
  });

export const getAdminAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const { data } = await db.from("ct_admin_audit").select("*").order("created_at", { ascending: false }).limit(200);
    return { rows: data ?? [] };
  });

async function audit(context: any, action: string, target: string, details: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any).from("ct_admin_audit").insert({ admin_id: context.userId, action, target, details });
}
