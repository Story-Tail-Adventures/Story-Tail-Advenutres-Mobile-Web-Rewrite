// Merge duplicate records (Screens 3.9.7 / 3.3.11): the confirm step, what ClientMergeForm
// does once hydrated.
//
// The page works without this: "Review the merge" posts the picks with intent=review and the
// server answers with the confirm dialog open. With it, the dialog opens in place, and "The
// record you'll have" follows the radios as they stand.

const form = document.querySelector("form[data-merge-form]");
const dialog = form && form.querySelector("dialog");
const review = form && form.querySelector("[data-merge-review]");

if (dialog instanceof HTMLDialogElement && review) {
  review.addEventListener("click", (event) => {
    event.preventDefault();
    for (const dd of dialog.querySelectorAll("[data-merge-value]")) {
      const name = "pick-" + dd.getAttribute("data-merge-value");
      const picked = Array.from(form.querySelectorAll('input[type="radio"]'))
        .find((input) => input.name === name && input.checked);
      const text = picked && picked.closest("label") && picked.closest("label").querySelector("[data-merge-text]");
      // A pinned detail has no radios: its value is already the one it keeps.
      if (text) dd.textContent = text.textContent;
    }
    // Opening starts clean, as Next's setError(null) does.
    const error = dialog.querySelector("[data-merge-error]");
    if (error) error.hidden = true;
    if (!dialog.open) dialog.showModal();
    dialog.focus();
  });
}
