import { createFileRoute } from "@tanstack/react-router";
import { AdminFinance } from "@/views/admin/pages";

export const Route = createFileRoute("/admin/finance")({
  head: () => ({
    meta: [
      { title: "Finance — Contentech Admin" },
      { name: "description", content: "Credit balances, transactions and payouts." },
      { property: "og:title", content: "Finance — Contentech Admin" },
      { property: "og:description", content: "Credit balances, transactions and payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminFinance />,
});
