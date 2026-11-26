// "Mark as done" on a day's activities (Screen 2.2.5), the port of MarkDoneList.
//
// It is a PER-BROWSER convenience and nothing more: what is ticked lives in this browser's
// localStorage under sta:done:<tripId>:<dayNumber>, exactly where the Next version kept it,
// and is never sent anywhere. Gyasi cannot see it and another device will not show it.
//
// The page is complete without this file. The buttons are added here rather than rendered by
// the server, so with scripting off — or with storage blocked, which is a private window —
// the day still reads, which is what the screen is for.

const list = document.querySelector("[data-done-list]");
if (list) {
  const key = `sta:done:${list.dataset.trip ?? ""}:${list.dataset.day ?? ""}`;

  // Every read and write is guarded: localStorage throws in a private window and in a
  // browser with site data blocked, and a thrown error here would take the rest of the
  // page's scripts with it.
  const read = () => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  };
  const write = (done) => {
    try {
      window.localStorage.setItem(key, JSON.stringify([...done]));
    } catch {
      // Nothing to do: the tick stays for this page view and is forgotten on the next.
    }
  };

  const items = [...list.querySelectorAll("[data-activity]")];
  const done = read();

  const paint = (item, isDone) => {
    item.classList.toggle("is-done", isDone);
    const button = item.querySelector("[data-done-button]");
    if (!button) return;
    button.textContent = isDone ? "Done" : "Mark as done";
    button.setAttribute("aria-pressed", isDone ? "true" : "false");
  };

  for (const item of items) {
    const id = item.dataset.activity;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-text st-btn btn-small cl-done-button";
    button.dataset.doneButton = "";
    // The activity's own name, so several buttons on one day are told apart by a screen
    // reader rather than being nine copies of "Mark as done".
    const title = item.querySelector("[data-activity-title]");
    if (title) button.setAttribute("aria-label", `Mark as done: ${title.textContent}`);
    button.addEventListener("click", () => {
      const now = read();
      if (now.has(id)) now.delete(id);
      else now.add(id);
      write(now);
      paint(item, now.has(id));
    });
    const actions = item.querySelector("[data-activity-actions]");
    (actions ?? item).appendChild(button);
    paint(item, done.has(id));
  }
}
