// §3.4.15 / §3.6's small behaviours. Everything here is progressive: each form posts and 303s
// without it, and each dialog is a page state (?link=, ?paid=) whose Cancel is a link.
//
//   - A dialog the server sent open becomes a modal, focused on itself as MUI's is. Closing
//     it (Escape) goes back to the schedule, as Next's onClose did; a click on the backdrop
//     does not close it.
//   - The pay link preview follows what is typed: the site name exactly as the client will
//     see it (lower case, no www., punycode from new URL()), and nothing for a link that is
//     not https. A courtesy only: the server checks the link again, then the function.

for (const dialog of document.querySelectorAll("dialog[data-trp-modal][open]")) {
  if (!(dialog instanceof HTMLDialogElement)) continue;
  const back = dialog.getAttribute("data-trp-close-href");
  dialog.close();
  dialog.showModal();
  // MUI's Dialog focuses itself, not its first field (so the label is not yet "focused").
  dialog.focus();
  // The close() above fires its event while the dialog is open again: only a real close goes back.
  dialog.addEventListener("close", () => {
    if (!dialog.open && back) window.location.assign(back);
  });
  // ui.js closes a .dialog on a backdrop click; this one stays, as MUI's did.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) event.stopPropagation();
  });
}

function paySiteName(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || !url.hostname) return "";
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

const input = document.querySelector("[data-trp-payurl]");
const preview = document.querySelector("[data-trp-preview]");
const site = document.querySelector("[data-trp-site]");
if (input instanceof HTMLInputElement && preview && site) {
  input.addEventListener("input", () => {
    const name = paySiteName(input.value.trim());
    site.textContent = name;
    preview.hidden = name === "";
  });
}
