// Screen 2.0.7 Footer Pages — see docs/Screen-Inventory.md §2.0.7 (Pattern I simplified, §4.4)
// and design/source-prototype/screens/client-public.jsx (C207_FooterPages) +
// client-public-mobile.jsx (M207_FooterPages). P1.
//
// Statically generated for the four documents; any other slug 404s via `dynamicParams = false`.
// The text lives in web/content/public/legal/*.ts and is DRAFT until counsel reviews it — the
// notice below renders until a document's `status` flips to "reviewed".
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { isLegalSlug, LEGAL_DOCS, LEGAL_SLUGS } from "@/content/public/legal";
import { formatLegalDate, LEGAL_PAGE, legalHref } from "./content";
import { LegalArticle } from "./LegalArticle";
import { LegalNav } from "./LegalNav";
import { PrintButton } from "./PrintButton";

export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return {};
  const doc = LEGAL_DOCS[slug];
  const url = legalHref(slug);
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: url },
    // No photo here: the root opengraph-image (brand card) is the right share image for legal text.
    openGraph: { title: doc.title, description: doc.description, url },
  };
}

export default async function LegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const doc = LEGAL_DOCS[slug];

  return (
    <div className="legal-layout flex-1">
      <LegalNav active={slug} />

      <article className="w-full max-w-180 px-4.5 pt-1 pb-6 md:px-12 md:py-8">
        <p className="t-label-s text-brand-orange">{LEGAL_PAGE.overline}</p>
        <h1 className="t-headline-r my-1 text-on-surface">{doc.title}</h1>

        <div className="t-fine flex flex-wrap items-center gap-2.5 text-on-surface-variant">
          <span>
            {LEGAL_PAGE.lastUpdated}{" "}
            <time dateTime={doc.lastUpdated}>{formatLegalDate(doc.lastUpdated)}</time>
          </span>
          <span aria-hidden="true">·</span>
          <PrintButton />
        </div>

        {doc.status !== "reviewed" && (
          // A static notice, not a live announcement: override Alert's role="alert".
          <Alert tone="warning" role="note" aria-live="off" className="mt-3.5">
            {LEGAL_PAGE.draftNotice}
          </Alert>
        )}

        <LegalArticle sections={doc.sections} className="mt-4.5" />
      </article>
    </div>
  );
}
