import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_SETTINGS, validateSetting } from "./settings-defaults";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Admin sections: settings (AI, routing, email templates, general), plans, resources CMS,
// site content (page meta + site config) and AI usage. Every call checks ADMIN first, then
// writes through the caller's own client (admin-only RLS) and records an audit row.

async function admin(context: any) {
  const { data: ok } = await context.supabase.rpc("ct_has_role", { _user_id: context.userId, _role: "ADMIN" });
  if (!ok) throw new Error("Forbidden");
  return context.supabase as any;
}
async function audit(context: any, action: string, target: string, details: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any).from("ct_admin_audit").insert({ admin_id: context.userId, action, target, details });
}
const s = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const slugOk = (v: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);

// ── Settings ──
export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const { data } = await db.from("ct_admin_settings").select("key,value,updated_at");
    const out: any = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      const row = (data ?? []).find((r: any) => r.key === k);
      out[k] = { ...(DEFAULT_SETTINGS as any)[k], ...(row?.value ?? {}) };
    }
    return out as typeof DEFAULT_SETTINGS;
  });

export const saveAdminSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; value: any }) => ({ key: String(d?.key), value: validateSetting(String(d?.key), d?.value) }))
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { error } = await db.from("ct_admin_settings").upsert({ key: data.key, value: data.value, updated_by: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not save settings.");
    await audit(context, `settings.${data.key}`, data.key, data.value);
    return { ok: true };
  });

// ── Routing monitor ──
export const getRoutingMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const { data } = await db.from("ct_jobs")
      .select("id,status,linguist_source,exclusive_until,target_language,word_count,created_at,accepted_at,linguist_id,project:ct_projects(name,workflow_type)")
      .in("status", ["AVAILABLE", "EXCLUSIVE", "ACCEPTED", "IN_PROGRESS", "SUBMITTED"]).order("created_at").limit(300);
    return { jobs: data ?? [] };
  });

// ── AI usage ──
export const getAiUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => ({ days: Math.min(Math.max(Math.trunc(Number(d?.days) || 30), 1), 365) }))
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows } = await db.from("ct_ai_usage").select("feature,model,input_tokens,output_tokens,cost_usd,ok,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20000);
    const groups = new Map<string, any>();
    let total = { calls: 0, failed: 0, input: 0, output: 0, cost: 0 };
    for (const r of rows ?? []) {
      const k = `${r.feature}|${r.model}`;
      const g = groups.get(k) ?? { feature: r.feature, model: r.model, calls: 0, failed: 0, input: 0, output: 0, cost: 0 };
      for (const t of [g, total]) { t.calls++; if (!r.ok) t.failed++; t.input += r.input_tokens; t.output += r.output_tokens; t.cost += Number(r.cost_usd); }
      groups.set(k, g);
    }
    return { days: data.days, total, groups: [...groups.values()].sort((a, b) => b.cost - a.cost), recent: (rows ?? []).slice(0, 50) };
  });

// ── Plans ──
export const listAdminPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const { data } = await db.from("ct_plan_config").select("*").order("display_order");
    return { plans: data ?? [] };
  });

export const saveAdminPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => {
    const slug = s(d?.slug, 60).trim();
    const name = s(d?.name, 80).trim();
    const price = Number(d?.price);
    if (!name || !slugOk(slug)) throw new Error("Name and a lowercase slug (letters, numbers, dashes) are required.");
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) throw new Error("Invalid price.");
    const credits = Math.trunc(Number(d?.creditsPerCycle) || 0);
    if (credits < 0 || credits > 100_000_000) throw new Error("Invalid credits.");
    const lines = (v: unknown) => s(v, 4000).split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 30);
    return {
      id: d?.id ? s(d.id, 60) : null, slug, name, price,
      period: ["month", "year", "one-time", "custom"].includes(d?.period) ? d.period : "month",
      description: s(d?.description, 500), features: lines(d?.features), credits_per_cycle: credits,
      is_popular: !!d?.isPopular, is_active: d?.isActive !== false, display_order: Math.trunc(Number(d?.displayOrder) || 0),
      cta_text: s(d?.ctaText, 60), cta_href: s(d?.ctaHref, 300).startsWith("/") ? s(d?.ctaHref, 300) : "/register",
      name_ar: s(d?.nameAr, 80), description_ar: s(d?.descriptionAr, 500), features_ar: lines(d?.featuresAr),
    };
  })
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { id, ...row } = data;
    const now = new Date().toISOString();
    const { error } = id
      ? await db.from("ct_plan_config").update({ ...row, updated_at: now }).eq("id", id)
      : await db.from("ct_plan_config").insert({ id: crypto.randomUUID(), ...row, created_at: now, updated_at: now });
    if (error) throw new Error(error.message.includes("duplicate") ? "That slug is already used." : "Could not save the plan.");
    await audit(context, id ? "plan.update" : "plan.create", id ?? row.slug, row);
    return { ok: true };
  });

