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
