import {
  callAgentRead,
  type AgentClientActivityRow,
  type AgentClientCompanionRow,
  type AgentClientConversationRow,
  type AgentClientDocumentRow,
  type AgentClientNoteRow,
  type AgentClientOverviewRow,
  type AgentClientTripRow,
} from "@/lib/agent/api";
import { cents, money, relativeDay } from "@/lib/agent/queries";
import { tripStatusPresentation, type StatusChip, type TripStatus } from "@/lib/trips/status";

/**
 * Screens 3.3.2 – 3.3.8's view models — Client Detail's own sibling to `clients.ts`, the
 * way `tripDetail.ts` is to `queries.ts`. The roster is one shape; the detail is seven.
 *
 * SAME THREE RULES AS ITS SIBLINGS: plain JSON-safe data out, formatting happens here
 * server-side in the agent's own time zone, and `null` from a loader means the READ failed.
 * An empty tab is an empty array, never `null` — a client with no documents and a documents
 * read that fell over need different screens.
 *
 * THE OVERVIEW HAS THREE OUTCOMES WHERE THE OTHER SIX HAVE TWO, exactly as
 * `TripOverviewResult` does and for the same reason: `agent_client_overview` returns zero
 * rows for a client that does not exist AND for one belonging to another advisor,
 * deliberately indistinguishable so ids cannot be probed. Collapsing that into `null`
 * renders "something went wrong on our side" over a mistyped URL, which is neither true nor
 * retryable.
 */

export type ClientOverviewResult =
  | { ok: true; overview: ClientOverview }
  | { ok: false; reason: "not-found" | "unavailable" };

export type ClientImportantDate = { label: string; date: string | null; recurring: boolean };
export type ClientLoyaltyProgram = { program: string; tier: string | null };

export type ClientOverview = {
  clientId: string;
  displayName: string;
  initials: string;
  email: string | null;
  phone: string | null;
  status: string;
  archived: boolean;
  tags: string[];
  /** Already formatted, e.g. "Mar 2024" — the header's "Since" line. */
  sinceLabel: string;
  addressLine: string | null;
  dateOfBirthLabel: string | null;
  importantDates: ClientImportantDate[];
  emergencyContact: { name: string; phone: string | null; relationship: string | null } | null;
  /** `client.notes` — the Snapshot card's free text, NOT the Notes tab. */
  snapshotNote: string | null;
  version: number;

  preferredDestinations: string[];
  travelStyles: string[];
  dietaryRestrictions: string[];
  dietaryNote: string | null;
  accessibilityNeeds: string[];
  accessibilityNote: string | null;
  loyaltyPrograms: ClientLoyaltyProgram[];
  budgetBand: string | null;
  favouritePastTrips: string | null;

  lifetimeLabel: string | null;
  commissionLabel: string | null;
  lifetimeCurrencyCount: number;
  tripCount: number;
  activeTripCount: number;
  noteCount: number;
  documentCount: number;
  lastContactLabel: string | null;
};

export type ClientCompanion = {
  companionId: string;
  name: string;
  initials: string;
  relationship: string | null;
  passportExpiryLabel: string | null;
  /** True when the passport expires inside six months, which is most suppliers' floor. */
  passportExpiringSoon: boolean;
  invited: boolean;
};

export type ClientTripRow = {
  tripId: string;
  title: string;
  /**
   * Derived HERE, not in the component, because `tripStatusPresentation` needs the agent's
   * own today and `as_of_date` arrives on the row. A component computing its own date would
   * disagree with the accessor's windows for the offset's worth of hours either side of
   * midnight — the bug §3.2's greeting shipped and a browser caught.
   */
  statusChip: StatusChip;
  statusLabel: string;
  /** "Aug 12 – 19, 2026", or a single date, or null. */
  datesLabel: string | null;
  destinations: string[];
  valueLabel: string;
  commissionLabel: string;
  /** Which chip group the Trips tab's filter puts it in. */
  bucket: "active" | "past" | "cancelled";
};

