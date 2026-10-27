import { createFileRoute } from "@tanstack/react-router";
import { AdminComingSoon } from "@/views/admin/pages";

const names: Record<string, string> = { routing: "Routing Monitor", "ai-config": "AI Configuration", notifications: "Notifications", plans: "Plans", "llm-usage": "LLM Usage", content: "Site Content", resources: "Resources CMS", settings: "Settings" };

export const Route = createFileRoute("/admin/$")({
  head: () => ({
    meta: [
      { title: "Admin — Contentech Admin" },
      { name: "description", content: "Contentech admin section." },
      { property: "og:title", content: "Admin — Contentech Admin" },
      { property: "og:description", content: "Contentech admin section." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: function Soon() {
    const { _splat } = Route.useParams();
    const key = String(_splat ?? "").split("/")[0];
    return <AdminComingSoon area={names[key] ?? "Admin"} />;
  },
});
