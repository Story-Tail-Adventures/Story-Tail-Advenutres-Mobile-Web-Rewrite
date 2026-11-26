// §3.11.8's form, enhanced. The form is a plain GET to /agent/reports/download and works
// with this module absent: every field and all four hints are then on screen at once, and
// the route still sends no dates for a Clients export and no contact switch for any other.
//
// So this file only SHOWS AND HIDES. It writes no figure, decides nothing the server does
// not decide again, and a hidden field is also DISABLED so the browser leaves it out of the
// query — the download URL then reads as the export that was asked for.

const DATED = new Set(["ledger", "trips", "milestones"]);

function setShown(el, shown) {
  if (!el) return;
  el.hidden = !shown;
  for (const field of el.querySelectorAll("input, select, textarea")) {
    field.disabled = !shown;
  }
}

function wire(form) {
  const type = form.querySelector("#export-type");
  const dates = form.querySelector("[data-export-dates]");
  const contact = form.querySelector("[data-export-contact]");
  const hints = [...form.querySelectorAll("[data-export-hint]")];
  if (!type) return;

  const apply = () => {
    const chosen = type.value;
    setShown(dates, DATED.has(chosen));
    const wantsContact = chosen === "clients";
    setShown(contact, wantsContact);
    if (!wantsContact) {
      // Never carried over: a switch ticked for Clients does not ride to the next type.
      const box = contact?.querySelector("input[type=checkbox]");
      if (box) box.checked = false;
    }
    for (const hint of hints) {
      hint.hidden = hint.dataset.exportHint !== chosen;
    }
  };

  type.addEventListener("change", apply);
  apply();
}

// The two date fields bound each other, so the browser refuses a reversed range before it is
// sent and the advisor never lands on the route's plain-text refusal. The server still checks.
function bindRange(form) {
  const from = form.querySelector("#export-from");
  const to = form.querySelector("#export-to");
  if (!from || !to) return;
  const sync = () => {
    from.max = to.value || "";
    to.min = from.value || "";
  };
  from.addEventListener("change", sync);
  to.addEventListener("change", sync);
  sync();
}

for (const form of document.querySelectorAll(".mny-exp-form")) {
  wire(form);
  bindRange(form);
}
