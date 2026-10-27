// Worker-safe document text extraction for the order wizard (replaces the
// original Python/microservice pipeline for TXT, DOCX and text-based PDF).
import { unzipSync, strFromU8 } from "fflate";

export type Segment = { text: string; formatHint: string };

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

export function parsePlainText(text: string): Segment[] {
  return text
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t) => ({ text: t, formatHint: "p" }));
}

// Body first, then footnotes, endnotes, headers and footers — export walks the same order.
export const DOCX_PART = /^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/;
export function docxTextParts(files: Record<string, unknown>): string[] {
  const rank = (n: string) => ["document", "footnotes", "endnotes", "header", "footer"].findIndex((k) => n.startsWith(`word/${k}`));
  return Object.keys(files).filter((n) => DOCX_PART.test(n)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
}

export function parseDocx(buf: Uint8Array): Segment[] {
  const files = unzipSync(buf, { filter: (f) => DOCX_PART.test(f.name) });
  if (!files["word/document.xml"]) return [];
  const doc = docxTextParts(files).map((n) => strFromU8(files[n])).join("\n");
  const out: Segment[] = [];
  for (const m of doc.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const text = decodeXml(
      [...p.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)]
        .map((t) => (t[1] === undefined ? " " : t[1]))
        .join(""),
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const h = style.match(/Heading(\d)/i)?.[1];
    out.push({ text, formatHint: h ? `h${h}` : /List/i.test(style) ? "li" : "p" });
  }
  return out;
}

export async function parsePdf(buf: Uint8Array): Promise<{ segments: Segment[]; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return { segments: pages.flatMap((p) => parsePlainText(p)), pages: totalPages };
}

export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// Lightweight script-based language guess (AI detection arrives with the Stage 5 pipeline).
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 4000);
  const count = (re: RegExp) => (sample.match(re) ?? []).length;
  const scores: [string, number][] = [
    ["Arabic", count(/[\u0600-\u06FF]/g)],
    ["Chinese", count(/[\u4E00-\u9FFF]/g)],
    ["Japanese", count(/[\u3040-\u30FF]/g)],
    ["Korean", count(/[\uAC00-\uD7AF]/g)],
    ["Russian", count(/[\u0400-\u04FF]/g)],
    ["Hebrew", count(/[\u0590-\u05FF]/g)],
    ["Hindi", count(/[\u0900-\u097F]/g)],
  ];
  const best = scores.sort((a, b) => b[1] - a[1])[0];
  if (best[1] > 20) return best[0];
  const lower = ` ${sample.toLowerCase()} `;
  const words = (ws: string[]) => ws.reduce((n, w) => n + lower.split(` ${w} `).length - 1, 0);
  const latin: [string, number][] = [
    ["English", words(["the", "and", "of", "to", "is"])],
    ["French", words(["le", "la", "les", "et", "est", "des"])],
    ["Spanish", words(["el", "los", "y", "es", "del", "que"])],
    ["German", words(["der", "die", "und", "das", "ist"])],
    ["Portuguese", words(["o", "os", "e", "não", "do", "uma"])],
    ["Italian", words(["il", "di", "che", "è", "della"])],
  ];
  const top = latin.sort((a, b) => b[1] - a[1])[0];
  return top[1] > 0 ? top[0] : "English";
}

// PowerPoint: one segment per text paragraph, slides in order (matches doc-export translatePptx).
export async function parsePptx(buf: Uint8Array): Promise<Segment[]> {
  const { slideNames, PPTX_PARA, pptxParaText } = await import("@/lib/doc-export.server");
  const files = unzipSync(buf, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) });
  const out: Segment[] = [];
  for (const name of slideNames(files)) {
    const xml = strFromU8(files[name]);
    // Character ranges of title placeholders, so their paragraphs become headings.
    const titles = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
      .filter((m) => /<p:ph[^>]*type="(title|ctrTitle)"/.test(m[0]))
      .map((m) => [m.index!, m.index! + m[0].length]);
    for (const m of xml.matchAll(PPTX_PARA)) {
      const text = pptxParaText(m[0]).replace(/\s+/g, " ").trim();
      if (text) out.push({ text, formatHint: titles.some(([a, b]) => m.index! >= a && m.index! < b) ? "h2" : "p" });
    }
  }
  return out;
}