export type ClientThread = {
  conversationId: string;
  subject: string;
  tripTitle: string | null;
  preview: string | null;
  whenLabel: string | null;
  unread: number;
  messageCount: number;
};

export type ClientDocumentRow = {
  documentId: string;
  filename: string;
  kind: string;
  badge: "PDF" | "IMG" | "DOC";
  tripTitle: string | null;
  sizeLabel: string;
  sensitive: boolean;
};

export type ClientNote = {
  noteId: string;
  body: string;
  authorName: string;
  mine: boolean;
  whenLabel: string;
  edited: boolean;
};

export type ClientActivityEvent = {
  eventId: string;
  /** A sentence, derived from event_type — the enum is not copy. */
  description: string;
  actorName: string | null;
  whenLabel: string;
  /** Constrained to names `icon-paths.ts` actually defines; there is no pencil. */
  icon: "user" | "card" | "message" | "shield" | "check";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  const name = MONTHS[Number(m) - 1];
  return name && y ? `${name} ${y}` : null;
}

function monthDayYear(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  const name = MONTHS[Number(m) - 1];
  return name && d && y ? `${name} ${Number(d)}, ${y}` : null;
}

/**
 * "Aug 12 – 19, 2026" when a range shares its month and year, "Dec 28, 2026 – Jan 3, 2027"
 * when it does not. An en dash with spaces, matching the prototype.
 */
function dateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (!start) return monthDayYear(end);
  if (!end) return monthDayYear(start);
  const [sy, sm, sd] = start.split("-");
  const [ey, em, ed] = end.split("-");
  if (sy === ey && sm === em) {
    return `${MONTHS[Number(sm) - 1]} ${Number(sd)} – ${Number(ed)}, ${sy}`;
  }
  if (sy === ey) {
    return `${MONTHS[Number(sm) - 1]} ${Number(sd)} – ${MONTHS[Number(em) - 1]} ${Number(ed)}, ${sy}`;
  }
  return `${monthDayYear(start)} – ${monthDayYear(end)}`;
}

function initialsOf(first: string, last: string): string {
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || "?";
}

function addressLine(r: AgentClientOverviewRow): string | null {
  const parts = [r.address_line1, r.address_line2, r.address_city, r.address_region]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  if (parts.length === 0) return null;
  return r.address_postal_code ? `${parts.join(", ")} ${r.address_postal_code}` : parts.join(", ");
}

/**
 * `important_dates` is jsonb with no schema in Postgres, so every field is optional and a
 * malformed entry must cost its own row rather than the card.
 *
 * NOTE WHAT IS NOT HERE: the prototype's Snapshot draws "Sep 14 (surprise flag)" and there
 * is no surprise flag anywhere in the schema. Data-Model §6.1 defines the shape as
 * `{label, date, recurring}`. The date survives; the flag was invented.
 */
function importantDates(raw: AgentClientOverviewRow["important_dates"]): ClientImportantDate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is { label?: string; date?: string; recurring?: boolean } =>
      Boolean(d) && typeof d === "object")
    .map((d) => ({
      label: typeof d.label === "string" ? d.label : "Date",
      date: typeof d.date === "string" ? d.date : null,
      recurring: d.recurring === true,
    }))
    .filter((d) => d.date !== null || d.label !== "Date");
}

function loyalty(raw: AgentClientOverviewRow["loyalty_programs"]): ClientLoyaltyProgram[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is { program?: string; tier?: string } => Boolean(p) && typeof p === "object")
    .map((p) => ({
      program: typeof p.program === "string" ? p.program : "",
      tier: typeof p.tier === "string" ? p.tier : null,
    }))
    // The NUMBER is deliberately not read. `agent_client_overview` returns the jsonb whole,
    // and a loyalty number is an account credential: the card shows the programme and the
    // tier, which is what a booking needs.
    .filter((p) => p.program !== "");
}

