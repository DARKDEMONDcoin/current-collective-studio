import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/portal/jobs/detail";

export const Route = createFileRoute("/portal/jobs/$id/")({
  head: () => ({ meta: [{ title: "Job — Contentech Linguist Portal" }, { name: "robots", content: "noindex" }] }),
  component: View,
});
