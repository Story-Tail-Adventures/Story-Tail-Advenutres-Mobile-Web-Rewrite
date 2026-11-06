// Small behaviours every layout shares, as one ES module (docs/GO-MIGRATION.md §4.9). Each
// is progressive: the page works without it, and it only adds what a plain link or form
// cannot do.
//
//   Dialogs   <button data-dialog-open="id"> opens <dialog id="id" class="dialog"> as a modal;
//             [data-dialog-close] inside closes it, and so does a click on the backdrop. With
//             JS off the trigger should be a link to a plain confirm page instead.
//   Forms     <form data-submit-once> disables its submit buttons after the first submit, so
//             a double click cannot post twice. (A client-minted UUID v7 makes a retry safe
//             anyway; this just keeps the second click from happening.)
//   Snackbar  .snackbar[data-autohide] leaves after six seconds; CSS already fades it, this
//             takes it out of the accessibility tree too.
//
// Popover menus and the drawer need no script at all: they use the popover attribute.

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const opener = event.target.closest("[data-dialog-open]");
  if (opener) {
    const dialog = document.getElementById(opener.getAttribute("data-dialog-open"));
    if (dialog instanceof HTMLDialogElement && !dialog.open) {
      event.preventDefault();
      dialog.showModal();
    }
    return;
  }

  const closer = event.target.closest("[data-dialog-close]");
  if (closer) {
    const dialog = closer.closest("dialog");
    if (dialog) {
      event.preventDefault();
      dialog.close();
    }
    return;
  }

  // A click on the backdrop lands on the <dialog> itself, outside its content box.
  if (event.target instanceof HTMLDialogElement && event.target.classList.contains("dialog")) {
    const box = event.target.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right &&
      event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) event.target.close();
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-submit-once")) return;
  if (form.dataset.submitted === "1") {
    event.preventDefault();
    return;
  }
  form.dataset.submitted = "1";
  // After the submit has started, so the clicked button's name and value still go with it.
  window.setTimeout(() => {
    form.querySelectorAll('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])').forEach((b) => {
      b.setAttribute("disabled", "");
      b.setAttribute("data-submit-locked", "");
    });
  }, 0);
});

// Coming back with the Back button restores a page from the cache with its buttons still
// disabled; give them back.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  document.querySelectorAll("form[data-submit-once]").forEach((form) => {
    delete form.dataset.submitted;
    form.querySelectorAll("[data-submit-locked]").forEach((b) => {
      b.removeAttribute("disabled");
      b.removeAttribute("data-submit-locked");
    });
  });
});

document.querySelectorAll(".snackbar[data-autohide]").forEach((bar) => {
  window.setTimeout(() => bar.setAttribute("hidden", ""), 6000);
});