export async function loadClientOverview(clientId: string): Promise<ClientOverviewResult> {
  const result = await callAgentRead<AgentClientOverviewRow>("agent_client_overview", {
    p_client_id: clientId,
  });
  if (!result.ok) return { ok: false, reason: "unavailable" };

  const r = result.rows[0];
  if (!r) return { ok: false, reason: "not-found" };

  return {
    ok: true,
    overview: {
      clientId: r.client_id,
      displayName: r.display_name,
      initials: initialsOf(r.first_name, r.last_name),
      email: r.email,
      phone: r.phone,
      status: r.status,
      archived: r.archived_at !== null,
      tags: r.tags ?? [],
      sinceLabel: monthYear(r.created_at.slice(0, 10)) ?? "",
      addressLine: addressLine(r),
      dateOfBirthLabel: monthDayYear(r.date_of_birth),
      importantDates: importantDates(r.important_dates),
      emergencyContact:
        r.emergency_contact && typeof r.emergency_contact.name === "string"
          ? {
              name: r.emergency_contact.name,
              phone: r.emergency_contact.phone ?? null,
              relationship: r.emergency_contact.relationship ?? null,
            }
          : null,
      snapshotNote: r.notes,
      version: r.version,

      preferredDestinations: r.preferred_destinations ?? [],
      travelStyles: r.travel_styles ?? [],
      dietaryRestrictions: r.dietary_restrictions ?? [],
      dietaryNote: r.dietary_notes,
      accessibilityNeeds: r.accessibility_needs ?? [],
      accessibilityNote: r.accessibility_notes,
      loyaltyPrograms: loyalty(r.loyalty_programs),
      budgetBand: r.budget_band,
      favouritePastTrips: r.favorite_past_trips,

      // A dash, never "$0.00" — the accessor returns a NULL currency for a client with
      // nothing committed, and a labelled zero claims they have spent nothing.
      lifetimeLabel:
        r.lifetime_currency === null || cents(r.lifetime_value_cents) === 0
          ? null
          : money(r.lifetime_value_cents, r.lifetime_currency),
      commissionLabel:
        r.lifetime_currency === null || cents(r.commission_cents) === 0
          ? null
          : money(r.commission_cents, r.lifetime_currency),
      lifetimeCurrencyCount: r.lifetime_currency_count,
      tripCount: r.trip_count,
      activeTripCount: r.active_trip_count,
      noteCount: r.note_count,
      documentCount: r.document_count,
      lastContactLabel: r.last_contact_at
        ? relativeDay(r.as_of_date, r.last_contact_at.slice(0, 10))
        : null,
    },
  };
}

export async function loadClientCompanions(clientId: string): Promise<ClientCompanion[] | null> {
  const result = await callAgentRead<AgentClientCompanionRow>("agent_client_companions", {
    p_client_id: clientId,
  });
  if (!result.ok) return null;

  // Six months is most suppliers' passport floor, and the prototype writes "· warn" into a
  // filename to say so. A real comparison beats a string that happens to contain a word.
  const soon = new Date();
  soon.setMonth(soon.getMonth() + 6);
  const cutoff = soon.toISOString().slice(0, 10);

  return result.rows.map((r) => ({
    companionId: r.companion_id,
    name: `${r.first_name} ${r.last_name}`.trim(),
    initials: initialsOf(r.first_name, r.last_name),
    relationship: r.relationship,
    passportExpiryLabel: monthDayYear(r.passport_expiry),
    passportExpiringSoon: r.passport_expiry !== null && r.passport_expiry <= cutoff,
    invited: r.invited,
  }));
}

