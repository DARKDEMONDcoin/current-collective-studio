import { describe, it, expect } from "vitest";
import { checkSegment } from "./translation-context.server";

const terms = [{ term: "service level agreement", target: "اتفاقية مستوى الخدمة", dnt: false, caseSensitive: false }];

describe("translation validation", () => {
  it("flags a changed amount", () => {
    expect(checkSegment("Total: $2,450,000", "الإجمالي: 2,540,000 دولار", [], false)[0]).toMatch(/numbers/);
  });
  it("accepts Arabic-Indic digits for the same number", () => {
    expect(checkSegment("Due in 15 days", "خلال ١٥ يومًا", [], false)).toEqual([]);
  });
  it("flags a missing glossary term", () => {
    expect(checkSegment("Read the service level agreement.", "اقرأ عقد الخدمة.", terms, false).join()).toMatch(/glossary/);
  });
  it("flags an empty translation", () => {
    expect(checkSegment("Hello world", "", [], false)).toEqual(["empty translation"]);
  });
});

describe("target language checks", () => {
  it("flags Arabic text delivered for a Hebrew order", () => {
    expect(checkSegment("Keep all client data confidential.", "الحفاظ على سرية جميع بيانات العميل.", [], false, "Hebrew").join()).toMatch(/not written in Hebrew/);
  });
  it("flags English month names left in an Arabic translation", () => {
    expect(checkSegment("Starts on 1 January 2027.", "يبدأ في 1 January 2027.", [], false, "Arabic").join()).toMatch(/month/);
  });
  it("accepts a correct Arabic sentence with a protected brand name", () => {
    const dnt = [{ term: "Contentech", target: "Contentech", dnt: true, caseSensitive: true }];
    expect(checkSegment("Contentech starts on 1 January 2027.", "تبدأ Contentech في 1 يناير 2027.", dnt, false, "Arabic")).toEqual([]);
  });
});

import { normNumber, checkSegment as cs } from "./translation-context.server";
describe("locale number formats", () => {
  it("treats French 3 200 and English 3,200 as the same amount", () => {
    expect(normNumber("3 200")).toBe(normNumber("3,200"));
    expect(normNumber("3\u202f200,50")).toBe("3200.5");
    expect(normNumber("3,200.50")).toBe("3200.5");
  });
  it("does not flag a correctly localized French amount", () => {
    expect(cs("The fee is $3,200.50 for 12 pages.", "Les frais s'élèvent à 3\u202f200,50 $ pour 12 pages.", [], true, "French")).toEqual([]);
  });
  it("still flags a changed amount", () => {
    expect(cs("The fee is $3,200.", "Les frais s'élèvent à 3\u202f300 $.", [], true, "French").join()).toMatch(/numbers/);
  });
});

import { shapeArabic } from "./arabic-shape";
describe("Arabic PDF shaping", () => {
  it("uses joined letter forms and the lam-alef ligature", () => {
    // بين = initial beh, medial yeh, final noon
    expect([...shapeArabic("بين")].map((c) => c.codePointAt(0)!.toString(16))).toEqual(["fe91", "fef4", "fee6"]);
    expect(shapeArabic("لا")).toBe("\ufefb");
  });
});