// ── Resources CMS (articles + FAQ) ──
export const listAdminResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const [a, f, c] = await Promise.all([
      db.from("ct_resource_articles").select("id,title,slug,excerpt,body,content_type,status,category_id,featured,audiences,sort_order,updated_at").order("updated_at", { ascending: false }).limit(500),
      db.from("ct_resource_faq_items").select("*").order("sort_order").limit(500),
      db.from("ct_resource_categories").select("id,name,slug").order("sort_order"),
    ]);
    return { articles: a.data ?? [], faqs: f.data ?? [], categories: c.data ?? [] };
  });

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];
export const saveAdminArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => {
    const title = s(d?.title, 200).trim();
    const slug = s(d?.slug, 120).trim();
    if (!title || !slugOk(slug)) throw new Error("Title and a lowercase slug are required.");
    return {
      id: d?.id ? s(d.id, 60) : null, title, slug, excerpt: s(d?.excerpt, 500), body: s(d?.body, 100_000),
      content_type: s(d?.contentType || "ARTICLE", 30), status: STATUSES.includes(d?.status) ? d.status : "DRAFT",
      category_id: d?.categoryId ? s(d.categoryId, 60) : null, featured: !!d?.featured,
      audiences: Array.isArray(d?.audiences) ? d.audiences.map((x: unknown) => s(x, 20)).slice(0, 5) : ["CLIENT"],
    };
  })
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { id, ...row } = data;
    const now = new Date().toISOString();
    const { error } = id
      ? await db.from("ct_resource_articles").update({ ...row, updated_at: now }).eq("id", id)
      : await db.from("ct_resource_articles").insert({ id: crypto.randomUUID(), ...row, author_id: context.userId, created_at: now, updated_at: now });
    if (error) throw new Error(error.message.includes("duplicate") ? "That slug is already used." : "Could not save the article.");
    await audit(context, id ? "article.update" : "article.create", id ?? row.slug, { title: row.title, status: row.status });
    return { ok: true };
  });

export const saveAdminFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => {
    const question = s(d?.question, 500).trim();
    const answer = s(d?.answer, 10_000).trim();
    if (!question || !answer) throw new Error("Question and answer are required.");
    return {
      id: d?.id ? s(d.id, 60) : null, question, answer, status: STATUSES.includes(d?.status) ? d.status : "DRAFT",
      category_id: d?.categoryId ? s(d.categoryId, 60) : null, sort_order: Math.trunc(Number(d?.sortOrder) || 0), featured: !!d?.featured,
      audiences: Array.isArray(d?.audiences) ? d.audiences.map((x: unknown) => s(x, 20)).slice(0, 5) : ["CLIENT"],
    };
  })
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { id, ...row } = data;
    const now = new Date().toISOString();
    const { error } = id
      ? await db.from("ct_resource_faq_items").update({ ...row, updated_at: now }).eq("id", id)
      : await db.from("ct_resource_faq_items").insert({ id: crypto.randomUUID(), ...row, created_at: now, updated_at: now });
    if (error) throw new Error("Could not save the question.");
    await audit(context, id ? "faq.update" : "faq.create", id ?? row.question.slice(0, 60), { status: row.status });
    return { ok: true };
  });

// ── Site content: page SEO text + public site config ──
export const getAdminSiteContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const [m, c] = await Promise.all([
      db.from("ct_page_meta").select("*").order("page_key"),
      db.from("ct_site_config").select("key,value,updated_at").order("key"),
    ]);
    return { pages: m.data ?? [], config: c.data ?? [] };
  });

export const savePageMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => {
    const page_key = s(d?.pageKey, 80).trim();
    const locale = ["en", "ar"].includes(d?.locale) ? d.locale : "en";
    if (!page_key) throw new Error("Page is required.");
    return { page_key, locale, title: s(d?.title, 120), description: s(d?.description, 320), og_title: s(d?.ogTitle, 120), og_description: s(d?.ogDescription, 320), no_index: !!d?.noIndex };
  })
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { data: existing } = await db.from("ct_page_meta").select("page_key").eq("page_key", data.page_key).eq("locale", data.locale).maybeSingle();
    const row = { ...data, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await db.from("ct_page_meta").update(row).eq("page_key", data.page_key).eq("locale", data.locale)
      : await db.from("ct_page_meta").insert(row);
    if (error) throw new Error("Could not save page text.");
    await audit(context, "page_meta.save", `${data.page_key}:${data.locale}`, data);
    return { ok: true };
  });

export const saveSiteConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; json: string }) => {
    const key = s(d?.key, 80).trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error("Invalid key.");
    let value: unknown;
    try { value = JSON.parse(String(d?.json ?? "")); } catch { throw new Error("Value must be valid JSON."); }
    if (String(d.json).length > 50_000) throw new Error("Value too large.");
    return { key, value };
  })
  .handler(async ({ context, data }) => {
    const db = await admin(context);
    const { error } = await db.from("ct_site_config").upsert({ key: data.key, value: data.value, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not save.");
    await audit(context, "site_config.save", data.key, null);
    return { ok: true };
  });