export async function loadClientTrips(clientId: string): Promise<ClientTripRow[] | null> {
  const result = await callAgentRead<AgentClientTripRow>("agent_client_trips", {
    p_client_id: clientId,
  });
  if (!result.ok) return null;

  return result.rows.map((r) => {
    // `nextUnpaidDueDate` is deliberately not passed: `agent_client_trips` does not return
    // it, so a trip here never reads "Final payment due". That label belongs to Trip Detail,
    // which reads the milestone; inventing it from a trip row would be a claim about money.
    const presentation = tripStatusPresentation({
      status: r.status as TripStatus,
      today: r.as_of_date,
    });
    return {
    tripId: r.trip_id,
    title: r.title,
    statusChip: presentation.chip,
    statusLabel: presentation.label,
    datesLabel: dateRange(r.start_date, r.end_date),
    destinations: r.destinations ?? [],
    valueLabel: money(r.total_value_cents, r.currency),
    commissionLabel: money(r.total_commission_cents, r.currency),
    // The tab's three chips, computed here over one row set rather than read three times.
    // `end_date` decides past, not status: a completed trip whose status was never advanced
    // still belongs under Past once the dates say so.
    bucket: (r.status === "cancelled"
      ? "cancelled"
      : r.end_date !== null && r.end_date < r.as_of_date
        ? "past"
        : "active") as ClientTripRow["bucket"],
    };
  });
}

export async function loadClientThreads(clientId: string): Promise<ClientThread[] | null> {
  const result = await callAgentRead<AgentClientConversationRow>("agent_client_conversations", {
    p_client_id: clientId,
  });
  if (!result.ok) return null;

  return result.rows.map((r) => ({
    conversationId: r.conversation_id,
    // A thread with no subject is legal — `conversation.subject` is nullable — and falls
    // back to the trip it hangs off rather than rendering a blank row.
    subject: r.subject?.trim() || r.trip_title || "Conversation",
    tripTitle: r.trip_title,
    preview: r.last_message_preview,
    whenLabel: monthDayYear(r.last_message_at.slice(0, 10)),
    unread: r.agent_unread_count,
    messageCount: r.message_count,
  }));
}

function badgeFor(mime: string, filename: string): "PDF" | "IMG" | "DOC" {
  if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) return "PDF";
  if (mime.startsWith("image/")) return "IMG";
  return "DOC";
}

