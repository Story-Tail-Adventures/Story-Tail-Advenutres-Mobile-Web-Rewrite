import { type NextRequest, NextResponse } from "next/server";

import { markThreadReadAction } from "@/app/(agent)/agent/messages/actions";
import { isUuid } from "@/lib/agent/messageQuery";

// The newest message's created_at, as text (agent-message checks it again). Never through a
// Date: that drops the microseconds Postgres compares on.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * "Mark read" from a web notification (Screen Inventory §3.10.7, A3107).
 *
 * WHY A ROUTE, NOT A SERVER ACTION: the caller is the service worker (`public/push-sw.js`),
 * which has no React tree to call an action from. It posts here with the advisor's cookies,
 * and this runs the same `agent-message` read the open thread does, up to the message the
 * notification was about and no further, so anything newer stays unread.
 *
 * SAME-ORIGIN ONLY. The session rides on cookies, so a cross-site form could aim a POST here.
 * Marking a thread read is low stakes, but it is still the advisor's state: the Origin header
 * must be this site's. A service worker's fetch always sends it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ conversationId: string }> }) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }

  const { conversationId } = await ctx.params;
  let seenUpTo: unknown;
  try {
    seenUpTo = ((await req.json()) as { seenUpTo?: unknown }).seenUpTo;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!isUuid(conversationId) || typeof seenUpTo !== "string" || !TIMESTAMP.test(seenUpTo)) {
    return new NextResponse(null, { status: 400 });
  }

  const { changed } = await markThreadReadAction(conversationId, seenUpTo);
  return NextResponse.json({ changed });
}
