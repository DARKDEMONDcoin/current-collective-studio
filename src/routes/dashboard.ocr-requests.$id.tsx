import { createFileRoute } from "@tanstack/react-router";
import OcrRequestDetail from "@/views/dashboard/ocr/detail";

export const Route = createFileRoute("/dashboard/ocr-requests/$id")({
  head: () => ({ meta: [{ title: "OCR Request — Contentech" }, { name: "description", content: "Review scanned text in your Contentech client portal." }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <OcrRequestDetail id={id} />;
}
