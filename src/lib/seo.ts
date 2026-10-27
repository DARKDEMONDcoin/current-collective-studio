// Default per-page SEO text (from the original project).
export interface PageMetaData {
  title?: string | null;
  description?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
}

const DEFAULTS: Record<string, Record<string, PageMetaData>> = {
  home: {
    en: {
      title: "Contentech — Enterprise Multilingual Translation Platform",
      description: "Combine AI speed with certified human expertise. Full control, every time.",
      ogTitle: "Contentech — Enterprise Translation Without Compromise",
      ogDescription:
        "AI-powered translation with human-grade accuracy. Trusted by 1,000+ organizations.",
    },
    ar: {
      title: "كونتنتك — منصة الترجمة متعددة اللغات للمؤسسات",
      description: "اجمع بين سرعة الذكاء الاصطناعي وخبرة المترجمين البشريين المعتمدين.",
      ogTitle: "كونتنتك — ترجمة احترافية بلا تنازلات",
      ogDescription: "ترجمة مدعومة بالذكاء الاصطناعي بدقة بشرية.",
    },
  },
  pricing: {
    en: {
      title: "Pricing — Contentech Translation Platform",
      description: "Transparent pricing for every team size. Start free, scale as you grow.",
      ogTitle: "Contentech Pricing — Start Free, Scale as You Grow",
      ogDescription: "Flexible plans for individuals, teams, and enterprises. No hidden fees.",
    },
    ar: {
      title: "الأسعار — منصة كونتنتك للترجمة",
      description: "أسعار شفافة لكل حجم من الفرق. ابدأ مجانًا وتوسع مع نمو احتياجاتك.",
      ogTitle: "أسعار كونتنتك — ابدأ مجانًا",
      ogDescription: "خطط مرنة للأفراد والفرق والمؤسسات.",
    },
  },
  about: {
    en: {
      title: "About Contentech — Our Mission & Story",
      description:
        "We build the hybrid translation ecosystem combining AI speed with human precision.",
      ogTitle: "About Contentech",
      ogDescription: "Founded by linguists and engineers. Building the future of translation.",
    },
    ar: {
      title: "عن كونتنتك — مهمتنا وقصتنا",
      description: "نبني نظام الترجمة الهجين الذي يجمع بين سرعة الذكاء الاصطناعي ودقة الإنسان.",
      ogTitle: "عن كونتنتك",
      ogDescription: "أسسها لغويون ومهندسون. نبني مستقبل الترجمة.",
    },
  },
};

export function pageHead(pageKey: string, locale: string, fallback?: PageMetaData) {
  const m = DEFAULTS[pageKey]?.[locale] ?? DEFAULTS[pageKey]?.en ?? fallback ?? {};
  const title = m.title ?? "Contentech";
  const description = m.description ?? "Enterprise multilingual translation platform.";
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: m.ogTitle ?? title },
      { property: "og:description", content: m.ogDescription ?? description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
