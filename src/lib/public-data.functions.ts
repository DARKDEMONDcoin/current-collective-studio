import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapPlan = (p: any) => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  price: Number(p.price),
  period: p.period,
  description: p.description,
  features: p.features ?? [],
  creditsPerCycle: p.credits_per_cycle,
  isPopular: p.is_popular,
  isActive: p.is_active,
  displayOrder: p.display_order,
  ctaText: p.cta_text,
  ctaHref: p.cta_href,
  nameAr: p.name_ar,
  descriptionAr: p.description_ar,
  featuresAr: p.features_ar ?? [],
});
const mapCat = (c: any) => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  description: c.description,
  icon: c.icon,
  color: c.color,
  sortOrder: c.sort_order,
  isVisible: c.is_visible,
});
const mapArticle = (a: any) => ({
  id: a.id,
  title: a.title,
  subtitle: a.subtitle,
  slug: a.slug,
  excerpt: a.excerpt,
  body: a.body,
  contentType: a.content_type,
  audiences: a.audiences,
  categoryId: a.category_id,
  tags: a.tags,
  icon: a.icon,
  featured: a.featured,
  seoTitle: a.seo_title,
  metaDescription: a.meta_description,
  status: a.status,
  sortOrder: a.sort_order,
  relatedIds: a.related_ids,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
  category: a.ct_resource_categories ? mapCat(a.ct_resource_categories) : null,
});
const mapFaq = (f: any) => ({
  id: f.id,
  question: f.question,
  answer: f.answer,
  categoryId: f.category_id,
  audiences: f.audiences,
  sortOrder: f.sort_order,
  featured: f.featured,
});

export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [cfg, plans] = await Promise.all([
    sb.from("ct_site_config").select("key,value"),
    sb.from("ct_plan_config").select("*").eq("is_active", true).order("display_order"),
  ]);
  return {
    siteConfigs: (cfg.data ?? []) as Array<{ key: string; value: any }>,
    dbPlans: (plans.data ?? []).map(mapPlan),
  };
});

export const getPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await publicClient()
    .from("ct_plan_config")
    .select("*")
    .eq("is_active", true)
    .order("display_order");
  return (data ?? []).map(mapPlan);
});

export const getResourcesHub = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [c, a, f] = await Promise.all([
    sb.from("ct_resource_categories").select("*").order("sort_order"),
    sb
      .from("ct_resource_articles")
      .select("*, ct_resource_categories(*)")
      .eq("featured", true)
      .order("sort_order")
      .limit(8),
    sb.from("ct_resource_faq_items").select("*").eq("featured", true).order("sort_order"),
  ]);
  return {
    categories: (c.data ?? []).map(mapCat),
    featuredArticles: (a.data ?? []).map(mapArticle),
    featuredFaqs: (f.data ?? []).map(mapFaq),
  };
});

export const getResourceCategory = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => String(slug).slice(0, 200))
  .handler(async ({ data: slug }) => {
    const sb = publicClient();
    const { data: cat } = await sb
      .from("ct_resource_categories")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (!cat) return { category: null, articles: [], faqs: [] };
    const [a, f] = await Promise.all([
      sb
        .from("ct_resource_articles")
        .select("*, ct_resource_categories(*)")
        .eq("category_id", cat.id)
        .order("sort_order"),
      sb.from("ct_resource_faq_items").select("*").eq("category_id", cat.id).order("sort_order"),
    ]);
    return {
      category: mapCat(cat),
      articles: (a.data ?? []).map(mapArticle),
      faqs: (f.data ?? []).map(mapFaq),
    };
  });

export const getResourceArticle = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => String(slug).slice(0, 200))
  .handler(async ({ data: slug }) => {
    const { data } = await publicClient()
      .from("ct_resource_articles")
      .select("*, ct_resource_categories(*)")
      .eq("slug", slug)
      .maybeSingle();
    return data ? mapArticle(data) : null;
  });
