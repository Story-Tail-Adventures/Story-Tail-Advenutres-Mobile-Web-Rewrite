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
 * "11:14a" / "2:14p", the artboards' own format.
 *
 * Local time, from a timestamptz — a message sent at 11:14 in Jamaica should read 11:14 to
 * the traveler who sent it, and `created_at` carries the offset needed to get there.
 */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hour12}:${minutes}${h < 12 ? "a" : "p"}`;
}

/** Local `yyyy-mm-dd`, so a 9pm message groups under the day the sender experienced. */
function localDayKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** "Today" / "Yesterday" / "Mar 14". */
export function formatDaySeparator(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const key = localDayKey(d);
  if (key === localDayKey(now)) return THREAD_MESSAGES.today;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDayKey(yesterday)) return THREAD_MESSAGES.yesterday;

  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export type ThreadableMessage = {
  createdAt: string;
};

export type ThreadDay<T extends ThreadableMessage> = {
  /** Local `yyyy-mm-dd`. Stable across renders, which is what makes it a usable React key. */
  key: string;
  label: string;
  messages: T[];
};

/**
 * Split a chronological message list into day buckets for the date separators.
 *
 * Assumes the input is already oldest-first, which is how the query orders it — a thread
 * reads top to bottom like a conversation, unlike the document list, which is newest-first.
 */
export function groupMessagesByDay<T extends ThreadableMessage>(
  messages: readonly T[],
  now: Date = new Date(),
): ThreadDay<T>[] {
  const days: ThreadDay<T>[] = [];
  for (const message of messages) {
    const d = new Date(message.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = localDayKey(d);
    const last = days[days.length - 1];
    if (last && last.key === key) last.messages.push(message);
    else days.push({ key, label: formatDaySeparator(message.createdAt, now), messages: [message] });
  }
  return days;
}
