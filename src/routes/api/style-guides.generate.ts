import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx, short } from "@/lib/org-api";
import { generateText } from "@/lib/ai.server";

export const Route = createFileRoute("/api/style-guides/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const f = (k: string, d: string) => short(b[k], 300) ?? d;
        const industry = short(b.industry, 120);
        if (!industry) return jerr("Industry is required");
        const prompt = `Write a professional translation style guide for the following organization.

Context:
- Industry: ${industry}
- Country / Primary Market: ${f("country", "Not specified")}
- Services or Products: ${f("servicesProducts", "Not specified")}
- Target Audience: ${f("targetAudience", "General public")}
- Tone: ${f("tone", "Professional")}
- Formality: ${f("formality", "Semi-formal")}
- Target Languages: ${f("languages", "Not specified")}
${short(b.additionalNotes, 1000) ? `- Notes: ${short(b.additionalNotes, 1000)}` : ""}

Write a concise but complete style guide covering these sections (2-4 sentences or bullet points each):
1. OVERVIEW
2. TONE AND VOICE
3. FORMALITY AND REGISTER
4. TERMINOLOGY
5. FORMATTING RULES
6. CULTURAL ADAPTATION
7. BRAND NAMES AND TRADEMARKS
8. CONSISTENCY RULES
9. QA CHECKLIST`;
        try {
          const content = await generateText(
            "You are an expert technical writer specializing in translation style guides for enterprise localization teams. Write structured, concise, and immediately actionable guides. Plain text, no markdown tables.",
            prompt,
          );
          if (!content) return jerr("AI returned an empty response. Please try again.", 500);
          return Response.json({ content });
        } catch (e) {
          console.error("[style-guides/generate]", e);
          return jerr("Failed to reach AI service. Please try again.", 500);
        }
      },
    },
  },
});
