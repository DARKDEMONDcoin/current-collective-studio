import { createFileRoute } from "@tanstack/react-router";
import { AdminRates } from "@/views/admin/pages";

export const Route = createFileRoute("/admin/credit-rates")({
  head: () => ({
    meta: [
      { title: "Credit Rates — Contentech Admin" },
      { name: "description", content: "Credits charged per word." },
      { property: "og:title", content: "Credit Rates — Contentech Admin" },
      { property: "og:description", content: "Credits charged per word." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminRates focus="credit" />,
});
