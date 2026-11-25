// The message thread's two conveniences (Screens 2.2.7 and §2.6). Neither is load-bearing:
// with scripting off the page still reads, the chips still fill the box through a round
// trip, and the unread badge clears the next time the traveler opens the thread from a
// screen that can write.
//
// WHY MARKING READ IS A POST AND NOT PART OF THE RENDER. A render is not a reading. The
// React version used an effect for the same reason — so a prefetch could not clear somebody's
// unread count — and a GET that writes would do it for a crawler or a link preview too.
// The browser cannot call the Edge Function itself: the session is an HttpOnly cookie that
// only the server reads, so this posts to a route that does the write with the visitor's
// own token.

const thread = document.querySelector("[data-read-url]");
if (thread) {
  const body = new URLSearchParams({
    conversationId: thread.dataset.conversation ?? "",
    seenUpTo: thread.dataset.seenUpTo ?? "",
  });
  // Up to the newest message that was on their screen, so an advisor reply that lands after
  // the page was drawn stays unread. Failure costs nothing but the badge.
  fetch(thread.dataset.readUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    credentials: "same-origin",
  }).catch(() => {});
}

// A quick reply fills the compose box here rather than through the server. The chips are
// real submit buttons so they work without this; intercepting them saves the round trip and
// keeps what the traveler had already typed from being thrown away by it.
const quick = document.querySelector("[data-quick-form]");
const compose = document.querySelector("#body");
if (quick && compose) {
  quick.addEventListener("click", (event) => {
    const chip = event.target.closest("button[value]");
    if (!chip) return;
    event.preventDefault();
    compose.value = chip.value;
    compose.focus();
    // The caret goes to the end, so they can keep typing rather than in front of it.
    compose.setSelectionRange(compose.value.length, compose.value.length);
  });
}

// Enter sends, shift+enter adds a line — the convention every messaging surface a traveler
// already uses follows. Without this the textarea takes a plain Enter as a newline, which is
// the browser's default and a perfectly usable fallback.
if (compose) {
  compose.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (compose.value.trim().length === 0) {
      // Nothing to send: swallow it rather than posting an empty form.
      event.preventDefault();
      return;
    }
    event.preventDefault();
    compose.form?.requestSubmit();
  });
}
