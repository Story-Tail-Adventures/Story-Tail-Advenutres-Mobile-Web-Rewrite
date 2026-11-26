// The client form (§3.3.3 / §3.3.4), what ClientForm's React state did, in place.
//
// Without this the form still works: every add or remove control is a submit button the
// server answers by re-rendering the form with the change (nothing saved). With it, those
// steps happen here instead:
//
//   tags    "+ tag" adds a chosen chip and hides the suggestion; a chip's close removes it
//           (and shows its suggestion again); "Add" or Enter in "New tag" adds what was typed,
//           lower-cased and once only
//   dates   "Add a date" appends an empty row; "Remove" drops one; the "Every year" boxes are
//           renumbered so each still names its own row, as the server zips them by position
//   country State / ZIP code for the US, Region / Postal code anywhere else

const form = document.querySelector("form[data-client-form]");

if (form) {
  const chips = form.querySelector("[data-tag-chips]");
  const tagTemplate = form.querySelector("template[data-tag-template]");
  const newTag = form.querySelector("[data-new-tag]");
  const rows = form.querySelector("[data-date-rows]");
  const dateTemplate = form.querySelector("template[data-date-template]");

  const chosen = () => Array.from(chips.querySelectorAll('input[type="hidden"][name="tag"]')).map((i) => i.value);
  const suggestionFor = (tag) =>
    Array.from(chips.querySelectorAll("[data-add-tag]")).find((b) => b.value === tag);

  const addTag = (raw) => {
    const tag = raw.trim().toLowerCase();
    if (tag === "" || chosen().includes(tag)) return;
    const chip = tagTemplate.content.firstElementChild.cloneNode(true);
    chip.querySelector('input[name="tag"]').value = tag;
    chip.querySelector("[data-tag-text]").textContent = tag;
    const close = chip.querySelector("[data-remove-tag]");
    close.value = tag;
    close.setAttribute("aria-label", `Remove tag ${tag}`);
    // New chips go after the chosen ones, before the suggestions.
    const firstSuggestion = chips.querySelector(".ppl-contents");
    chips.insertBefore(chip, firstSuggestion);
    const suggestion = suggestionFor(tag);
    if (suggestion) suggestion.hidden = true;
  };

  const renumber = () => {
    rows.querySelectorAll("[data-date-row]").forEach((row, i) => {
      const box = row.querySelector('input[name="dateRecurring"]');
      if (box) box.value = String(i);
      const remove = row.querySelector("[data-remove-date]");
      if (remove) remove.value = String(i);
    });
  };

  form.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const removeTag = event.target.closest("[data-remove-tag]");
    if (removeTag) {
      event.preventDefault();
      const tag = removeTag.value;
      removeTag.closest("[data-tag-chip]")?.remove();
      const suggestion = suggestionFor(tag);
      if (suggestion) suggestion.hidden = false;
      return;
    }
    const suggest = event.target.closest("[data-add-tag]");
    if (suggest) {
      event.preventDefault();
      addTag(suggest.value);
      return;
    }
    if (event.target.closest("[data-add-new-tag]")) {
      event.preventDefault();
      addTag(newTag.value);
      newTag.value = "";
      return;
    }
    if (event.target.closest("[data-add-date]")) {
      event.preventDefault();
      rows.appendChild(dateTemplate.content.firstElementChild.cloneNode(true));
      renumber();
      return;
    }
    const removeDate = event.target.closest("[data-remove-date]");
    if (removeDate) {
      event.preventDefault();
      removeDate.closest("[data-date-row]")?.remove();
      renumber();
    }
  });

  newTag?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag(newTag.value);
      newTag.value = "";
    }
  });

  const country = form.querySelector("[data-country-select]");
  country?.addEventListener("change", () => {
    const us = country.value === "US";
    const region = form.querySelector('label[for="addressRegion"]');
    const postal = form.querySelector('label[for="addressPostalCode"]');
    if (region) region.textContent = us ? "State" : "Region";
    if (postal) postal.textContent = us ? "ZIP code" : "Postal code";
  });
}
