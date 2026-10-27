import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/services/localization-engineering";

export const Route = createFileRoute("/services/localization-engineering")({
  head: () => ({
    meta: [
      { title: "Localization Engineering — Contentech" },
      {
        name: "description",
        content: "File engineering, integrations and workflow automation for localization.",
      },
      { property: "og:title", content: "Localization Engineering — Contentech" },
      {
        property: "og:description",
        content: "File engineering, integrations and workflow automation for localization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
