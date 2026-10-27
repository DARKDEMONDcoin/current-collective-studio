import CategoryHub from "@/components/resources/category-hub";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ResourceCategoryPage({ category, articles, faqs }: { category: any; articles: any[]; faqs: any[] }) {
  return <CategoryHub category={category} articles={articles} faqs={faqs} />;
}
