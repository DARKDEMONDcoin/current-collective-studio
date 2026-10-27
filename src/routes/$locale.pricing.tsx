import { createFileRoute } from "@tanstack/react-router";
import PricingPage from "@/views/locale/pricing";
import { getPlans } from "@/lib/public-data.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/pricing")({
  loader: () => getPlans(),
  head: ({ params }) => pageHead("pricing", params.locale),
  component: Page,
});

function Page() {
  const { locale } = Route.useParams();
  return <PricingPage locale={locale} dbPlans={Route.useLoaderData()} />;
}
