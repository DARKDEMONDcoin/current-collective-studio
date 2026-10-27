// Lovable AI Gateway helpers: segment translation and scanned-PDF OCR.
import { generateResponse } from "@lovable.dev/ai-gateway";

const MODEL = "openai/gpt-6-astra" as const;

function outputText(res: { output?: unknown[] }): string {
  const parts: string[] = [];
  for (const item of (res.output ?? []) as { type?: string; content?: { type?: string; text?: string }[] }[]) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) if (c.type === "output_text" && c.text) parts.push(c.text);
  }
  return parts.join("");
}

/** Translate a batch of segments; returns translations in the same order. */
export async function translateBatch(
  texts: string[],
  source: string,
  target: string,
  context?: { industry?: string | null; companyBio?: string | null },
): Promise<string[]> {
  const ctx = [
    context?.industry ? `Client industry: ${context.industry}.` : "",
    context?.companyBio ? `Client background: ${context.companyBio}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const res = await generateResponse({
    model: MODEL,
    instructions:
      `You are a professional translator. Translate each segment from ${source} into ${target}. ` +
      `Preserve meaning, tone, numbers, names and inline formatting. Do not add commentary. ` +
      `Return JSON {"translations": string[]} with exactly ${texts.length} items in the same order.\n${ctx}`,
    input: JSON.stringify({ segments: texts }),
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
  });
  const parsed = JSON.parse(outputText(res)) as { translations: string[] };
  if (!Array.isArray(parsed.translations) || parsed.translations.length !== texts.length)
    throw new Error("Translation count mismatch");
  return parsed.translations;
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
  });
  return outputText(res).trim();
}

/** Free-form text generation (e.g. style guide drafting). */
export async function generateText(instructions: string, input: string): Promise<string> {
  const res = await generateResponse({ model: MODEL, instructions, input, reasoning: { effort: "low" } });
  return outputText(res as { output?: unknown[] }).trim();
}
