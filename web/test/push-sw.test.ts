// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * public/push-sw.js (§3.10.7) runs in a service worker, which no test browser here offers, so it
 * runs in a fake worker scope: the file is evaluated with a `self` that records its listeners,
 * and each test fires an event at them the way the browser would.
 */

const SOURCE = readFileSync(join(__dirname, "..", "public", "push-sw.js"), "utf8");
const CONV = "0195a2c0-1a00-7000-8000-0000000000b0";
const SEEN = "2026-10-15T14:02:11.123456+00:00";

type Handler = (event: unknown) => void;

function loadWorker() {
  const handlers = new Map<string, Handler>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const closed: string[] = [];
  const open = [
    { tag: CONV, close: () => closed.push(CONV) },
    { tag: "summary", close: () => closed.push("summary") },
  ];
  const windowClient = { url: "http://localhost:3000/agent", focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) };
  const self = {
    location: new URL("http://localhost:3000/push-sw.js"),
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: vi.fn(),
    registration: {
      showNotification: vi.fn(async (title: string, options: Record<string, unknown>) => void shown.push({ title, options })),
      getNotifications: vi.fn(async ({ tag }: { tag: string }) => open.filter((n) => n.tag === tag)),
    },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => [windowClient]), openWindow: vi.fn(async () => undefined) },
  };
  const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  new Function("self", "fetch", SOURCE)(self, fetchMock);

  async function fire(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.get(type)!({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  }
  const push = (payload: unknown) =>
    fire("push", { data: { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) } });

  return { self, shown, closed, windowClient, fetchMock, fire, push };
}

let w: ReturnType<typeof loadWorker>;
beforeEach(() => {
  w = loadWorker();
});

describe("push-sw.js", () => {
  it("shows a message under the thread's tag, with Mark read and the thread to open", async () => {
    await w.push({
      v: 1,
      kind: "message",
      tag: CONV,
      conversationId: CONV,
      seenUpTo: SEEN,
      title: "Jordan Hayes · Anniversary Week in Negril",
      body: "Is the airport transfer included?",
      count: 1,
      url: `/agent/messages/${CONV}?reply=1`,
    });
    expect(w.shown).toHaveLength(1);
    const { title, options } = w.shown[0];
    expect(title).toBe("Jordan Hayes · Anniversary Week in Negril");
    expect(options).toMatchObject({
      body: "Is the airport transfer included?",
      tag: CONV,
      renotify: true,
      actions: [{ action: "read", title: "Mark read" }],
      data: { url: `/agent/messages/${CONV}?reply=1`, conversationId: CONV, seenUpTo: SEEN },
    });
  });

  it("shows the morning summary with no Mark read", async () => {
    await w.push({ v: 1, kind: "summary", tag: "summary", title: "3 new messages while you rested", body: "x", url: "/agent/messages" });
    expect(w.shown[0].options).toMatchObject({ tag: "summary", actions: [] });
  });

  it("a dismiss closes only that thread's notification", async () => {
    await w.push({ v: 1, kind: "dismiss", tag: CONV });
    expect(w.closed).toEqual([CONV]);
    expect(w.shown).toHaveLength(0);
  });

  it("ignores a payload it does not understand", async () => {
    await w.push({ v: 2, kind: "message" });
    await w.push("null");
    expect(w.shown).toHaveLength(0);
  });

  it("Mark read posts the notified message's timestamp, same-origin", async () => {
    const close = vi.fn();
    await w.fire("notificationclick", {
      action: "read",
      notification: { close, data: { url: "/x", conversationId: CONV, seenUpTo: SEEN } },
    });
    expect(close).toHaveBeenCalled();
    expect(w.fetchMock).toHaveBeenCalledWith(`/api/agent/messages/${CONV}/read`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seenUpTo: SEEN }),
    });
    expect(w.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("a click focuses a tab already on that thread, and otherwise opens a new window", async () => {
    const data = { url: `/agent/messages/${CONV}?reply=1`, conversationId: CONV, seenUpTo: SEEN };

    // A tab elsewhere (it may hold an unsent reply) is left alone.
    await w.fire("notificationclick", { action: "", notification: { close: vi.fn(), data } });
    expect(w.windowClient.focus).not.toHaveBeenCalled();
    expect(w.self.clients.openWindow).toHaveBeenCalledWith(`http://localhost:3000/agent/messages/${CONV}?reply=1`);

    w.windowClient.url = `http://localhost:3000/agent/messages/${CONV}`;
    w.self.clients.openWindow.mockClear();
    await w.fire("notificationclick", { action: "", notification: { close: vi.fn(), data } });
    expect(w.windowClient.focus).toHaveBeenCalled();
    expect(w.self.clients.openWindow).not.toHaveBeenCalled();
    expect(w.fetchMock).not.toHaveBeenCalled();
  });
});
