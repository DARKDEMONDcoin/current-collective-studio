// Arabic contextual shaping into Unicode Presentation Forms-B.
// pdf-lib draws glyphs without OpenType mark positioning, so fonts that build final letters from
// a dotless base + dot mark render the dots in the wrong place. Precomposed presentation forms
// carry their dots inside the glyph, so we shape the text ourselves before drawing.

// [isolated, final, initial?, medial?] — letters without initial/medial never join the next letter.
const F: Record<string, number[]> = {
  "ء": [0xfe80], "آ": [0xfe81, 0xfe82], "أ": [0xfe83, 0xfe84], "ؤ": [0xfe85, 0xfe86], "إ": [0xfe87, 0xfe88],
  "ئ": [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], "ا": [0xfe8d, 0xfe8e], "ب": [0xfe8f, 0xfe90, 0xfe91, 0xfe92], "ة": [0xfe93, 0xfe94],
  "ت": [0xfe95, 0xfe96, 0xfe97, 0xfe98], "ث": [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], "ج": [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  "ح": [0xfea1, 0xfea2, 0xfea3, 0xfea4], "خ": [0xfea5, 0xfea6, 0xfea7, 0xfea8], "د": [0xfea9, 0xfeaa], "ذ": [0xfeab, 0xfeac],
  "ر": [0xfead, 0xfeae], "ز": [0xfeaf, 0xfeb0], "س": [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], "ش": [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  "ص": [0xfeb9, 0xfeba, 0xfebb, 0xfebc], "ض": [0xfebd, 0xfebe, 0xfebf, 0xfec0], "ط": [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  "ظ": [0xfec5, 0xfec6, 0xfec7, 0xfec8], "ع": [0xfec9, 0xfeca, 0xfecb, 0xfecc], "غ": [0xfecd, 0xfece, 0xfecf, 0xfed0],
  "ف": [0xfed1, 0xfed2, 0xfed3, 0xfed4], "ق": [0xfed5, 0xfed6, 0xfed7, 0xfed8], "ك": [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  "ل": [0xfedd, 0xfede, 0xfedf, 0xfee0], "م": [0xfee1, 0xfee2, 0xfee3, 0xfee4], "ن": [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  "ه": [0xfee9, 0xfeea, 0xfeeb, 0xfeec], "و": [0xfeed, 0xfeee], "ى": [0xfeef, 0xfef0], "ي": [0xfef1, 0xfef2, 0xfef3, 0xfef4],
};
const LAM_ALEF: Record<string, [number, number]> = { "آ": [0xfef5, 0xfef6], "أ": [0xfef7, 0xfef8], "إ": [0xfef9, 0xfefa], "ا": [0xfefb, 0xfefc] };
const TRANSPARENT = /[\u064B-\u065F\u0670]/;
const joinsNext = (c?: string) => !!c && (c === "\u0640" || (F[c]?.length ?? 0) === 4);
const joinable = (c?: string) => !!c && (c === "\u0640" || !!F[c]);

export function shapeArabic(text: string): string {
  const ch = [...text];
  const prevLetter = (i: number) => { for (let j = i - 1; j >= 0; j--) if (!TRANSPARENT.test(ch[j])) return ch[j]; return undefined; };
  const nextIdx = (i: number) => { for (let j = i + 1; j < ch.length; j++) if (!TRANSPARENT.test(ch[j])) return j; return -1; };
  let out = "";
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    const forms = F[c];
    if (!forms) { out += c; continue; }
    const p = prevLetter(i);
    const ni = nextIdx(i);
    const n = ni >= 0 ? ch[ni] : undefined;
    const jp = joinsNext(p);
    // Lam + Alef ligature
    if (c === "ل" && n && LAM_ALEF[n]) {
      out += String.fromCodePoint(LAM_ALEF[n][jp ? 1 : 0]);
      for (let k = i + 1; k < ni; k++) out += ch[k]; // keep marks between lam and alef
      i = ni;
      continue;
    }
    const jn = forms.length === 4 && joinable(n);
    const cp = jp && jn ? forms[3] : jp ? forms[1] ?? forms[0] : jn ? forms[2] : forms[0];
    out += String.fromCodePoint(cp);
  }
  return out;
}
