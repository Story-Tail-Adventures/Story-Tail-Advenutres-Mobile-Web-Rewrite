// People dialogs: the client detail page's archive dialog and account-admin confirms, and the
// merge page's confirm step (Screens 3.3.2, 3.9.7).
//
// A tile or button that opens one is a link to ?confirm=<name>, which ui.js turns into a
// modal on click. When the server has to show a dialog itself (the post failed, or the link
// was followed without JS) it renders it with the open attribute, and that is a non-modal
// dialog: no backdrop, no focus trap, drawn wherever it sits in the page. Reopen it as a
// modal so it looks and behaves the way Next's does.
//
// showModal focuses the first field, where MUI's Dialog focuses the dialog itself, so the
// reason box would open already focused and outlined. Each dialog has tabindex="-1"; move
// focus onto it instead. Tab still reaches the field first.

const settle = (dialog) => {
  if (dialog instanceof HTMLDialogElement && dialog.open && dialog.classList.contains("ppl-dialog")) {
    dialog.focus();
  }
};

for (const dialog of document.querySelectorAll("dialog.ppl-dialog[open]")) {
  dialog.close();
  dialog.showModal();
  settle(dialog);
}

// Next's dialogs close on Escape but not on a backdrop click, so a stray click cannot throw
// away a typed reason. A backdrop click lands on the <dialog> itself; keep it from reaching
// ui.js, which would close it.
for (const dialog of document.querySelectorAll("dialog.ppl-dialog")) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) event.stopPropagation();
  });
}

// ui.js's listener was added first, so this runs after it has opened the dialog.
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const opener = event.target.closest("[data-dialog-open]");
  if (opener) settle(document.getElementById(opener.getAttribute("data-dialog-open")));
});
