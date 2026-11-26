// §3.4.13's small behaviour: Rename's Save waits for a name, as Next's did (a courtesy: the
// server refuses a blank one anyway). The dialogs are url-dialog.js's, loaded beside this
// (assets are served only under hashed names, so modules cannot import each other).
const name = document.querySelector("[data-trp-required]");
const save = document.querySelector("[data-trp-submit]");
if (name instanceof HTMLInputElement && save) {
  const sync = () => save.toggleAttribute("disabled", name.value.trim() === "");
  name.addEventListener("input", sync);
  sync();
}
