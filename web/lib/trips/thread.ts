/**
 * Message thread presentation for screen 2.2.7.
 *
 * The Kotlin twin is
 * `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/trip/TripThread.kt`,
 * compared against THREAD_MESSAGES by `.github/scripts/check_copy_parity.py`.
 *
 * WHAT IS DELIBERATELY NOT HERE. Screen-Inventory §2.2.7 names a typing indicator and read
 * receipts among its primary elements. Neither is built:
 *
 *   - The typing indicator needs Realtime presence. Nothing backs it — there is no presence
 *     channel in this codebase and no column that could stand in.
 *   - Read receipts would need `message.read_by_other_at`, which is outside the client
 *     column grant on purpose: it tells a client exactly when Gyasi opened their message,
 *     and an advisor who reads at 11pm should not have that on the record for every
 *     traveler. `conversation.client_unread_count` is granted and gives the client the half
 *     of the signal that is theirs — what THEY have not read.
 *
 * Both are recorded as deferrals in the plan rather than faked.
 */

/** `message.sender_role`, verbatim from the enum. */
export type MessageSender = "agent" | "client";

/**
 * Flat, and shared with the Kotlin twin.
 *
 * The suggested-reply chips are copy, not data: §2.2.7 lists "tap suggested-reply chips" as
 * a key action, and nothing in the schema produces them. Keeping them here rather than in a
 * per-screen content.ts is what puts them under CI parity, so web and native never offer a
 * traveler two different sets of words to say.
 */
export const THREAD_MESSAGES = {
  composePlaceholder: "Reply to Gyasi…",
  sendLabel: "Send",
  attachLabel: "Attach a file",
  openTrip: "Open trip",
  today: "Today",
  yesterday: "Yesterday",
  emptyTitle: "No messages yet",
  emptyBody:
    "This is where you and Gyasi talk about this trip. Ask anything — the small questions are the ones worth asking.",
  sendFailed: "That message did not send. It is still here, so try again in a moment.",
  quickSoundsGood: "Sounds good",
  quickAddPartner: "Add my partner",
  quickSendPassport: "Send a passport",
  quickScheduleCall: "Schedule a call",
  /**
   * §2.0's landing said "Reply usually < 2h" and §2.1 said "within 48 hours". Three
   * competing promises across three sections is one too many to keep true, so §2.2
   * standardises on the one Gyasi can keep on a bad week. Stage 10 reconciles §2.0.
   */
  replyWindow: "Usually replies the same day",
} as const;

export const QUICK_REPLIES = [
  THREAD_MESSAGES.quickSoundsGood,
  THREAD_MESSAGES.quickAddPartner,
  THREAD_MESSAGES.quickSendPassport,
  THREAD_MESSAGES.quickScheduleCall,
] as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * THE TRAVELER'S ZONE IS AN EXPLICIT ARGUMENT, and that is the whole point of this section
 * of the file.
 *
 * The obvious implementation uses `new Date(iso).getHours()`, which formats in the AMBIENT
 * zone. On these screens that ambient zone is the SERVER'S — the thread is a server
 * component — so in production on a UTC host every traveler would read their conversation in
 * UTC. A message sent at 6pm in Jamaica would say 11:00p, and the day separator above it
 * would be wrong for anyone whose evening crosses midnight UTC. That is most of the
 * Caribbean, most of the day.
 *
 * `platform_user.time_zone` exists for exactly this and is inside the client column grant.
 * Formatting server-side against it is deterministic, needs no client JavaScript, and cannot
 * produce a hydration mismatch — which a browser-zone fix would, since the day GROUPING and
 * not just the labels depends on the answer.
 *
 * The native twin reads the device zone instead (see localToday in TripThread.kt). That is
 * the same intent by a more direct route: a phone knows where it is.
 */
export const FALLBACK_TIME_ZONE = "UTC";

/** `yyyy-mm-dd` in `timeZone`. "en-CA" is the locale whose short date IS ISO order. */
function dayKeyIn(iso: string, timeZone: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    // An unknown zone string from the database should not blank the thread.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: FALLBACK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
}

/** "11:14a" / "2:14p", the artboards' own format, in the traveler's zone. */
export function formatMessageTime(iso: string, timeZone: string = FALLBACK_TIME_ZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const parts = timeParts(d, timeZone);
  const hour = parts.hour ?? "";
  const minute = parts.minute ?? "";
  if (!hour || !minute) return "";

  // `dayPeriod` is "AM"/"PM"; the design wants a bare "a"/"p".
  const suffix = (parts.dayPeriod ?? "AM").toLowerCase().startsWith("p") ? "p" : "a";
  return `${hour}:${minute}${suffix}`;
}

/**
 * Hour/minute/dayPeriod in `timeZone`, falling back to UTC if the zone string is unusable.
 *
 * The fallback is not defensive padding: `platform_user.time_zone` is free text that
 * onboarding wrote, and one bad row should cost a wrong hour, not a thrown render that takes
 * the whole thread down with it.
 */
function timeParts(d: Date, timeZone: string): Record<string, string> {
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { ...options, timeZone }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: FALLBACK_TIME_ZONE,
    }).formatToParts(d);
  }
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** "Today" / "Yesterday" / "Mar 14", all judged in the traveler's zone. */
export function formatDaySeparator(
  iso: string,
  timeZone: string = FALLBACK_TIME_ZONE,
  now: Date = new Date(),
): string {
  const key = dayKeyIn(iso, timeZone);
  if (!key) return "";

  if (key === dayKeyIn(now.toISOString(), timeZone)) return THREAD_MESSAGES.today;

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (key === dayKeyIn(yesterday.toISOString(), timeZone)) return THREAD_MESSAGES.yesterday;

  // Off the key rather than off a Date, so the month and day are the zone's and not the
  // server's — the bug this whole block exists to prevent, one line from the end.
  const [, month, day] = key.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

export type ThreadableMessage = {
  createdAt: string;
};

export type ThreadDay<T extends ThreadableMessage> = {
  /** `yyyy-mm-dd` in the traveler's zone. Stable across renders, so a usable React key. */
  key: string;
  label: string;
  messages: T[];
};

/**
 * Split a chronological message list into day buckets for the date separators.
 *
 * Assumes the input is already oldest-first, which is how the query orders it — a thread
 * reads top to bottom like a conversation, unlike the document list, which is newest-first.
 * A run of the same day that is NOT adjacent opens a new bucket rather than merging into the
 * earlier one, because merging would reorder somebody's messages.
 */
export function groupMessagesByDay<T extends ThreadableMessage>(
  messages: readonly T[],
  timeZone: string = FALLBACK_TIME_ZONE,
  now: Date = new Date(),
): ThreadDay<T>[] {
  const days: ThreadDay<T>[] = [];
  for (const message of messages) {
    const key = dayKeyIn(message.createdAt, timeZone);
    if (!key) continue;
    const last = days[days.length - 1];
    if (last && last.key === key) last.messages.push(message);
    else {
      days.push({
        key,
        label: formatDaySeparator(message.createdAt, timeZone, now),
        messages: [message],
      });
    }
  }
  return days;
}
