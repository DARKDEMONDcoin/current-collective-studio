import { shapeArabic } from "./arabic-shape";
// Builds the translated deliverable for a job.
//  - DOCX / PPTX with an original file: the original package is reopened and only the
//    paragraph text is swapped, so styles, tables, images, slide layout stay intact.
//  - DOCX without an original (TXT / PDF / pasted text): a clean Word file.
//  - PDF: a real PDF (pdf-lib) with the translated text re-flowed on A4 pages; Arabic and
//    Hebrew are shaped and right-aligned. The original PDF's page layout cannot be rebuilt.
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { docxTextParts } from "@/lib/doc-parse.server";

export type Pair = { source: string; target: string; hint: string };

const RTL_LANGS = ["ar", "he", "fa", "ur", "arabic", "hebrew", "persian", "farsi", "urdu"];
export const isRtl = (lang: string) => RTL_LANGS.includes(String(lang).toLowerCase().trim());

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Walks paragraphs in order and pairs each with the next matching source segment. */
function makeMatcher(pairs: Pair[]) {
  let k = 0;
  return (text: string): string | null => {
    const t = norm(text);
    if (!t) return null;
    for (let j = k; j < Math.min(pairs.length, k + 8); j++) {
      if (norm(pairs[j].source) === t) {
        k = j + 1;
        return pairs[j].target;
      }
    }
    return null;
  };
}

const PPR_AFTER_BIDI = ["adjustRightInd", "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange"];
const RPR_AFTER_RTL = ["cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath", "rPrChange"];
const TBL_AFTER_BIDI = ["tblStyleRowBandSize", "tblStyleColBandSize", "tblW", "jc", "tblCellSpacing", "tblInd", "tblBorders", "shd", "tblLayout", "tblCellMar", "tblLook", "tblCaption", "tblDescription", "tblPrChange"];
// Word treats jc left/right as logical (start/end) in bidi paragraphs and tables, so alignment needs no change.
const mirrorJc = (x: string) => x;
function insertBefore(inner: string, after: string[], el: string): string {
  let at = -1;
  for (const name of after) {
    const m = inner.match(new RegExp(`<w:${name}[ />]`));
    if (m && m.index !== undefined && (at < 0 || m.index < at)) at = m.index;
  }
  return at < 0 ? inner + el : inner.slice(0, at) + el + inner.slice(at);
}

// ── DOCX ────────────────────────────────────────────────────────
function docxParagraph(p: string, target: string, rtl: boolean): string {
  let first = true;
  let out = p.replace(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>/g, () => {
    if (!first) return "<w:t></w:t>";
    first = false;
    return `<w:t xml:space="preserve">${esc(target)}</w:t>`;
  });
  out = out.replace(/<w:tab\/>/g, "");
  if (rtl) {
    // Insert in schema order so Word never reports the file as damaged.
    out = out.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, (_m, inner) => {
      // An explicit LTR flag (w:bidi w:val="0") must be overridden, not kept.
      inner = inner.replace(/<w:bidi(?: [^>]*)?\/>/g, "");
      inner = mirrorJc(inner.replace(/<w:rPr>[\s\S]*$/, "")) + (inner.match(/<w:rPr>[\s\S]*$/)?.[0] ?? "");
      return `<w:pPr>${insertBefore(inner, PPR_AFTER_BIDI, "<w:bidi/>")}</w:pPr>`;
    });
    out = out.replace(/<w:pPr\/>/, "<w:pPr><w:bidi/></w:pPr>");
    if (!/<w:pPr>/.test(out)) out = out.replace(/^<w:p( [^>]*)?>/, (m) => `${m}<w:pPr><w:bidi/></w:pPr>`);
    out = out.replace(/(<w:r(?: [^>]*)?>)<w:rPr>([\s\S]*?)<\/w:rPr>/g, (m, r, inner) =>
      inner.includes("<w:rtl") ? m : `${r}<w:rPr>${insertBefore(inner, RPR_AFTER_RTL, "<w:rtl/>")}</w:rPr>`);
    out = out.replace(/<w:r( [^>]*)?>(?!<w:rPr>)/g, (m) => `${m}<w:rPr><w:rtl/></w:rPr>`);
  }
  return out;
}

