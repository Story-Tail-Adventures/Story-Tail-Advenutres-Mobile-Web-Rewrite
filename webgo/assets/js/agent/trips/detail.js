// Screen 3.4.2's small behaviours (TripDetailHeader's StageMenu, the two dialogs, the notes
// editor). Everything here is progressive: each form posts and 303s without it.
//
//   - The stage select submits itself on change, as Next's StageMenu did. With JS off the
//     form shows its own "Move stage" button (.trp-nojs, hidden once this runs).
//   - A dialog the server sent back open (a refused save, a receipt) becomes a modal, like
//     one opened by its button through ui.js.
//   - The cancel dialog's submit waits for a reason and says why; the save dialog's waits for
//     a name. Courtesies only: the server and the Edge Function refuse both anyway.
//   - Typing in the notes takes the old "Saved" away.

document.documentElement.classList.add("trp-js");

for (const select of document.querySelectorAll("select[data-trp-autosubmit]")) {
  const initial = select.value;
  select.addEventListener("change", () => {
    if (select.value !== initial && select.form) select.form.requestSubmit();
  });
}

for (const dialog of document.querySelectorAll("dialog[data-trp-modal][open]")) {
  if (dialog instanceof HTMLDialogElement) {
    dialog.close();
    dialog.showModal();
  }
}

const reason = document.querySelector("[data-trp-reason]");
if (reason instanceof HTMLTextAreaElement && reason.form) {
  const submit = reason.form.querySelector("[data-trp-needs-reason]");
  const hint = reason.form.querySelector("[data-trp-reason-hint]");
  const sync = () => {
    const empty = reason.value.trim() === "";
    if (submit) submit.toggleAttribute("disabled", empty);
    if (hint) hint.hidden = !empty;
  };
  reason.addEventListener("input", sync);
  sync();
}

const name = document.querySelector("[data-trp-required]");
const save = document.querySelector("[data-trp-submit]");
const nameHint = document.querySelector("[data-trp-name-hint]");
if (name instanceof HTMLInputElement && save) {
  const sync = () => {
    const empty = name.value.trim() === "";
    save.toggleAttribute("disabled", empty);
    if (nameHint) nameHint.hidden = !empty;
  };
  name.addEventListener("input", sync);
  sync();
}

const notes = document.querySelector("[data-trp-notes]");
const saved = document.querySelector("[data-trp-notes-saved]");
if (notes && saved) {
  notes.addEventListener("input", () => {
    saved.hidden = true;
  });
}
