import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.10 Stage 1's view models: the inbox row, the thread, and who a new message is for. The
 * component tests feed already-mapped objects, so a renamed column fails here or nowhere.
 */

const mocks = vi.hoisted(() => ({ callAgentRead: vi.fn() }));
vi.mock("@/lib/agent/api", () => ({ callAgentRead: mocks.callAgentRead }));
vi.mock("@/lib/agent/queries", () => ({
  agentIdentity: async () => ({ displayName: "Gyasi Story", timeZone: "America/New_York" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AgentMessageThreadRow } from "./api";
import { EMPTY_INBOX_QUERY } from "./messageQuery";
import { inboxThread, loadInbox, loadMessageTarget, loadThread } from "./messages";

const ROW: AgentMessageThreadRow = {
  conversation_id: "c1",
  client_id: "k1",
  client_display_name: "Maya Carter",
  trip_id: "t1",
  trip_title: "Sandals · Jul",
  subject: "Sandals · Jul",
  last_message_at: "2026-10-12T18:14:00Z",
  last_message_preview: "Yes lock the upgrade!",
  last_sender_role: "client",
  agent_unread_count: 2,
  // Ends Tuesday 2026-10-13 in New York: due "end of Tue".
  reply_due_at: "2026-10-14T04:00:00Z",
  overdue: false,
  archived: false,
  total_count: 1,
};

const NOW = new Date("2026-10-12T20:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("an inbox row", () => {
  it("names the client, the trip, what was said and when, and the day a reply is due", () => {
    expect(inboxThread(ROW, EMPTY_INBOX_QUERY, "America/New_York", NOW)).toEqual({
      id: "c1",
      href: "/agent/messages/c1",
      clientName: "Maya Carter",
      tripLabel: "Sandals · Jul",
      preview: "Yes lock the upgrade!",
      timeLabel: "2:14p",
      unread: 2,
      overdue: false,
      replyByLabel: "Reply by Tue",
      archived: false,
    });
  });

  it("says when the advisor spoke last, calls a tripless thread General, and drops the due day once overdue", () => {
    const row = inboxThread(
      { ...ROW, last_sender_role: "agent", trip_title: null, overdue: true },
      { ...EMPTY_INBOX_QUERY, unread: true },
      "America/New_York",
      NOW,
    );
    expect(row.preview).toBe("You: Yes lock the upgrade!");
    expect(row.tripLabel).toBe("General");
    expect(row.replyByLabel).toBeNull();
    expect(row.href).toBe("/agent/messages/c1?unread=1");
  });
});

describe("the loaders", () => {
  it("builds the inbox from the summary and one page of threads", async () => {
    mocks.callAgentRead.mockImplementation(async (fn: string) =>
      fn === "agent_message_summary"
        ? { ok: true, rows: [{ open_threads: 3, unread_threads: 2, unread_messages: 3, overdue_threads: 1, archived_threads: 4 }] }
        : { ok: true, rows: [{ ...ROW, total_count: 120 }] },
    );
    const inbox = await loadInbox({ ...EMPTY_INBOX_QUERY, page: 2 });
    expect(inbox).toMatchObject({ headline: "2 unread · 1 overdue", archivedThreads: 4, total: 120, page: 2, pageCount: 3 });
    expect(mocks.callAgentRead).toHaveBeenCalledWith("agent_message_threads", expect.objectContaining({ p_limit: 50, p_offset: 50 }));
  });

  it("is null when a read fails, or when the caller is not an advisor", async () => {
    mocks.callAgentRead.mockResolvedValue({ ok: false, kind: "unavailable" });
    expect(await loadInbox(EMPTY_INBOX_QUERY)).toBeNull();
    mocks.callAgentRead.mockResolvedValue({ ok: true, rows: [] });
    expect(await loadInbox(EMPTY_INBOX_QUERY)).toBeNull();
  });

  it("maps a thread, notes and attachments included, and tells not-found from a failed read", async () => {
    mocks.callAgentRead.mockImplementation(async (fn: string) =>
      fn === "agent_conversation"
        ? { ok: true, rows: [{ conversation_id: "c1", client_id: "k1", client_display_name: "Maya Carter", client_first_name: "Maya", trip_id: null, trip_title: null, subject: null, agent_unread_count: 0, reply_due_at: null, overdue: true, archived: false, client_can_sign_in: false }] }
        : {
            ok: true,
            rows: [
              { message_id: "m0", sender_role: "client", body: "hi", is_internal_note: false, created_at: "2026-10-12T17:00:00.5+00:00", attachments: [], total_messages: 2 },
              { message_id: "m1", sender_role: "agent", body: "note", is_internal_note: true, created_at: "2026-10-12T18:00:00.123456+00:00", attachments: [{ document_id: "d1", filename: "a.pdf", kind: "passport" }], total_messages: 2 },
            ],
          },
    );
    const result = await loadThread("c1");
    expect(result).toMatchObject({
      ok: true,
      thread: {
        header: { clientFirstName: "Maya", tripLabel: "General", overdue: true, replyByLabel: null, clientCanSignIn: false },
        messages: [
          { id: "m0", sender: "client", internalNote: false },
          { id: "m1", sender: "agent", internalNote: true, attachments: [{ id: "d1", filename: "a.pdf" }] },
        ],
        timeZone: "America/New_York",
        truncated: false,
        // The newest message's time as Postgres wrote it, microseconds and all.
        seenUpTo: "2026-10-12T18:00:00.123456+00:00",
      },
    });
    mocks.callAgentRead.mockResolvedValue({ ok: true, rows: [] });
    expect(await loadThread("c1")).toEqual({ ok: false, reason: "not-found" });
    mocks.callAgentRead.mockResolvedValue({ ok: false, kind: "unavailable" });
    expect(await loadThread("c1")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("says a thread is cut short from its real length, not from the row count", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      message_id: `m${i}`, sender_role: "client", body: "x", is_internal_note: false,
      created_at: "2026-10-12T18:00:00Z", attachments: [], total_messages: 500,
    }));
    mocks.callAgentRead.mockImplementation(async (fn: string) =>
      fn === "agent_conversation"
        ? { ok: true, rows: [{ conversation_id: "c1", client_id: "k1", client_display_name: "Maya Carter", client_first_name: "Maya", trip_id: null, trip_title: null, subject: null, agent_unread_count: 0, reply_due_at: null, overdue: false, archived: false, client_can_sign_in: true }] }
        : { ok: true, rows },
    );
    // Exactly 500: the whole thread, nothing hidden.
    expect(await loadThread("c1")).toMatchObject({ ok: true, thread: { truncated: false } });
    rows.forEach((r) => (r.total_messages = 612));
    expect(await loadThread("c1")).toMatchObject({ ok: true, thread: { truncated: true } });
  });

  it("counts a page past the end, so the slot can send the advisor to the real last page", async () => {
    mocks.callAgentRead.mockImplementation(async (fn: string, args?: { p_offset?: number }) =>
      fn === "agent_message_summary"
        ? { ok: true, rows: [{ open_threads: 3, unread_threads: 0, unread_messages: 0, overdue_threads: 0, archived_threads: 0 }] }
        : args?.p_offset === 0
          ? { ok: true, rows: [{ ...ROW, total_count: 51 }] }
          : { ok: true, rows: [] },
    );
    const inbox = await loadInbox({ ...EMPTY_INBOX_QUERY, page: 5 });
    expect(inbox).toMatchObject({ threads: [], total: 51, page: 5, pageCount: 2 });
  });

  it("finds who a new message is for, and the thread it already belongs in", async () => {
    mocks.callAgentRead.mockResolvedValue({
      ok: true,
      rows: [{ client_id: "k1", client_display_name: "Nora Nologin", client_first_name: "Nora", trip_id: null, trip_title: null, conversation_id: null, client_can_sign_in: false }],
    });
    expect(await loadMessageTarget("k1", null)).toEqual({
      ok: true,
      target: { clientId: "k1", clientName: "Nora Nologin", clientFirstName: "Nora", tripId: null, tripLabel: "General", conversationId: null, clientCanSignIn: false },
    });
    expect(mocks.callAgentRead).toHaveBeenCalledWith("agent_message_target", { p_client_id: "k1", p_trip_id: null });
  });
});
