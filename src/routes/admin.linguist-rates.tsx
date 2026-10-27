import { createFileRoute } from "@tanstack/react-router";
import { AdminRates } from "@/views/admin/pages";

export const Route = createFileRoute("/admin/linguist-rates")({
  head: () => ({
    meta: [
      { title: "Reviewer Rates — Contentech Admin" },
      { name: "description", content: "Linguist pay per word." },
      { property: "og:title", content: "Reviewer Rates — Contentech Admin" },
      { property: "og:description", content: "Linguist pay per word." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminRates focus="linguist" />,
});
