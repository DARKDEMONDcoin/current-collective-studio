import { createFileRoute } from "@tanstack/react-router";
import AboutPage from "@/views/locale/about";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/about")({
  head: ({ params }) => pageHead("about", params.locale),
  component: Page,
});

function Page() {
  const { locale } = Route.useParams();
  return <AboutPage locale={locale} />;
}
