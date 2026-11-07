// The auth forms' pending state (components/auth/SubmitButton.tsx and the FIELDSET_SX fieldsets):
// once a form starts posting, its fields are disabled and the button that sent it shows a
// spinner and its pending label ("Signing you in…"). Progressive: with JS off the forms post
// exactly the same and the page simply changes when the server answers.
//
// ui.js's data-submit-once already refuses a second submit and disables the buttons; this adds
// the words. It runs after the submit has started (a timeout), because disabling a field before
// the browser has read the form would drop that field's value from the post.

const spinner = () => {
  const s = document.createElement("span");
  s.className = "spinner spinner-20";
  s.setAttribute("aria-hidden", "true");
  return s;
};

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
  // Enter in a field has no submitter in some browsers; the form's own pending button stands in.
  const sender =
    (event.submitter instanceof HTMLElement && event.submitter.hasAttribute("data-pending-label")
      ? event.submitter
      : null) ?? (event.submitter ? null : form.querySelector("button[data-pending-label]"));

  window.setTimeout(() => {
    form.querySelectorAll("fieldset:not([disabled])").forEach((f) => {
      f.setAttribute("disabled", "");
      f.setAttribute("data-pending-locked", "");
    });
    if (sender && !sender.hasAttribute("data-pending-text")) {
      sender.setAttribute("data-pending-text", sender.textContent ?? "");
      sender.replaceChildren(spinner(), document.createTextNode(sender.getAttribute("data-pending-label")));
      sender.setAttribute("disabled", "");
    }
  }, 0);
});

// Back to a page the back-forward cache kept mid-submit: give it its form back (ui.js does the
// same for the buttons it locked).
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  document.querySelectorAll("[data-pending-locked]").forEach((f) => {
    f.removeAttribute("disabled");
    f.removeAttribute("data-pending-locked");
  });
  document.querySelectorAll("[data-pending-text]").forEach((b) => {
    b.replaceChildren(document.createTextNode(b.getAttribute("data-pending-text")));
    b.removeAttribute("data-pending-text");
    b.removeAttribute("disabled");
  });
});
