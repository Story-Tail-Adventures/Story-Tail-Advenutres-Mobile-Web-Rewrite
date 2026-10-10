import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import type { LegalSection } from "@/content/public/types";
import { cn } from "@/lib/cn";

interface LegalArticleProps {
  sections: readonly LegalSection[];
  className?: string;
  /** Plain objects only: the legal page is a Server Component. */
  sx?: SxProps<Theme>;
}

/** Numbered section headings: 19px below `md`, 22px from it, on MUI's h5. */
const HEADING = { mt: { xs: 1.75, md: 2.25 }, fontWeight: 600, fontSize: { xs: 19, md: 22 } } as const;

/** Reading rhythm for paragraphs and bullet lists (artboard: body1 at 1.65). */
const PROSE = { mt: 1, mb: 1.5, lineHeight: 1.65 } as const;

/**
 * The document body (design: C207 / M207 prose). One <section> per numbered heading, on MUI
 * type: h5 headings, body1 paragraphs and bullets at a reading line-height. `.legal-prose`
 * stays on the root as the print hook — public.css turns the text black and prints link URLs
 * by it.
 */
export function LegalArticle({ sections, className, sx }: LegalArticleProps) {
  return (
    <Box
      className={cn("legal-prose", className)}
      sx={[{ color: "text.primary" }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {sections.map((section) => (
        <section key={section.heading}>
          <Typography component="h2" variant="h5" sx={HEADING}>
            {section.heading}
          </Typography>
          {section.paragraphs.map((paragraph) => (
            <Typography key={paragraph} component="p" variant="body1" sx={PROSE}>
              {paragraph}
            </Typography>
          ))}
          {section.bullets && section.bullets.length > 0 && (
            <Box component="ul" sx={{ typography: "body1", ...PROSE, pl: 2.5, listStyle: "disc" }}>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </Box>
          )}
        </section>
      ))}
    </Box>
  );
}
