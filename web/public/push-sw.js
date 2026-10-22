/*
 * §3.10 Stage 3b: the advisor's web notifications (Screen Inventory §3.10.7, frame A3107).
 *
 * This service worker does notifications and nothing else: no fetch handler, no caching, so
 * it can never serve a stale page. It is registered only when the advisor taps "Turn on".
 *
 * The payload comes from supabase/functions/_shared/push.ts, end-to-end encrypted to this
 * browser. Three kinds:
 *   message  one per thread (the tag is the conversation id, so the next message replaces it)
 *   summary  the 7am "while you rested" notification
 *   dismiss  the thread was read somewhere: close its notification here too
 *
 * Plain JavaScript in public/ because a service worker must be served from a stable URL at
 * the site root; it is not bundled.
 */

const ICON = "/icon.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    return data && data.v === 1 ? data : null;
  } catch {
    return null;
  }
}

self.addEventListener("push", (event) => {
  const p = readPayload(event);
  if (!p) return;

  if (p.kind === "dismiss") {
    // The server sends dismisses to phones only (a push that shows nothing is a browser policy
    // problem). Handled anyway, so a dismiss that does arrive closes what it names.
    event.waitUntil(
      self.registration.getNotifications({ tag: p.tag }).then((list) => list.forEach((n) => n.close())),
    );
    return;
  }

  const isMessage = p.kind === "message";
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      // A second message in the same thread replaces the notification; let it be noticed.
      renotify: true,
      icon: ICON,
      badge: ICON,
      data: { url: p.url, conversationId: isMessage ? p.conversationId : null, seenUpTo: isMessage ? p.seenUpTo : null },
      // Ruling 3: no reply box on the web. Browsers that draw buttons show "Mark read";
      // clicking the notification itself opens the thread with the reply box ready.
      actions: isMessage ? [{ action: "read", title: "Mark read" }] : [],
    }),
  );
});

async function markRead(data) {
  if (!data.conversationId || !data.seenUpTo) return;
  await fetch(`/api/agent/messages/${encodeURIComponent(data.conversationId)}/read`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seenUpTo: data.seenUpTo }),
  }).catch(() => undefined);
}

/**
 * Open the thread without taking over a tab the advisor is using for something else, which could
 * hold an unsent reply: a tab already on that thread is focused, anything else gets a new window.
 */
async function openUrl(url) {
  const target = new URL(url || "/agent/messages", self.location.origin);
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const there = windows.find((w) => {
    const at = new URL(w.url);
    return at.origin === target.origin && at.pathname === target.pathname;
  });
  if (there) return there.focus();
  return self.clients.openWindow(target.href);
}

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();
  event.waitUntil(event.action === "read" ? markRead(data) : openUrl(data.url));
});
