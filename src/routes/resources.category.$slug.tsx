import { createFileRoute, notFound } from "@tanstack/react-router";
import ResourceCategoryPage from "@/views/resources/category";
import { getResourceCategory } from "@/lib/public-data.functions";

export const Route = createFileRoute("/resources/category/$slug")({
  loader: async ({ params }) => {
    const d = await getResourceCategory({ data: params.slug });
    if (!d.category) throw notFound();
    return d;
  },
  head: ({ loaderData }) => {
    const c = loaderData?.category;
    const title = c ? `${c.name} — Resources — Contentech` : "Unavailable — Contentech";
    const description =
      c?.description ?? (c ? `Resources and guides for ${c.name}` : "Contentech resources");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        ...(c ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: Page,
});

function Page() {
  return <ResourceCategoryPage {...Route.useLoaderData()} />;
}
