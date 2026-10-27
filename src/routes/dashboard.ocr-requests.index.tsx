import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/ocr/list";

export const Route = createFileRoute("/dashboard/ocr-requests/")({
  head: () => ({ meta: [{ title: "OCR Requests — Contentech" }, { name: "description", content: "OCR Requests in your Contentech client portal." }] }),
  component: Page,
});
