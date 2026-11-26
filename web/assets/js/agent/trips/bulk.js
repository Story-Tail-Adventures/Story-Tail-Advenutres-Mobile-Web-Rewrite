// Screen 3.4.1's "select every trip on this page" (components/agent/TripBulkStatus.tsx
// SelectAllTrips). Progressive: without this module the box stays hidden, as Next's renders
// nothing before hydration, and every row checkbox still posts on its own. The bulk bar
// itself needs no script (trips.css shows it with :has(:checked)).

const all = document.querySelector("[data-trp-select-all]");
const form = all && all.closest("form");

if (all instanceof HTMLInputElement && form) {
  const rows = () => Array.from(form.querySelectorAll('input[type="checkbox"][name="trip"]'));

  // Checked when every row is, indeterminate when some are, as Next's MUI Checkbox drew it.
  const sync = () => {
    const boxes = rows();
    const ticked = boxes.filter((b) => b.checked).length;
    all.checked = boxes.length > 0 && ticked === boxes.length;
    all.indeterminate = ticked > 0 && ticked < boxes.length;
  };

  all.hidden = false;
  all.addEventListener("change", () => {
    for (const b of rows()) b.checked = all.checked;
    all.indeterminate = false;
  });
  form.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === "trip") sync();
  });
  // Back from another page restores the boxes from the cache; draw the header to match.
  window.addEventListener("pageshow", sync);
  sync();
}
