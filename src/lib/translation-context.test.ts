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