/** "1.1 MB". Binary units, because a file manager's number is what people compare against. */
function fileSize(bytes: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function loadClientDocuments(clientId: string): Promise<ClientDocumentRow[] | null> {
  const result = await callAgentRead<AgentClientDocumentRow>("agent_client_documents", {
    p_client_id: clientId,
  });
  if (!result.ok) return null;

  return result.rows.map((r) => ({
    documentId: r.document_id,
    filename: r.filename,
    kind: r.kind,
    badge: badgeFor(r.mime_type, r.filename),
    tripTitle: r.trip_title,
    sizeLabel: fileSize(r.size_bytes),
    sensitive: r.is_sensitive,
  }));
}

export async function loadClientNotes(clientId: string): Promise<ClientNote[] | null> {
  const result = await callAgentRead<AgentClientNoteRow>("agent_client_notes", {
    p_client_id: clientId,
  });
  if (!result.ok) return null;

  return result.rows.map((r) => ({
    noteId: r.note_id,
    body: r.body,
    authorName: r.author_name ?? "Unknown",
    mine: r.author_is_me,
    whenLabel: monthDayYear(r.created_at.slice(0, 10)) ?? "",
    // `agent_write_client_note` returns 'noop' for a re-save of identical text precisely so
    // this stays honest: updated_at only moves when the body actually changed.
    edited: r.updated_at !== r.created_at,
  }));
}

/**
 * `event_type` is a dotted slug and the enum is not copy, so it is turned into a sentence
 * here. An unrecognised type falls back to a humanised form of itself rather than being
 * dropped: the Activity tab's whole job is that nothing is missing from it.
 */
function describeEvent(type: string, metadata: Record<string, unknown> | null): string {
  switch (type) {
    case "client.updated":
      return "Client record updated";
    case "client.tag_added":
      return typeof metadata?.tag === "string" ? `Tagged "${metadata.tag}"` : "Tag added";
    case "client.note_created":
      return "Internal note added";
    case "client.note_changed":
      return "Internal note edited";
    case "client.note_archived":
      return "Internal note removed";
    case "trip.status_changed": {
      const to = typeof metadata?.to === "string" ? metadata.to : null;
      return to ? `Trip moved to ${to.replace(/_/g, " ")}` : "Trip status changed";
    }
    case "trip.notes_changed":
      return "Trip notes edited";
    default:
      return type.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

function iconFor(type: string): ClientActivityEvent["icon"] {
  if (type.startsWith("card") || type.includes("payment")) return "card";
  if (type.includes("authorization")) return "shield";
  if (type.includes("message") || type.includes("note")) return "message";
  if (type.startsWith("trip")) return "check";
  if (type.startsWith("client")) return "user";
  return "user";
}

export async function loadClientActivity(clientId: string): Promise<ClientActivityEvent[] | null> {
  const result = await callAgentRead<AgentClientActivityRow>("agent_client_activity", {
    p_client_id: clientId,
    p_limit: 50,
  });
  if (!result.ok) return null;

  return result.rows.map((r) => ({
    eventId: r.event_id,
    description: describeEvent(r.event_type, r.metadata),
    actorName: r.actor_name,
    whenLabel: monthDayYear(r.created_at.slice(0, 10)) ?? "",
    icon: iconFor(r.event_type),
  }));
}

/**
 * §3.3.10's prefill, and a SECOND projection of the same row on purpose.
 *
 * `ClientOverview` is tuned for display: it formats the date of birth, assembles one
 * address line out of six columns, and turns a `null` currency into a dash. A form needs
 * exactly the opposite — the ISO date, the six columns apart, and the raw values it will
 * post back. Bending one shape to serve both would mean the Overview card re-parsing the
 * strings it just formatted, or the form shipping a display label into the database.
 *
 * `version` rides along because it is the optimistic lock: two tabs open on one client is
 * what `client.version` exists for, and the number has to be read at the moment the form
 * renders rather than carried in from somewhere earlier.
 */
export type ClientEditValues = {
  clientId: string;
  displayName: string;
  version: number;
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  notes: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
  tags: string[];
  importantDates: { label: string; date: string; recurring: boolean }[];
};

export type ClientEditResult =
  | { ok: true; values: ClientEditValues }
  | { ok: false; reason: "not-found" | "unavailable" };

export async function loadClientForEdit(clientId: string): Promise<ClientEditResult> {
  const result = await callAgentRead<AgentClientOverviewRow>("agent_client_overview", {
    p_client_id: clientId,
  });
  if (!result.ok) return { ok: false, reason: "unavailable" };

  const r = result.rows[0];
  if (!r) return { ok: false, reason: "not-found" };

  return {
    ok: true,
    values: {
      clientId: r.client_id,
      displayName: r.display_name,
      version: r.version,
      firstName: r.first_name,
      lastName: r.last_name,
      preferredName: r.preferred_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      dateOfBirth: r.date_of_birth ?? "",
      notes: r.notes ?? "",
      addressLine1: r.address_line1 ?? "",
      addressLine2: r.address_line2 ?? "",
      addressCity: r.address_city ?? "",
      addressRegion: r.address_region ?? "",
      addressPostalCode: r.address_postal_code ?? "",
      addressCountry: r.address_country ?? "",
      tags: r.tags ?? [],
      // Same defensive read as the display side: `important_dates` is jsonb with no schema
      // in Postgres, so a malformed entry costs its own row rather than the form.
      importantDates: importantDates(r.important_dates).map((d) => ({
        label: d.label,
        date: d.date ?? "",
        recurring: d.recurring,
      })),
    },
  };
}
