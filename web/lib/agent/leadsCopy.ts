import type { LeadCloseReason, LeadSource, LeadStatus } from "@/lib/agent/api";

/**
 * §3.8 Leads (revived 2026-10-21, BRD §6.5, Data-Model §11): the copy, labels and pure helpers
 * for 3.8.1 to 3.8.5, the worklist's "New leads" and the client page's back-link.
 *
 * PURE ON PURPOSE: the two client islands (`LeadActions`, `AddLeadForm`) import this, so it may
 * not reach `lib/supabase/server` (next/headers) even through a re-export. The loaders that do
 * live in `leads.ts`.
 *
 * A LEAD IS NOT AN INQUIRY. An inquiry is a trip a client asked for; a lead is somebody without
 * an account who wrote to Gyasi (or whom he added by hand). The two never share a list, a
 * label or a count, so "New inquiries" and "New leads" can sit side by side on the worklist
 * and mean different things.
 *
 * Copy follows Design-System §2. It is the advisor's own side, so it is plainer than the
 * public form, but still no CRM-vendor register ("pipeline", "convert", "qualify").
 */

export const LEAD_COPY = {
  title: "Leads",
  intro: "People without an account who wrote to you, and anyone you added by hand.",
  addLead: "Add lead",
  filterOpen: "Open",
  filterConverted: "Became clients",
  filterClosed: "Closed",
  filterAll: "All",
  emptyOpen: "No one is waiting on you here. New notes from the website land in this list.",
  emptyOther: "Nothing here yet.",
  alreadyClient: "Already a client",
  messages: (n: number) => `${n} ${n === 1 ? "note" : "notes"}`,
  unavailable: "Leads could not be loaded just now. Try again in a moment.",

  // 3.8.2
  back: "All leads",
  notFoundTitle: "No such lead",
  notFoundBody: "It may have been deleted, or it belongs to another advisor.",
  detailsTitle: "Details",
  emailLabel: "Email",
  phoneLabel: "Phone",
  sourceLabel: "Came from",
  firstNoteLabel: "First note",
  contactedLabel: "Contacted",
  convertedLabel: "Became a client",
  closedLabel: "Closed",
  campaignLabel: "Campaign",
  notesTitle: "What they wrote",
  addedByYou: "Added by you",
  aboutPrefix: "About: ",
  fromPage: (page: string) => `Sent from the ${page}`,
  reply: "Reply by email",
  replyHint: "Opens your own email app. Story-Tail doesn't send or keep lead email.",
  markContacted: "Mark contacted",
  invite: "Invite to an account",
  close: "Close",
  reopen: "Reopen",
  deleteSpam: "Delete as spam",
  openClient: "Open client",
  closedReason: (reason: string) => `Closed: ${reason}`,
  stale: "That lead changed since this page loaded. Reload to see where it stands.",
  failed: "That didn't save. Try again in a moment.",

  // 3.8.3
  inviteTitle: "Invite to an account",
  inviteBody:
    "This creates their client record and emails them an invitation to set up an account. The lead is then marked as a client.",
  inviteLastNameHint: "A client record needs a last name.",
  inviteSend: "Send invite",
  inviteExisting: "That email is already on a client record, so the lead is now linked to it.",
  inviteCreatedNotSent:
    "Their client record is ready, but the invitation didn't send. You can send it from their Account tab.",

  // 3.8.4
  closeTitle: "Close this lead",
  closeBody: "They won't see this. A closed lead is deleted automatically 24 months after it closes.",
  closeReasonLabel: "Why",
  closeNoteLabel: "Private note (optional)",
  closeConfirm: "Close lead",
  deleteTitle: "Delete as spam?",
  deleteBody: "This removes the lead and everything they wrote, and cannot be undone.",
  deleteConfirm: "Delete",
  cancel: "Cancel",

  // 3.8.5
  addTitle: "Add a lead",
  addIntro: "For someone who reached you another way: a call, a text, a referral or an email.",
  firstName: "First name",
  lastName: "Last name (optional)",
  email: "Email",
  phone: "Phone (optional)",
  source: "How they reached you",
  note: "What they're looking for",
  save: "Save lead",
  saving: "Saving…",
  clientExists: "That email is already on a client record.",
  addedToExisting: "That email already has an open lead, so the note was added to it.",

  // Worklist
  worklistTitle: "New leads",
  worklistEmpty: "No new leads.",
  seeAll: "See all leads",

  // Client page
  originBefore: "First reached out as a lead on ",
} as const;

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Client",
  closed: "Closed",
};

/** Chip colours from the existing status palette (`lib/mui/tokens.ts`). `lead` is its own. */
export const LEAD_STATUS_KIND: Record<LeadStatus, string> = {
  new: "lead",
  contacted: "inquiry",
  converted: "booked",
  closed: "past",
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website form",
  email: "Email",
  phone: "Phone",
  referral: "Referral",
  social: "Social",
  other: "Other",
};

/** 3.8.5's choices: every source but the form's own. */
export const MANUAL_SOURCES: readonly Exclude<LeadSource, "website">[] = [
  "email",
  "phone",
  "referral",
  "social",
  "other",
];

export const CLOSE_REASON_LABEL: Record<LeadCloseReason, string> = {
  not_a_fit: "Not a fit",
  no_reply: "No reply",
  went_elsewhere: "Went elsewhere",
  other: "Other",
};

export const CLOSE_REASONS: readonly LeadCloseReason[] = ["not_a_fit", "no_reply", "went_elsewhere", "other"];

/** Where the form was opened, as the lead page says it ("Sent from the trip page"). */
const PAGE_LABEL: Record<string, string> = {
  landing: "home page",
  "how-it-works": "How it works page",
  about: "About Gyasi page",
  topic: "topic page",
  results: "search results",
  detail: "trip page",
  join: "sign-up page",
  app: "Android app",
};

export function pageLabel(page: string | null): string | null {
  return page ? (PAGE_LABEL[page] ?? null) : null;
}

export type LeadFilter = "open" | "converted" | "closed" | "all";
export const LEAD_FILTERS: readonly LeadFilter[] = ["open", "converted", "closed", "all"];

export function isLeadFilter(value: string | undefined): value is LeadFilter {
  return typeof value === "string" && (LEAD_FILTERS as readonly string[]).includes(value);
}

export function matchesFilter(status: LeadStatus, filter: LeadFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return status === "new" || status === "contacted";
  return status === filter;
}

export function leadName(row: { first_name: string; last_name: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ");
}

const CONTROL = /[\r\n\u0000-\u001f\u007f]+/g;

/**
 * 3.8.2's Reply: a `mailto:` to the lead, opening the advisor's own email app. The platform
 * sends and keeps nothing (ruling 6). Every part is encoded and stripped of line breaks, so a
 * name can never become a mail header. The address was validated by `lead-message`.
 */
export function replyHref(lead: { email: string; first_name: string }): string {
  const to = lead.email.replace(CONTROL, "").trim();
  const subject = encodeURIComponent("Your note to Story-Tail Adventures");
  const body = encodeURIComponent(`Hi ${lead.first_name.replace(CONTROL, " ").trim()},\n\n`);
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${subject}&body=${body}`;
}
