import { createFileRoute } from "@tanstack/react-router";
import ResourcesPage from "@/views/resources/index";
import { getResourcesHub } from "@/lib/public-data.functions";

const title = "Resources — Contentech";
const description =
  "Guides, integrations, AI & LLM education, file format support, credits explained, and role-based help for every user of the Contentech platform.";

export const Route = createFileRoute("/resources/")({
  loader: () => getResourcesHub(),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return <ResourcesPage {...Route.useLoaderData()} />;
}
