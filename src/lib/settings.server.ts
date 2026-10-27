// Admin-managed platform settings (ct_admin_settings, admin-only RLS). Read here with the
// service client and cached briefly so every request applies the current rules.
import { DEFAULT_SETTINGS, type SettingsKey, type Settings } from "./settings-defaults";

const cache = new Map<string, { at: number; v: unknown }>();

export async function getSetting<K extends SettingsKey>(key: K): Promise<Settings[K]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.v as Settings[K];
  let v: Settings[K] = DEFAULT_SETTINGS[key];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("ct_admin_settings").select("value").eq("key", key).maybeSingle();
    if (data?.value && typeof data.value === "object") v = { ...DEFAULT_SETTINGS[key], ...data.value };
  } catch {
    /* fall back to defaults */
  }
  cache.set(key, { at: Date.now(), v });
  return v;
}

// Approximate list prices (USD per 1M tokens) used only for the admin cost estimate.
const PRICES: Record<string, [number, number]> = {
  "openai/gpt-6-astra": [1.25, 10],
  "google/gemini-3-flash-preview": [0.3, 2.5],
  "google/gemini-2.5-pro": [1.25, 10],
};

export async function logAiUsage(row: { feature: string; model: string; usage?: any; ok?: boolean; projectId?: string | null; orgId?: string | null }) {
  try {
    const i = Number(row.usage?.input_tokens ?? row.usage?.prompt_tokens ?? 0) || 0;
    const o = Number(row.usage?.output_tokens ?? row.usage?.completion_tokens ?? 0) || 0;
    const [pi, po] = PRICES[row.model] ?? [1.25, 10];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("ct_ai_usage").insert({
      feature: row.feature, model: row.model, input_tokens: i, output_tokens: o,
      cost_usd: (i * pi + o * po) / 1e6, ok: row.ok !== false, project_id: row.projectId ?? null, organization_id: row.orgId ?? null,
    });
  } catch {
    /* usage logging must never break a translation */
  }
}
