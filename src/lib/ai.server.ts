// Lovable AI Gateway helpers: segment translation and scanned-PDF OCR.
import { generateResponse as rawGenerate } from "@lovable.dev/ai-gateway";
import { getSetting, logAiUsage } from "./settings.server";

// Every AI call uses the admin-selected model and is logged to ct_ai_usage for cost monitoring.
async function generateResponse(req: any, feature = "other"): Promise<any> {
  const ai = await getSetting("ai");
  const model = ai.model || MODEL;
  try {
    const res: any = await rawGenerate({ ...req, model } as any);
    void logAiUsage({ feature, model, usage: res?.usage });
    return res;
  } catch (e) {
    void logAiUsage({ feature, model, ok: false });
    throw e;
  }
}

const MODEL = "openai/gpt-6-astra" as const;

function outputText(res: { output?: unknown[] }): string {
  const parts: string[] = [];
  for (const item of (res.output ?? []) as { type?: string; content?: { type?: string; text?: string }[] }[]) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) if (c.type === "output_text" && c.text) parts.push(c.text);
  }
  return parts.join("");
}

export type TranslateContext = {
  industry?: string | null;
  companyBio?: string | null;
  glossary?: { term: string; target: string | null; dnt: boolean }[];
  style?: string;
  notes?: string;
  /** Per-segment feedback from validation; triggers a corrective pass. */
  feedback?: (string | null)[];
};

async function translateOnce(texts: string[], source: string, target: string, context?: TranslateContext): Promise<string[]> {
  const terms = (context?.glossary ?? [])
    .map((t) => (t.dnt ? `- "${t.term}" → keep exactly as "${t.term}" (do not translate)` : `- "${t.term}" → "${t.target}"`))
    .join("\n");
  const ctx = [
    context?.industry ? `Client industry: ${context.industry}.` : "",
    context?.companyBio ? `Client background: ${context.companyBio}` : "",
    terms ? `MANDATORY TERMINOLOGY (use these exact target terms, inflect only if grammar requires):\n${terms}` : "",
    context?.style ? `CLIENT STYLE GUIDE (follow it):\n${context.style}` : "",
    context?.notes ? `CLIENT INSTRUCTIONS:\n${context.notes}` : "",
    (await getSetting("ai")).extraInstructions ? `PLATFORM TRANSLATION POLICY:\n${(await getSetting("ai")).extraInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const input = context?.feedback?.some(Boolean)
    ? { segments: texts.map((t, i) => ({ text: t, fix: context!.feedback![i] ?? undefined })) }
    : { segments: texts };
  const res = await generateResponse({
    model: MODEL,
    instructions:
      `You are a senior professional translator and reviser. Translate each segment from ${source} into ${target}.\n` +
      `Rules:\n` +
      `1. Translate the complete meaning of every sentence; never omit, summarize or add content.\n` +
      `2. Write natural, fluent, grammatical ${target} with correct punctuation for that language (e.g. Arabic uses ، ؛ ؟).\n` +
      `3. Keep every number, amount, currency symbol, percentage, code, URL, email and company/product/person name exact. In dates keep the digits but translate month and weekday names into ${target} (e.g. "1 January 2027" → Arabic "1 يناير 2027"). Write number and currency formats the way ${target} readers expect, never changing the value (French: "3 200,50 €" / "3 200,50 $", German: "3.200,50 €"; English: "3,200.50"). For Arabic, Hebrew and Persian keep Western digits unless the style guide asks otherwise.\n` +
      `4. Keep inline markers, placeholders ({x}, %s, <tags>), bullets and leading numbering exactly.\n` +
      `5. Segments are consecutive parts of one document: keep terminology consistent between them.\n` +
      `6. If a segment is only a number, code or proper name, return it unchanged.\n` +
      `8. Every output must be written in ${target}, even if the client instructions or style guide mention another language.\n` +
      `7. If an item has a "fix" note, a previous attempt had that problem — correct it.\n` +
      `Return JSON {"translations": string[]} with exactly ${texts.length} items in the same order. No commentary.\n\n${ctx}`,
    input: JSON.stringify(input),
    text: {
      format: {
        type: "json_schema",
        name: "translations",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["translations"],
          properties: { translations: { type: "array", items: { type: "string" } } },
        },
      },
    },
  }, "translation");
  const parsed = JSON.parse(outputText(res)) as { translations: string[] };
  if (!Array.isArray(parsed.translations) || parsed.translations.length !== texts.length)
    throw new Error("Translation count mismatch");
  return parsed.translations;
}

/** Translate a batch of segments; returns translations in the same order.
 *  A count mismatch is retried once split in halves so one bad batch never drops segments. */
export async function translateBatch(texts: string[], source: string, target: string, context?: TranslateContext): Promise<string[]> {
  try {
    return await translateOnce(texts, source, target, context);
  } catch (e) {
    if (texts.length < 2 || !(e instanceof Error) || !/mismatch|JSON/i.test(e.message)) throw e;
    const mid = Math.ceil(texts.length / 2);
    const fb = context?.feedback;
    const [a, b] = await Promise.all([
      translateOnce(texts.slice(0, mid), source, target, { ...context, feedback: fb?.slice(0, mid) }),
      translateOnce(texts.slice(mid), source, target, { ...context, feedback: fb?.slice(mid) }),
    ]);
    return [...a, ...b];
  }
}

/** OCR a scanned PDF / image: returns plain text with paragraphs separated by blank lines. */
export async function ocrDocument(bytes: Uint8Array, filename: string, mime: string): Promise<string> {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const dataUrl = `data:${mime};base64,${btoa(bin)}`;
  const isImage = mime.startsWith("image/");
  const res = await generateResponse({
    model: MODEL,
    instructions:
      "Extract all readable text from this scanned document exactly as written, in reading order. " +
      "Separate paragraphs, headings and list items with a blank line. Output only the text.",
    input: [
      {
        role: "user",
        content: [
          isImage
            ? { type: "input_image", image_url: dataUrl, detail: "high" }
            : { type: "input_file", filename, file_data: dataUrl },
          { type: "input_text", text: "Transcribe this document." },
        ],
      },
    ],
  }, "ocr");
  return outputText(res).trim();
}

/** Free-form text generation (e.g. style guide drafting). */
export async function generateText(instructions: string, input: string): Promise<string> {
  const res = await generateResponse({ model: MODEL, instructions, input, reasoning: { effort: "low" } }, "generate");
  return outputText(res as { output?: unknown[] }).trim();
}
