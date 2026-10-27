import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { clientFilter, jerr, orgCtx, short, validClientAccount } from "@/lib/org-api";
import { parseDocx, parsePdf } from "@/lib/doc-parse.server";

async function extract(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["txt", "md", "markdown", "html", "json"].includes(ext)) return file.text();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (ext === "docx") return parseDocx(buf).map((s) => s.text).join("\n");
  if (ext === "pdf") return (await parsePdf(buf)).segments.map((s) => s.text).join("\n");
  throw new Error("Unsupported file type. Supported: .txt, .md, .html, .json, .docx, .pdf");
}

const COLS = "id,name,file_name,mime_type,created_at,updated_at,client_account_id,clientAccount:ct_client_accounts(id,name)";

export const Route = createFileRoute("/api/style-guides")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const q = ctx.supabase.from("ct_style_guides").select(COLS).order("updated_at", { ascending: false });
        const { data, error } = await clientFilter(q as any, request.url);
        if (error) return jerr("Could not load style guides", 500);
        return Response.json(camel(data ?? []));
      },
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const form = await request.formData().catch(() => null);
        if (!form) return jerr("Invalid form");
        const file = form.get("file") as File | null;
        const name = short(form.get("name"), 200);
        const generated = form.get("content") as string | null;
        const clientAccountId = (form.get("clientAccountId") as string) || null;
        if (!(await validClientAccount(ctx, clientAccountId))) return jerr("Invalid client account");
        let content: string, fileName: string, mime = "text/plain";
        if (generated && (!file || typeof file === "string")) {
          if (!name) return jerr("Name is required");
          content = generated;
          fileName = `${name.toLowerCase().replace(/\s+/g, "-")}.txt`;
        } else {
          if (!file || typeof file === "string") return jerr("No file uploaded");
          if (file.size > 10_000_000) return jerr("File too large (max 10MB)");
          try { content = await extract(file); } catch (e) { return jerr(e instanceof Error ? e.message : "Could not read file"); }
          fileName = file.name.slice(0, 200);
          mime = file.type || mime;
        }
        if (!content.trim()) return jerr("File is empty or has no extractable text");
        if (content.length > 500_000) return jerr("Extracted text too large (max 500K characters)");
        const { data, error } = await ctx.supabase
          .from("ct_style_guides")
          .insert({ organization_id: ctx.orgId, name: name || fileName, file_name: fileName, mime_type: mime, content, client_account_id: clientAccountId })
          .select(COLS)
          .single();
        if (error) return jerr("Could not save style guide", 500);
        return Response.json(camel(data), { status: 201 });
      },
    },
  },
});
