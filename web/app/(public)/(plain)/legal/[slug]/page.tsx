// Screen 2.0.7 Footer Pages — see docs/Screen-Inventory.md §2.0.7 (Pattern I simplified, §4.4)
// and design/source-prototype/screens/client-public.jsx (C207_FooterPages) +
// client-public-mobile.jsx (M207_FooterPages). P1.
//
// Statically generated for the four documents; any other slug 404s via `dynamicParams = false`.
// The text lives in web/content/public/legal/*.ts and is DRAFT until counsel reviews it — the
// notice below renders until a document's `status` flips to "reviewed".
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Alert } from "@/components/ui/Alert";
import { isLegalSlug, LEGAL_DOCS, LEGAL_SLUGS } from "@/content/public/legal";
import { UP_MD } from "@/lib/mui/sx";
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

/**
 * One column below `md`; from `md` the 260px nav track beside the article, tall enough to fill
 * the viewport under the top bar. `.legal-layout` stays on the element as the print hook —
 * public.css collapses the grid to a single column on paper.
 */
const LAYOUT = {
  flex: 1,
  display: "grid",
  [UP_MD]: {
    gridTemplateColumns: "260px 1fr",
    minHeight: "calc(100dvh - var(--public-topbar-h))",
  },
} as const;

const OVERLINE = { display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 } as const;

/** The document title's 24 / 26 / 28 ramp on MUI's h4. */
const TITLE = { fontWeight: 700, fontSize: { xs: 24, md: 26, web: 28 } } as const;

export default async function LegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const doc = LEGAL_DOCS[slug];

  return (
    <Box className="legal-layout" sx={LAYOUT}>
      <LegalNav active={slug} />

      <Box
        component="article"
        sx={{
          width: "100%",
          maxWidth: 720,
          px: { xs: 2.25, md: 6 },
          pt: { xs: 0.5, md: 4 },
          pb: { xs: 3, md: 4 },
        }}
      >
        <Typography component="p" variant="overline" sx={OVERLINE}>
          {LEGAL_PAGE.overline}
        </Typography>
        <Typography component="h1" variant="h4" sx={{ ...TITLE, my: 0.5 }}>
          {doc.title}
        </Typography>

        <Typography
          component="div"
          variant="caption"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.25,
            fontWeight: 500,
            color: "text.secondary",
          }}
        >
          <span>
            {LEGAL_PAGE.lastUpdated}{" "}
            <time dateTime={doc.lastUpdated}>{formatLegalDate(doc.lastUpdated)}</time>
          </span>
          <span aria-hidden="true">·</span>
          <PrintButton />
        </Typography>

        {doc.status !== "reviewed" && (
          <Box sx={{ mt: 1.75 }}>
            {/* A static notice, not a live announcement: override Alert's role="alert". */}
            <Alert tone="warning" role="note" aria-live="off">
              {LEGAL_PAGE.draftNotice}
            </Alert>
          </Box>
        )}

        <LegalArticle sections={doc.sections} sx={{ mt: 2.25 }} />
      </Box>
    </Box>
  );
}
