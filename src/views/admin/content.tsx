/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Page, Loading, card, fmtDate } from "./pages";
import { AI_MODELS } from "@/lib/settings-defaults";
import {
  getAdminSettings, saveAdminSetting, getRoutingMonitor, getAiUsage, listAdminPlans, saveAdminPlan,
  listAdminResources, saveAdminArticle, saveAdminFaq, getAdminSiteContent, savePageMeta, saveSiteConfig,
} from "@/lib/admin-content.functions";

const input = "mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm";
const btn = "text-sm px-4 py-2 rounded-xl bg-navy text-white disabled:opacity-50";
const btn2 = "text-xs px-3 py-1 rounded-lg border border-gray-200";
const lbl = "block text-xs text-gray-600";

function useSave(key: unknown[]) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (p: () => Promise<unknown>, after?: () => void) => {
      setBusy(true);
      try { await p(); toast.success("Saved"); qc.invalidateQueries({ queryKey: key }); after?.(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Could not save."); }
      finally { setBusy(false); }
    },
  };
}

function useSettings() {
  const fn = useServerFn(getAdminSettings);
  return useQuery({ queryKey: ["admin", "settings"], queryFn: () => fn() });
}

function SettingsForm({ k, render }: { k: "ai" | "routing" | "general" | "email_templates"; render: (v: any, set: (v: any) => void) => React.ReactNode }) {
  const { data, error } = useSettings();
  const save = useServerFn(saveAdminSetting);
  const { busy, run } = useSave(["admin", "settings"]);
  const [v, setV] = useState<any>(null);
  useEffect(() => { if (data) setV(structuredClone((data as any)[k])); }, [data, k]);
  if (!v) return <Loading error={error} />;
  return (
    <form className={`${card} p-6 space-y-4`} onSubmit={(e) => { e.preventDefault(); run(() => save({ data: { key: k, value: v } })); }}>
      {render(v, setV)}
      <button disabled={busy} className={btn}>Save changes</button>
    </form>
  );
}

