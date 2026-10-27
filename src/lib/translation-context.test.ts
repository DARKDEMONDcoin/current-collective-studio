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
