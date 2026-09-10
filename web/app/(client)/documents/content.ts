/**
 * Copy for Screen 2.5.4 Travel Documents (account-wide). Not in MESSAGE_TABLES until a
 * Kotlin twin exists.
 *
 * `privacyNote` is a claim about the FILE in Storage — encrypted at rest, reachable only
 * through the audited signer — and it deliberately does NOT lean on
 * `travel_document.document_number_encrypted`, which nothing encrypts today. It also says
 * WHO can open the file, which is the question a traveler is actually asking.
 */
export const DOCUMENTS_LIBRARY = {
  title: "Travel documents",
  subtitle: "Passports, visas, insurance — everything in one place.",

  uploadCta: "Add a document",
  /** See the page header: there is no account-scoped upload door yet. */
  uploadDeferred: "Coming with the next release — for now, add documents from a trip",

  emptyTitle: "Nothing here yet",
  emptyBody:
    "Documents you or Gyasi add to a trip show up here too, so you always have one place to look.",
  emptyCta: "Back to your trips",

  privacyNote:
    "Stored encrypted, and only you and Gyasi can open them. Every time one is opened, it is written down.",
} as const;