// ── Routing ──
export function AdminRouting() {
  const fn = useServerFn(getRoutingMonitor);
  const { data, error } = useQuery({ queryKey: ["admin", "routing"], queryFn: () => fn(), refetchInterval: 30_000 });
  const hrs = (t: string) => ((Date.now() - new Date(t).getTime()) / 3600_000).toFixed(1);
  return (
    <Page title="Routing Monitor" sub="Assignment rules and open human-review jobs">
      <SettingsForm k="routing" render={(v, set) => (
        <div className="grid md:grid-cols-2 gap-4">
          <label className={lbl}>Hours a "preferred Linguists" job stays with favourites before opening to everyone
            <input type="number" min={0} max={168} className={input} value={v.preferredWindowHours} onChange={(e) => set({ ...v, preferredWindowHours: Number(e.target.value) })} /></label>
          <label className={lbl}>Maximum active jobs per Linguist
            <input type="number" min={1} max={100} className={input} value={v.maxActiveJobsPerLinguist} onChange={(e) => set({ ...v, maxActiveJobsPerLinguist: Number(e.target.value) })} /></label>
        </div>
      )} />
      <div className={`${card} mt-6 overflow-x-auto`}>
        {!data ? <Loading error={error} /> : !data.jobs.length ? <p className="p-6 text-sm text-gray-500">No open or active jobs.</p> : (
          <table className="w-full text-sm"><thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">Project</th><th>Language</th><th>Words</th><th>Source</th><th>Status</th><th>Waiting (h)</th></tr></thead><tbody>
            {data.jobs.map((j: any) => (
              <tr key={j.id} className="border-t border-gray-100"><td className="px-5 py-2">{j.project?.name}</td><td>{j.target_language}</td><td>{j.word_count}</td><td>{j.linguist_source}</td><td>{j.status}</td><td>{j.linguist_id ? "—" : hrs(j.created_at)}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>
    </Page>
  );
}

// ── AI config ──
export function AdminAiConfig() {
  return (
    <Page title="AI Configuration" sub="Model and translation policy used for every AI translation, OCR scan and suggestion">
      <SettingsForm k="ai" render={(v, set) => (
        <>
          <label className={lbl}>Model
            <select className={input} value={v.model} onChange={(e) => set({ ...v, model: e.target.value })}>{AI_MODELS.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className={lbl}>Platform translation policy (added to every translation request, max 2,000 characters)
            <textarea rows={5} maxLength={2000} className={input} value={v.extraInstructions} onChange={(e) => set({ ...v, extraInstructions: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.correctivePass} onChange={(e) => set({ ...v, correctivePass: e.target.checked })} /> Re-translate segments that fail quality checks (numbers, terminology, wrong language)</label>
        </>
      )} />
    </Page>
  );
}

// ── AI usage ──
export function AdminAiUsage() {
  const fn = useServerFn(getAiUsage);
  const [days, setDays] = useState(30);
  const { data, error } = useQuery({ queryKey: ["admin", "ai-usage", days], queryFn: () => fn({ data: { days } }) });
  const usd = (n: number) => `$${n.toFixed(4)}`;
  return (
    <Page title="LLM Usage" sub="AI calls, tokens and estimated cost (estimate based on list prices)">
      <select aria-label="Period" className="mb-4 border border-gray-200 rounded-lg px-3 py-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
        {[1, 7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
      </select>
      {!data ? <Loading error={error} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[["Calls", data.total.calls], ["Failed", data.total.failed], ["Tokens", (data.total.input + data.total.output).toLocaleString()], ["Est. cost", usd(data.total.cost)]].map(([l, v]) => (
              <div key={l as string} className={`${card} p-4`}><div className="text-xs text-gray-500">{l}</div><div className="text-xl font-bold text-navy">{v}</div></div>
            ))}
          </div>
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm"><thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">Feature</th><th>Model</th><th>Calls</th><th>Failed</th><th>Input tokens</th><th>Output tokens</th><th>Est. cost</th></tr></thead><tbody>
              {data.groups.length ? data.groups.map((g: any) => (
                <tr key={g.feature + g.model} className="border-t border-gray-100"><td className="px-5 py-2">{g.feature}</td><td>{g.model}</td><td>{g.calls}</td><td>{g.failed}</td><td>{g.input.toLocaleString()}</td><td>{g.output.toLocaleString()}</td><td>{usd(g.cost)}</td></tr>
              )) : <tr><td className="px-5 py-4 text-gray-500" colSpan={7}>No AI calls in this period.</td></tr>}
            </tbody></table>
          </div>
        </>
      )}
    </Page>
  );
}

// ── Notification / email templates ──
export function AdminNotifications() {
  return (
    <Page title="Notifications" sub="Email templates. Placeholders: {{name}}, {{project}}, {{link}}, {{credits}}">
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Templates are saved now. Emails are not sent until an email sender domain is connected; in-app notifications already work.
      </div>
      <SettingsForm k="email_templates" render={(v, set) => Object.keys(v).map((key) => (
        <fieldset key={key} className="border-t border-gray-100 pt-4">
          <legend className="text-sm font-semibold text-navy">{key.replace(/_/g, " ")}</legend>
          <label className={lbl}>Subject<input required className={input} value={v[key].subject} onChange={(e) => set({ ...v, [key]: { ...v[key], subject: e.target.value } })} /></label>
          <label className={lbl}>Body<textarea rows={4} className={input} value={v[key].body} onChange={(e) => set({ ...v, [key]: { ...v[key], body: e.target.value } })} /></label>
        </fieldset>
      ))} />
    </Page>
  );
}

// ── General settings ──
export function AdminSettings() {
  return (
    <Page title="Settings" sub="Platform-wide switches">
      <SettingsForm k="general" render={(v, set) => (
        <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.ordersPaused} onChange={(e) => set({ ...v, ordersPaused: e.target.checked })} /> Pause new orders (clients see the message below; running orders continue)</label>
          <label className={lbl}>Pause message<input className={input} maxLength={300} value={v.pauseMessage} onChange={(e) => set({ ...v, pauseMessage: e.target.value })} /></label>
          <label className={lbl}>Support email<input type="email" className={input} value={v.supportEmail} onChange={(e) => set({ ...v, supportEmail: e.target.value })} /></label>
        </>
      )} />
    </Page>
  );
}

// ── Plans ──
export function AdminPlans() {
  const fn = useServerFn(listAdminPlans);
  const save = useServerFn(saveAdminPlan);
  const { data, error } = useQuery({ queryKey: ["admin", "plans"], queryFn: () => fn() });
  const { busy, run } = useSave(["admin", "plans"]);
  const [edit, setEdit] = useState<any>(null);
  const toForm = (p: any) => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, period: p.period ?? "month", description: p.description ?? "", features: (p.features ?? []).join("\n"), creditsPerCycle: p.credits_per_cycle ?? 0, isPopular: p.is_popular, isActive: p.is_active, displayOrder: p.display_order ?? 0, ctaText: p.cta_text ?? "", ctaHref: p.cta_href ?? "/register", nameAr: p.name_ar ?? "", descriptionAr: p.description_ar ?? "", featuresAr: (p.features_ar ?? []).join("\n") });
  const f = (k: string, l: string, type = "text") => <label className={lbl}>{l}<input type={type} step="0.01" className={input} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: type === "number" ? Number(e.target.value) : e.target.value })} /></label>;
  return (
    <Page title="Plans" sub="Plans shown on the public pricing page">
      {!data ? <Loading error={error} /> : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm"><thead className="text-xs text-gray-500 text-left"><tr><th className="px-5 py-2">Plan</th><th>Price</th><th>Credits / cycle</th><th>Active</th><th /></tr></thead><tbody>
            {data.plans.map((p: any) => <tr key={p.id} className="border-t border-gray-100"><td className="px-5 py-2 font-medium text-navy">{p.name}{p.is_popular ? " ★" : ""}</td><td>${Number(p.price).toFixed(2)} / {p.period}</td><td>{Number(p.credits_per_cycle ?? 0).toLocaleString()}</td><td>{p.is_active ? "Yes" : "No"}</td><td className="px-5"><button className={btn2} onClick={() => setEdit(toForm(p))}>Edit</button></td></tr>)}
          </tbody></table>
          <div className="p-5 border-t border-gray-100">
            {!edit ? <button className={btn} onClick={() => setEdit(toForm({ name: "", slug: "", price: 0, is_active: true, display_order: data.plans.length }))}>Add plan</button> : (
              <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => save({ data: edit }), () => setEdit(null)); }}>
                {f("name", "Name")}{f("slug", "Slug")}{f("price", "Price (USD)", "number")}
                <label className={lbl}>Period<select className={input} value={edit.period} onChange={(e) => setEdit({ ...edit, period: e.target.value })}>{["month", "year", "one-time", "custom"].map((x) => <option key={x}>{x}</option>)}</select></label>
                {f("creditsPerCycle", "Credits per cycle", "number")}{f("displayOrder", "Order", "number")}{f("ctaText", "Button text")}{f("ctaHref", "Button link (starts with /)")}
                <label className={`${lbl} md:col-span-2`}>Description<input className={input} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
                <label className={lbl}>Features (one per line)<textarea rows={5} className={input} value={edit.features} onChange={(e) => setEdit({ ...edit, features: e.target.value })} /></label>
                <label className={lbl}>Arabic features (one per line)<textarea dir="rtl" rows={5} className={input} value={edit.featuresAr} onChange={(e) => setEdit({ ...edit, featuresAr: e.target.value })} /></label>
                {f("nameAr", "Arabic name")}{f("descriptionAr", "Arabic description")}
                <div className="flex gap-4 text-sm md:col-span-2">
                  <label className="flex gap-2"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active</label>
                  <label className="flex gap-2"><input type="checkbox" checked={edit.isPopular} onChange={(e) => setEdit({ ...edit, isPopular: e.target.checked })} />Highlight</label>
                </div>
                <div className="flex gap-2"><button disabled={busy} className={btn}>Save plan</button><button type="button" className={btn2} onClick={() => setEdit(null)}>Cancel</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

// ── Resources CMS ──
export function AdminResources() {
  const fn = useServerFn(listAdminResources);
  const saveA = useServerFn(saveAdminArticle);
  const saveF = useServerFn(saveAdminFaq);
  const { data, error } = useQuery({ queryKey: ["admin", "resources"], queryFn: () => fn() });
  const { busy, run } = useSave(["admin", "resources"]);
  const [art, setArt] = useState<any>(null);
  const [faq, setFaq] = useState<any>(null);
  const status = (v: any, set: (x: any) => void) => <label className={lbl}>Status<select className={input} value={v.status} onChange={(e) => set({ ...v, status: e.target.value })}>{["DRAFT", "PUBLISHED", "ARCHIVED"].map((x) => <option key={x}>{x}</option>)}</select></label>;
  const cat = (v: any, set: (x: any) => void) => <label className={lbl}>Category<select className={input} value={v.categoryId ?? ""} onChange={(e) => set({ ...v, categoryId: e.target.value || null })}><option value="">None</option>{data?.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>;
  return (
    <Page title="Resources CMS" sub="Help articles and FAQ shown in the Resources section">
      {!data ? <Loading error={error} /> : (
        <div className="space-y-6">
          <div className={`${card} overflow-x-auto`}>
            <div className="p-5 flex justify-between items-center"><h2 className="font-semibold text-navy">Articles ({data.articles.length})</h2><button className={btn} onClick={() => setArt({ title: "", slug: "", excerpt: "", body: "", status: "DRAFT", contentType: "ARTICLE" })}>New article</button></div>
            {art && (
              <form className="p-5 border-t border-gray-100 grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveA({ data: art }), () => setArt(null)); }}>
                <label className={lbl}>Title<input required className={input} value={art.title} onChange={(e) => setArt({ ...art, title: e.target.value })} /></label>
                <label className={lbl}>Slug<input required className={input} value={art.slug} onChange={(e) => setArt({ ...art, slug: e.target.value })} /></label>
                {status(art, setArt)}{cat(art, setArt)}
                <label className={`${lbl} md:col-span-2`}>Summary<input className={input} value={art.excerpt} onChange={(e) => setArt({ ...art, excerpt: e.target.value })} /></label>
                <label className={`${lbl} md:col-span-2`}>Body (Markdown)<textarea rows={12} className={input} value={art.body} onChange={(e) => setArt({ ...art, body: e.target.value })} /></label>
                <div className="flex gap-2"><button disabled={busy} className={btn}>Save article</button><button type="button" className={btn2} onClick={() => setArt(null)}>Cancel</button></div>
              </form>
            )}
            <table className="w-full text-sm"><tbody>
              {data.articles.map((a: any) => <tr key={a.id} className="border-t border-gray-100"><td className="px-5 py-2 font-medium text-navy">{a.title}</td><td className="text-gray-500">/{a.slug}</td><td>{a.status}</td><td className="text-gray-500">{fmtDate(a.updated_at)}</td><td className="px-5"><button className={btn2} onClick={() => setArt({ id: a.id, title: a.title, slug: a.slug, excerpt: a.excerpt ?? "", body: a.body ?? "", status: a.status, categoryId: a.category_id, contentType: a.content_type, featured: a.featured, audiences: a.audiences })}>Edit</button></td></tr>)}
            </tbody></table>
          </div>
          <div className={`${card} overflow-x-auto`}>
            <div className="p-5 flex justify-between items-center"><h2 className="font-semibold text-navy">FAQ ({data.faqs.length})</h2><button className={btn} onClick={() => setFaq({ question: "", answer: "", status: "DRAFT", sortOrder: data.faqs.length })}>New question</button></div>
            {faq && (
              <form className="p-5 border-t border-gray-100 grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveF({ data: faq }), () => setFaq(null)); }}>
                <label className={`${lbl} md:col-span-2`}>Question<input required className={input} value={faq.question} onChange={(e) => setFaq({ ...faq, question: e.target.value })} /></label>
                <label className={`${lbl} md:col-span-2`}>Answer<textarea required rows={5} className={input} value={faq.answer} onChange={(e) => setFaq({ ...faq, answer: e.target.value })} /></label>
                {status(faq, setFaq)}{cat(faq, setFaq)}
                <div className="flex gap-2"><button disabled={busy} className={btn}>Save question</button><button type="button" className={btn2} onClick={() => setFaq(null)}>Cancel</button></div>
              </form>
            )}
            <table className="w-full text-sm"><tbody>
              {data.faqs.map((q: any) => <tr key={q.id} className="border-t border-gray-100"><td className="px-5 py-2">{q.question}</td><td>{q.status}</td><td className="px-5"><button className={btn2} onClick={() => setFaq({ id: q.id, question: q.question, answer: q.answer, status: q.status, categoryId: q.category_id, sortOrder: q.sort_order, featured: q.featured, audiences: q.audiences })}>Edit</button></td></tr>)}
            </tbody></table>
          </div>
        </div>
      )}
    </Page>
  );
}

// ── Site content ──
export function AdminSiteContent() {
  const fn = useServerFn(getAdminSiteContent);
  const saveM = useServerFn(savePageMeta);
  const saveC = useServerFn(saveSiteConfig);
  const { data, error } = useQuery({ queryKey: ["admin", "site"], queryFn: () => fn() });
  const { busy, run } = useSave(["admin", "site"]);
  const [meta, setMeta] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  return (
    <Page title="Site Content" sub="Search titles/descriptions per page and public site settings">
      {!data ? <Loading error={error} /> : (
        <div className="space-y-6">
          <div className={`${card} overflow-x-auto`}>
            <div className="p-5 flex justify-between"><h2 className="font-semibold text-navy">Page text</h2><button className={btn} onClick={() => setMeta({ pageKey: "", locale: "en", title: "", description: "", ogTitle: "", ogDescription: "", noIndex: false })}>Add page</button></div>
            {meta && (
              <form className="p-5 border-t border-gray-100 grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveM({ data: meta }), () => setMeta(null)); }}>
                <label className={lbl}>Page key (e.g. home, pricing)<input required className={input} value={meta.pageKey} onChange={(e) => setMeta({ ...meta, pageKey: e.target.value })} /></label>
                <label className={lbl}>Language<select className={input} value={meta.locale} onChange={(e) => setMeta({ ...meta, locale: e.target.value })}><option value="en">English</option><option value="ar">Arabic</option></select></label>
                {(["title", "description", "ogTitle", "ogDescription"] as const).map((k) => <label key={k} className={lbl}>{k}<input dir={meta.locale === "ar" ? "rtl" : "ltr"} className={input} value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></label>)}
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={meta.noIndex} onChange={(e) => setMeta({ ...meta, noIndex: e.target.checked })} />Hide from search engines</label>
                <div className="flex gap-2 md:col-span-2"><button disabled={busy} className={btn}>Save</button><button type="button" className={btn2} onClick={() => setMeta(null)}>Cancel</button></div>
              </form>
            )}
            <table className="w-full text-sm"><tbody>
              {data.pages.map((p: any) => <tr key={p.page_key + p.locale} className="border-t border-gray-100"><td className="px-5 py-2 font-medium">{p.page_key}</td><td>{p.locale}</td><td className="text-gray-600">{p.title}</td><td className="px-5"><button className={btn2} onClick={() => setMeta({ pageKey: p.page_key, locale: p.locale, title: p.title ?? "", description: p.description ?? "", ogTitle: p.og_title ?? "", ogDescription: p.og_description ?? "", noIndex: !!p.no_index })}>Edit</button></td></tr>)}
            </tbody></table>
          </div>
          <div className={`${card} overflow-x-auto`}>
            <div className="p-5 flex justify-between"><h2 className="font-semibold text-navy">Public site settings (visible to everyone; never store secrets here)</h2><button className={btn} onClick={() => setCfg({ key: "", json: "{}" })}>Add setting</button></div>
            {cfg && (
              <form className="p-5 border-t border-gray-100 space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveC({ data: cfg }), () => setCfg(null)); }}>
                <label className={lbl}>Key<input required className={input} value={cfg.key} onChange={(e) => setCfg({ ...cfg, key: e.target.value })} /></label>
                <label className={lbl}>Value (JSON)<textarea rows={8} className={`${input} font-mono`} value={cfg.json} onChange={(e) => setCfg({ ...cfg, json: e.target.value })} /></label>
                <div className="flex gap-2"><button disabled={busy} className={btn}>Save</button><button type="button" className={btn2} onClick={() => setCfg(null)}>Cancel</button></div>
              </form>
            )}
            <table className="w-full text-sm"><tbody>
              {data.config.map((c: any) => <tr key={c.key} className="border-t border-gray-100"><td className="px-5 py-2 font-medium">{c.key}</td><td className="text-gray-500 truncate max-w-md font-mono text-xs">{JSON.stringify(c.value).slice(0, 120)}</td><td className="px-5"><button className={btn2} onClick={() => setCfg({ key: c.key, json: JSON.stringify(c.value, null, 2) })}>Edit</button></td></tr>)}
            </tbody></table>
          </div>
        </div>
      )}
    </Page>
  );
}
