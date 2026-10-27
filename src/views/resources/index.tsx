import ResourcesHub from "@/components/resources/resources-hub";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ResourcesPage(props: { categories: any[]; featuredArticles: any[]; featuredFaqs: any[] }) {
  return <ResourcesHub categories={props.categories} featuredArticles={props.featuredArticles} featuredFaqs={props.featuredFaqs} />;
}
