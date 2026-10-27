import { createFileRoute, notFound } from "@tanstack/react-router";
import ResourceArticlePage from "@/views/resources/article";
import { getResourceArticle } from "@/lib/public-data.functions";

export const Route = createFileRoute("/resources/$slug")({
  loader: async ({ params }) => {
    const article = await getResourceArticle({ data: params.slug });
    if (!article) throw notFound();
    return article;
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? loaderData.seoTitle || `${loaderData.title} — Contentech`
      : "Unavailable — Contentech";
    const description =
      loaderData?.metaDescription || loaderData?.excerpt || "Contentech resources";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
        ...(loaderData ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: Page,
});

function Page() {
  return <ResourceArticlePage article={Route.useLoaderData()} />;
}
