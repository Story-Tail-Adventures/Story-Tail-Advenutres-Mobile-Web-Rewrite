// A dialog the URL opened (?link=, ?paid=, ?rename=, ?retire=) and the server sent open. It
// becomes a modal focused on itself, as MUI's Dialog is; closing it (Escape) goes back to
// the page without the query, as Next's onClose did; a click on the backdrop does not close
// it (ui.js would), because that would throw away what was typed. Each dialog's Cancel is a
// plain link, so all of this is progressive.

for (const dialog of document.querySelectorAll("dialog[data-trp-modal][open]")) {
  if (!(dialog instanceof HTMLDialogElement)) continue;
  const back = dialog.getAttribute("data-trp-close-href");
  dialog.close();
  dialog.showModal();
  dialog.focus();
  // The close() above fires its event while the dialog is open again: only a real close goes back.
  dialog.addEventListener("close", () => {
    if (!dialog.open && back) window.location.assign(back);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) event.stopPropagation();
  });
}
