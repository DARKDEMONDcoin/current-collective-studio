import { createFileRoute } from "@tanstack/react-router";
import QualityPage from "@/views/locale/quality";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/quality")({
  head: ({ params }) =>
    pageHead("quality", params.locale, {
      title: "Translation Quality Engine — Contentech",
      description:
        "How Contentech keeps terminology, tone and context consistent across every segment.",
    }),
  component: Page,
});

function Page() {
  const { locale } = Route.useParams();
  return <QualityPage locale={locale} />;
}