export function translateDocx(original: Uint8Array, pairs: Pair[], rtl: boolean): { bytes: Uint8Array; matched: number } {
  const files = unzipSync(original);
  if (!files["word/document.xml"]) throw new Error("Not a Word document");
  const match = makeMatcher(pairs);
  let matched = 0;
  for (const part of docxTextParts(files)) {
  const doc = strFromU8(files[part]).replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
    const text = decodeXml(
      [...p.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map((t) => (t[1] === undefined ? " " : t[1])).join(""),
    );
    const target = match(text);
    if (target == null) return p;
    matched++;
    return docxParagraph(p, target, rtl);
  });
  files[part] = strToU8(doc);
  }
  if (rtl && files["word/document.xml"]) {
    // Tables read right-to-left (column order flips like in Word's RTL table option).
    files["word/document.xml"] = strToU8(
      strFromU8(files["word/document.xml"]).replace(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/g, (m, inner) =>
        inner.includes("<w:bidiVisual") ? m : `<w:tblPr>${insertBefore(mirrorJc(inner), TBL_AFTER_BIDI, "<w:bidiVisual/>")}</w:tblPr>`,
      ),
    );
  }
  return { bytes: zipSync(files), matched };
}

export function buildDocx(pairs: Pair[], rtl: boolean): Uint8Array {
  const body = pairs
    .map(({ target, hint }) => {
      const h = hint.match(/^h(\d)$/)?.[1];
      const pPr = `<w:pPr>${h ? `<w:pStyle w:val="Heading${h}"/>` : ""}${rtl ? "<w:bidi/>" : ""}</w:pPr>`;
      const rPr = `<w:rPr>${h ? "<w:b/>" : ""}${h ? `<w:sz w:val="${36 - Number(h) * 4}"/>` : ""}${rtl ? "<w:rtl/>" : ""}</w:rPr>`;
      return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(target)}</w:t></w:r></w:p>`;
    })
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr>${rtl ? "<w:bidi/>" : ""}</w:sectPr></w:body></w:document>`,
    ),
  });
}

// ── PPTX ────────────────────────────────────────────────────────
export const slideNames = (files: Record<string, Uint8Array>) =>
  Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));

export const PPTX_PARA = /<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g;
export const pptxParaText = (p: string) =>
  decodeXml([...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:t\/>/g)].map((t) => t[1] ?? "").join(""));

export function translatePptx(original: Uint8Array, pairs: Pair[], rtl: boolean): { bytes: Uint8Array; matched: number } {
  const files = unzipSync(original);
  const match = makeMatcher(pairs);
  let matched = 0;
  for (const name of slideNames(files)) {
    const xml = strFromU8(files[name]).replace(PPTX_PARA, (p) => {
      const target = match(pptxParaText(p));
      if (target == null) return p;
      matched++;
      let first = true;
      let out = p.replace(/<a:t>[\s\S]*?<\/a:t>/g, () => {
        if (!first) return "<a:t></a:t>";
        first = false;
        return `<a:t>${esc(target)}</a:t>`;
      });
      if (rtl) {
        if (/<a:pPr\b/.test(out)) out = out.replace(/<a:pPr\b(?![^>]*rtl=)/, '<a:pPr rtl="1"');
        else out = out.replace(/^<a:p(\s[^>]*)?>/, (m) => `${m}<a:pPr rtl="1"/>`);
      }
      return out;
    });
    files[name] = strToU8(xml);
  }
  return { bytes: zipSync(files), matched };
}

