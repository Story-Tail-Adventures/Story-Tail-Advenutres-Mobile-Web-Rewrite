import { DOCUMENT_MESSAGES } from "@/lib/trips/documents";

/**
 * Screen 2.2.6 copy.
 *
 * The group headings, the uploaded-by labels and the empty state live in
 * `web/lib/trips/documents.ts` instead, because native renders them too and CI compares the
 * two tables. What is here is web-only chrome: the page title, the back link, the subtitle.
 */
export const DOCUMENTS = {
  back: "Back to trip",
  title: "Documents",

  /**
   * The artboards' subtitle was "Everything for this trip, all in one place. Auto-encrypted,
   * share via secure link." Two of those three clauses had to go.
   *
   * "Auto-encrypted" is jargon in a sentence aimed at a traveler, and it is a security claim
   * we would be making on a marketing surface rather than a security one — Design-System §2
   * says sound like a friend who has done this a hundred times, and a friend does not say
   * "auto-encrypted". "Share via secure link" promises a feature that is deferred to §2.8;
   * the plan settled on PDF only for now, so the sentence was advertising something nobody
   * could click.
   *
   * What is left is the true half, in Gyasi's register.
   */
  subtitle: (tripTitle: string) => `Everything for ${tripTitle}, in one place.`,

  countLabel: (count: number) => (count === 1 ? "1 document" : `${count} documents`),

  /**
   * The upload flow is Screen 2.5.4 / §2.2.6's "Document Upload" related screen, and it is
   * not built: `trip-document` signs a PUT, but the picker, the progress state and the
   * confirm step that fills in `checksum_sha256` are a screen of their own. Rendering the CTA
   * disabled with a reason is the plan's "build them visually, disabled" decision — a button
   * that silently does nothing is worse than one that says why not yet.
   */
  uploadCta: DOCUMENT_MESSAGES.uploadCta,
  uploadDeferred: "Adding documents from the web arrives with the upload screen",

  openLabel: (filename: string) => `Open ${filename}`,
  /**
   * "Open", not "Download". The signed URL is a GET on the object and the browser decides
   * what to do with it — a PDF opens in the viewer, a JPEG renders. Calling it Download
   * would promise a file on disk that a PDF viewer does not produce.
   */
  open: "Open",
} as const;
