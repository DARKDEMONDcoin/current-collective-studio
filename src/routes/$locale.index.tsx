import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/views/locale/home";
import { getHomeData } from "@/lib/public-data.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/")({
  loader: () => getHomeData(),
  head: ({ params }) => pageHead("home", params.locale),
  component: Page,
});

function Page() {
  const { locale } = Route.useParams();
  const data = Route.useLoaderData();
  return <HomePage locale={locale} siteConfigs={data.siteConfigs} dbPlans={data.dbPlans} />;
}
