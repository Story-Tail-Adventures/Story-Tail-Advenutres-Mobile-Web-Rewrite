// The client roster's bulk-tag bar (Screen 3.3.1), what ClientBulkTagForm does once hydrated.
//
// The page works without this: the bar is always there (from md) and the form posts the
// ticked ids. With it, the bar waits until a row is ticked, and the select-all box appears
// and ticks or clears every row on the page, showing "some" as indeterminate.

const form = document.querySelector("form[data-bulk-tag]");

if (form) {
  const bar = form.querySelector("[data-bulk-bar]");
  const all = form.querySelector("[data-select-all]");
  const rows = () => Array.from(form.querySelectorAll('input[type="checkbox"][name="clientId"]'));

  const sync = () => {
    const list = rows();
    const ticked = list.filter((box) => box.checked).length;
    if (bar) bar.hidden = ticked === 0;
    if (all) {
      all.checked = list.length > 0 && ticked === list.length;
      all.indeterminate = ticked > 0 && ticked < list.length;
    }
  };

  if (all) {
    all.hidden = false;
    all.addEventListener("change", () => {
      for (const box of rows()) box.checked = all.checked;
      sync();
    });
  }
  form.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === "clientId") sync();
  });
  // Back/forward restores ticks from the cache without a change event.
  window.addEventListener("pageshow", sync);
  sync();
}
