import { createFileRoute } from "@tanstack/react-router";
import { AdminRates } from "@/views/admin/pages";

export const Route = createFileRoute("/admin/credit-packages")({
  head: () => ({
    meta: [
      { title: "Credit Packages — Contentech Admin" },
      { name: "description", content: "Credit packages for clients." },
      { property: "og:title", content: "Credit Packages — Contentech Admin" },
      { property: "og:description", content: "Credit packages for clients." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminRates focus="packages" />,
});
