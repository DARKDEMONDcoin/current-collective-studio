// Shape + defaults of admin settings. Shared by the server (enforcement) and the admin UI.
export const AI_MODELS = ["openai/gpt-6-astra", "google/gemini-2.5-pro", "google/gemini-3-flash-preview"] as const;

export const DEFAULT_SETTINGS = {
  ai: { model: "openai/gpt-6-astra" as string, extraInstructions: "", correctivePass: true },
  routing: { preferredWindowHours: 24, maxActiveJobsPerLinguist: 5 },
  general: { ordersPaused: false, pauseMessage: "New orders are temporarily paused for maintenance.", supportEmail: "" },
  email_templates: {
    order_completed: { subject: "Your translation is ready", body: "Hello {{name}},\n\nYour project \"{{project}}\" is complete and ready to download.\n\n{{link}}" },
    review_requested: { subject: "Your approval is needed", body: "Hello {{name}},\n\nA Linguist submitted \"{{project}}\" for your review.\n\n{{link}}" },
    order_refunded: { subject: "Credits refunded", body: "Hello {{name}},\n\nWe could not complete \"{{project}}\". {{credits}} credits were returned to your balance." },
    payment_received: { subject: "Payment received", body: "Hello {{name}},\n\nThank you. {{credits}} credits were added to your account." },
  } as Record<string, { subject: string; body: string }>,
};
export type Settings = typeof DEFAULT_SETTINGS;
export type SettingsKey = keyof Settings;

/** Validates admin input for a settings key; throws on invalid values. */
export function validateSetting(key: string, v: any): any {
  if (!v || typeof v !== "object") throw new Error("Invalid settings");
  const str = (x: unknown, max: number) => String(x ?? "").slice(0, max);
  const int = (x: unknown, min: number, max: number) => {
    const n = Math.trunc(Number(x));
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Value must be between ${min} and ${max}`);
    return n;
  };
  switch (key) {
    case "ai":
      if (!AI_MODELS.includes(v.model)) throw new Error("Unknown model");
      return { model: v.model, extraInstructions: str(v.extraInstructions, 2000), correctivePass: v.correctivePass !== false };
    case "routing":
      return { preferredWindowHours: int(v.preferredWindowHours, 0, 168), maxActiveJobsPerLinguist: int(v.maxActiveJobsPerLinguist, 1, 100) };
    case "general": {
      const email = str(v.supportEmail, 200).trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Invalid support email");
      return { ordersPaused: !!v.ordersPaused, pauseMessage: str(v.pauseMessage, 300), supportEmail: email };
    }
    case "email_templates": {
      const out: Record<string, { subject: string; body: string }> = {};
      for (const k of Object.keys(DEFAULT_SETTINGS.email_templates)) {
        const t = v[k] ?? DEFAULT_SETTINGS.email_templates[k];
        if (!String(t.subject ?? "").trim()) throw new Error(`Subject required for ${k}`);
        out[k] = { subject: str(t.subject, 200), body: str(t.body, 5000) };
      }
      return out;
    }
    default:
      throw new Error("Unknown settings key");
  }
}
