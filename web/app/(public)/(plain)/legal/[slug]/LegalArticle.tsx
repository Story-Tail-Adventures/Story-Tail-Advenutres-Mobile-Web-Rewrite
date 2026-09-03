import type { LegalSection } from "@/content/public/types";
import { cn } from "@/lib/cn";

interface LegalArticleProps {
  sections: readonly LegalSection[];
  className?: string;
}

/**
 * The document body (design: C207 / M207 prose). One <section> per numbered heading; type,
 * colour and the mobile/desktop rhythm come from `.legal-prose` in public.css, which also
 * carries the print palette.
 */
export function LegalArticle({ sections, className }: LegalArticleProps) {
  return (
    <div className={cn("legal-prose", className)}>
      {sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.bullets && section.bullets.length > 0 && (
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
