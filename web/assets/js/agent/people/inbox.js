// The inbox's bulk-archive bar (Screen 3.10.1), what AgentInboxList does once hydrated.
//
// The page works without this: the form posts whatever is ticked, and the bar is just hidden
// until something is. With it, the bar appears on the first tick and says how many.

const form = document.querySelector("form[data-bulk-archive]");

if (form) {
  const bar = form.querySelector("[data-bulk-bar]");
  const count = form.querySelector("[data-bulk-count]");
  const boxes = () => Array.from(form.querySelectorAll('input[type="checkbox"][name="conversationId"]'));

  const sync = () => {
    const n = boxes().filter((b) => b.checked).length;
    if (bar) bar.hidden = n === 0;
    if (count) count.textContent = n === 1 ? "1 selected" : `${n.toLocaleString("en-US")} selected`;
  };

  form.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === "conversationId") sync();
  });
  sync();
}

// The count poller (docs/GO-MIGRATION.md §4.9). A Next page re-renders itself when the
// server revalidates; a Go page is a page, so once it has been open a while its counts can
// be stale. Every 30 seconds this asks the count endpoint — the numbers only, nothing about
// any one thread — and when they differ from what this page was drawn with, it reveals a
// link that loads the same list again. It never rewrites the list underneath the advisor.
//
// It stops while the tab is hidden, and asks once more when it comes back.

const banner = document.querySelector("[data-new-banner]");

if (banner) {
  const drawn = banner.getAttribute("data-counts");
  let timer = null;

  const check = async () => {
    try {
      const r = await fetch("/api/agent/messages/count", { headers: { accept: "application/json" } });
      if (!r.ok) return;
      const c = await r.json();
      if (`${c.unreadThreads}:${c.overdueThreads}` !== drawn) {
        banner.hidden = false;
        stop();
      }
    } catch {
      // An offline moment is not worth saying anything about; the next tick tries again.
    }
  };

  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };

  const start = () => {
    stop();
    if (!banner.hidden) return;
    timer = window.setInterval(check, 30000);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else {
      check();
      start();
    }
  });
  start();
}

// The reply box's two faces (§3.10.2). Everything else about an internal note — the tint,
// the dashed edge, the lock line, which button says "Add note" — is CSS off the checkbox.
// The label and the placeholder are words, which CSS cannot swap, so they swap here. With no
// script the box stays "Reply", which is what it posts unless the switch is ticked.

for (const form of document.querySelectorAll("form:has(.ppl-note-switch)")) {
  const sw = form.querySelector(".ppl-note-switch");
  const label = form.querySelector("[data-reply-label]");
  const text = form.querySelector("[data-reply-text]");
  if (!sw || !label || !text) continue;

  const reply = { label: label.textContent, placeholder: text.placeholder };
  const note = { label: label.getAttribute("data-note-label"), placeholder: text.getAttribute("data-note-placeholder") };

  const sync = () => {
    const on = sw.checked;
    label.textContent = on ? note.label : reply.label;
    text.placeholder = on ? note.placeholder : reply.placeholder;
  };
  sw.addEventListener("change", sync);
  sync();
}

// A thread opens on its newest message (§3.10.2, what ThreadOpened does). Without this the
// scroll region starts at the oldest message, which on a long thread is the wrong end. The
// marking-read half is server-side here, so this only moves the view.

const scroller = document.querySelector("[data-msg-scroll]");
if (scroller) {
  const rows = scroller.querySelectorAll("[data-msg-row]");
  const last = rows[rows.length - 1];
  if (last) last.scrollIntoView({ block: "end" });
}
