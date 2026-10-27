// Builds the terminology / style context an order attached (glossaries, TMs,
// style guides, client notes) and validates AI output against it.
// All lookups are scoped to the project's organization, so IDs supplied by a
// client can never pull another organization's assets.

export type GlossaryTerm = { term: string; target: string | null; dnt: boolean; caseSensitive: boolean };
export type TranslationContext = {
  glossary: GlossaryTerm[];
  tm: Map<string, string>; // normalized source -> target (exact matches)
  style: string;
  notes: string;
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function pickTarget(translations: Record<string, unknown>, target: string): string | null {
  const t = target.toLowerCase();
  for (const [k, v] of Object.entries(translations ?? {})) {
    const key = k.toLowerCase();
    if (typeof v === "string" && v.trim() && (key === t || t.startsWith(key) || key.startsWith(t.slice(0, 2)))) return v.trim();
  }
  return null;
}

export async function loadTranslationContext(
  db: any,
  project: { organization_id: string; source_language: string; attached_glossary_ids?: string[] | null; attached_tm_ids?: string[] | null; attached_style_guide_ids?: string[] | null; notes?: string | null },
  target: string,
): Promise<TranslationContext> {
  const org = project.organization_id;
  const gIds = (project.attached_glossary_ids ?? []).slice(0, 20);
  const tIds = (project.attached_tm_ids ?? []).slice(0, 20);
  const sIds = (project.attached_style_guide_ids ?? []).slice(0, 10);
  const [g, tms, sg] = await Promise.all([
    gIds.length
      ? db.from("ct_glossary_terms").select("term,translations,do_not_translate,case_sensitive").eq("organization_id", org).in("glossary_id", gIds).limit(2000)
      : { data: [] },
    tIds.length
      ? db.from("ct_translation_memories").select("id,target_language").eq("organization_id", org).in("id", tIds)
      : { data: [] },
    sIds.length
      ? db.from("ct_style_guides").select("name,content").eq("organization_id", org).in("id", sIds)
      : { data: [] },
  ]);
  const glossary: GlossaryTerm[] = (g.data ?? [])
    .map((r: any) => ({ term: r.term, target: r.do_not_translate ? r.term : pickTarget(r.translations, target), dnt: !!r.do_not_translate, caseSensitive: !!r.case_sensitive }))
    .filter((t: GlossaryTerm) => t.term && (t.dnt || t.target));

  const tm = new Map<string, string>();
  const tmIds = (tms.data ?? []).filter((t: any) => !t.target_language || norm(t.target_language) === norm(target) || norm(target).startsWith(norm(t.target_language).slice(0, 2))).map((t: any) => t.id);
  for (let from = 0; tmIds.length; from += 1000) {
    const { data } = await db.from("ct_tm_entries").select("source_text,target_text").eq("organization_id", org).in("tm_id", tmIds).range(from, from + 999);
    for (const e of data ?? []) if (e.target_text?.trim()) tm.set(norm(e.source_text), e.target_text);
    if (!data || data.length < 1000 || from > 20000) break;
  }
  const style = (sg.data ?? []).map((s: any) => `## ${s.name}\n${String(s.content ?? "").slice(0, 6000)}`).join("\n\n").slice(0, 12000);
  return { glossary, tm, style, notes: String(project.notes ?? "").slice(0, 3000) };
}

export const tmLookup = (ctx: TranslationContext, source: string) => ctx.tm.get(norm(source)) ?? null;

/** Glossary entries that actually occur in these segments (keeps prompts small). */
export function relevantTerms(ctx: TranslationContext, texts: string[]): GlossaryTerm[] {
  const joined = texts.join("\n");
  const lower = joined.toLowerCase();
  return ctx.glossary.filter((t) => (t.caseSensitive ? joined.includes(t.term) : lower.includes(t.term.toLowerCase()))).slice(0, 200);
}

// Western + Arabic-Indic + Persian digits normalized to 0-9.
const toAscii = (s: string) =>
  s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
const numbers = (s: string) => (toAscii(s).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")).sort();

/** Returns a list of problems with one translated segment, empty when it passes. */
const SCRIPT: [RegExp, RegExp][] = [
  [/^(arabic|persian|farsi|urdu|ar|fa|ur)\b/i, /[\u0600-\u06FF]/],
  [/^(hebrew|he)\b/i, /[\u0590-\u05FF]/],
  [/^(russian|ukrainian|bulgarian|serbian|ru|uk)\b/i, /[\u0400-\u04FF]/],
  [/^(greek|el)\b/i, /[\u0370-\u03FF]/],
  [/^(chinese|japanese|zh|ja)\b/i, /[\u3040-\u30FF\u4E00-\u9FFF]/],
  [/^(korean|ko)\b/i, /[\uAC00-\uD7AF]/],
  [/^(hindi|hi)\b/i, /[\u0900-\u097F]/],
  [/^(thai|th)\b/i, /[\u0E00-\u0E7F]/],
];
const LETTERS = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g;
const MONTHS = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/;

export function checkSegment(source: string, out: string, terms: GlossaryTerm[], sameScript: boolean, target = ""): string[] {
  const issues: string[] = [];
  const src = source.trim();
  const tgt = (out ?? "").trim();
  if (src && !tgt) return ["empty translation"];
  if (!sameScript && src.length > 12 && /[a-z\u0600-\u06FF]/i.test(src) && norm(src) === norm(tgt)) issues.push("left untranslated");
  const a = numbers(src), b = numbers(tgt);
  const missing = a.filter((n) => !b.includes(n));
  if (missing.length) issues.push(`numbers changed or missing: ${missing.slice(0, 5).join(", ")}`);
  for (const t of terms) {
    const present = t.caseSensitive ? src.includes(t.term) : src.toLowerCase().includes(t.term.toLowerCase());
    if (present && t.target && !tgt.toLowerCase().includes(t.target.toLowerCase())) issues.push(`glossary term "${t.term}" must be "${t.target}"`);
  }
  const script = SCRIPT.find(([l]) => l.test(target.trim()))?.[1];
  if (script && tgt) {
    // Protected names/terms are allowed to stay in Latin; the rest must be in the target script.
    let rest = tgt;
    for (const t of terms) if (t.dnt) rest = rest.split(t.term).join("");
    const letters = rest.match(LETTERS)?.length ?? 0;
    const inScript = [...rest].filter((c) => script.test(c)).length;
    if (letters >= 4 && inScript / letters < 0.3 && /[A-Za-z\u0600-\u06FF\u0590-\u05FF]{4}/.test(src)) issues.push(`not written in ${target}`);
    if (MONTHS.test(tgt) && !MONTHS.test(src.replace(MONTHS, "")) && MONTHS.test(src)) issues.push("month names must be translated");
  }
  const ratio = tgt.length / Math.max(1, src.length);
  if (src.length > 80 && ratio < 0.25) issues.push("translation looks truncated");
  return issues;
}
