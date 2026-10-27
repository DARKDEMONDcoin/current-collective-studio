import { describe, it, expect } from "vitest";
import { validateSetting } from "./settings-defaults";

describe("admin settings validation", () => {
  it("rejects an AI model outside the allowed list", () => {
    expect(() => validateSetting("ai", { model: "evil/model" })).toThrow();
  });
  it("limits the preferred window to 168 hours", () => {
    expect(() => validateSetting("routing", { preferredWindowHours: 200, maxActiveJobsPerLinguist: 5 })).toThrow();
    expect(validateSetting("routing", { preferredWindowHours: 48, maxActiveJobsPerLinguist: 3 })).toEqual({ preferredWindowHours: 48, maxActiveJobsPerLinguist: 3 });
  });
  it("requires at least one active job per Linguist", () => {
    expect(() => validateSetting("routing", { preferredWindowHours: 1, maxActiveJobsPerLinguist: 0 })).toThrow();
  });
  it("rejects an invalid support email", () => {
    expect(() => validateSetting("general", { supportEmail: "nope" })).toThrow();
  });
  it("rejects unknown keys", () => {
    expect(() => validateSetting("secrets", {})).toThrow();
  });
});