// ── PDF ─────────────────────────────────────────────────────────
const FONT_BASE = "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts";
const FONTS = {
  latin: `${FONT_BASE}/NotoSans/hinted/ttf/NotoSans-Regular.ttf`,
  latinBold: `${FONT_BASE}/NotoSans/hinted/ttf/NotoSans-Bold.ttf`,
  arabic: `${FONT_BASE}/NotoSansArabic/hinted/ttf/NotoSansArabic-Regular.ttf`,
  hebrew: `${FONT_BASE}/NotoSansHebrew/hinted/ttf/NotoSansHebrew-Regular.ttf`,
};
const fontCache = new Map<string, Uint8Array>();
async function loadFont(url: string) {
  const hit = fontCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font download failed (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  fontCache.set(url, bytes);
  return bytes;
}

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
// Scripts the bundled fonts cannot draw (CJK, Indic, Thai, ...).
const UNSUPPORTED = /[\u0900-\u0DFF\u0E00-\u0EFF\u1000-\u109F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

export class PdfScriptUnsupported extends Error {}

export async function buildPdf(pairs: Pair[], rtl: boolean, title: string): Promise<Uint8Array> {
  const all = pairs.map((p) => p.target).join("\n");
  if (UNSUPPORTED.test(all)) throw new PdfScriptUnsupported("PDF export does not support this language yet.");
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  const needAr = ARABIC.test(all);
  const needHe = HEBREW.test(all);
  const [latin, latinBold, ar, he] = await Promise.all([
    loadFont(FONTS.latin).then((b) => doc.embedFont(b, { subset: true })),
    loadFont(FONTS.latinBold).then((b) => doc.embedFont(b, { subset: true })),
    needAr ? loadFont(FONTS.arabic).then((b) => doc.embedFont(b, { subset: true })) : null,
    needHe ? loadFont(FONTS.hebrew).then((b) => doc.embedFont(b, { subset: true })) : null,
  ]);
  type Font = typeof latin;
  const charsets = new Map<Font, Set<number>>();
  const has = (f: Font, ch: string) => {
    if (!charsets.has(f)) charsets.set(f, new Set(f.getCharacterSet()));
    return charsets.get(f)!.has(ch.codePointAt(0)!);
  };
  const fontFor = (ch: string, bold: boolean): Font =>
    ar && ARABIC.test(ch) ? ar : he && HEBREW.test(ch) ? he : bold ? latinBold : latin;

  // Split text into runs that share one font; neutral characters join the current run.
  const runs = (text: string, bold: boolean) => {
    const out: { text: string; font: Font; rtl: boolean }[] = [];
    for (const ch of text) {
      const neutral = /[\s.,;:!?()\-"'،؛؟]/.test(ch);
      const prev = out[out.length - 1]?.font;
      const f = neutral && prev && has(prev, ch) ? prev : fontFor(ch, bold);
      const last = out[out.length - 1];
      if (last && last.font === f) last.text += ch;
      else out.push({ text: ch, font: f, rtl: f === ar || f === he });
    }
    return out;
  };
  const width = (text: string, size: number, bold: boolean) =>
    runs(text, bold).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);

  const W = 595.28, H = 841.89, M = 56;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const color = rgb(0.13, 0.17, 0.22);

  for (const { target: raw, hint } of pairs) {
    const target = ARABIC.test(raw) ? shapeArabic(raw) : raw;
    const h = Number(hint.match(/^h(\d)$/)?.[1] ?? 0);
    const size = h === 1 ? 20 : h === 2 ? 16 : h ? 13.5 : 11;
    const bold = h > 0;
    const lead = size * 1.55;
    // Word wrap
    const lines: string[] = [];
    let cur = "";
    for (const word of target.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (width(next, size, bold) > W - 2 * M && cur) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    y -= h ? size * 0.6 : 0;
    for (const line of lines) {
      if (y - lead < M) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
      y -= lead;
      const rs = runs(line, bold);
      const total = rs.reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
      // RTL paragraphs: right-aligned. Simplified Unicode bidi: Latin letters/digits are LTR,
      // Arabic/Hebrew are RTL, and spaces/punctuation take LTR only when both neighbours are LTR
      // (so "Contentech Ltd" and "3,200" stay together while the sentence-final "." ends up on the left).
      let x = rtl ? W - M : M;
      if (rtl) {
        const chars = [...line];
        const dir = chars.map((ch) => (/[\u0590-\u08FF\uFB1D-\uFEFC]/.test(ch) ? "R" : /[A-Za-z0-9\u00C0-\u024F\u0400-\u04FF$€£%]/.test(ch) ? "L" : "N"));
        const strongAt = (i: number, step: number) => { for (let j = i; j >= 0 && j < dir.length; j += step) if (dir[j] !== "N") return dir[j]; return "R"; };
        const res = dir.map((d, i) => (d !== "N" ? d : strongAt(i, -1) === "L" && strongAt(i, 1) === "L" ? "L" : "R"));
        // Level runs: consecutive chars with the same resolved direction.
        const levels: { d: string; text: string }[] = [];
        chars.forEach((ch, i) => {
          const last = levels[levels.length - 1];
          if (last && last.d === res[i]) last.text += ch; else levels.push({ d: res[i], text: ch });
        });
        for (const lv of levels) {
          const sub = runs(lv.text, bold);
          const w = sub.reduce((n, r) => n + r.font.widthOfTextAtSize(r.text, size), 0);
          if (lv.d === "L") {
            let lx = x - w;
            for (const r of sub) { page.drawText(r.text, { x: lx, y, size, font: r.font, color }); lx += r.font.widthOfTextAtSize(r.text, size); }
            x -= w;
          } else {
            for (const r of sub) {
              const rw = r.font.widthOfTextAtSize(r.text, size);
              x -= rw;
              // Neutral-only runs in a Latin font are drawn reversed so ", " reads correctly right-to-left.
              page.drawText(r.rtl ? r.text : [...r.text].reverse().join(""), { x, y, size, font: r.font, color });
            }
          }
        }
      } else {
        for (const r of rs) {
          page.drawText(r.text, { x, y, size, font: r.font, color });
          x += r.font.widthOfTextAtSize(r.text, size);
        }
      }
      void total;
    }
    y -= size * 0.6;
  }
  return doc.save();
}
