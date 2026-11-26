// Screen 3.10.5's three courtesies. Everything here works without it: the merge-field chips
// are submit buttons, so the server puts the token at the end of the message and draws the
// preview again. With a script the token goes in at the cursor, the preview follows every
// keystroke, and leaving with unsaved changes asks first.

const form = document.querySelector("[data-template-editor]");

if (form) {
  const body = form.querySelector("#tpl-body");
  const preview = form.querySelector("[data-slot='ed-preview']");
  const chips = [...form.querySelectorAll("[data-sample]")];

  // The sample each field becomes, read off the chips rather than kept a second time here:
  // the server writes both, so the preview cannot drift from what Save would produce.
  const sample = new Map(chips.map((c) => [c.value, c.getAttribute("data-sample")]));
  const TOKEN = /\{\{([^{}]*)\}\}/g;

  const draw = () => {
    if (!preview || !body) return;
    preview.textContent = body.value.replace(TOKEN, (whole, raw) => {
      const value = sample.get(raw.trim());
      return value === undefined || value === "" ? whole : value;
    });
  };

  if (body) {
    body.addEventListener("input", draw);
    draw();
  }

  for (const chip of chips) {
    chip.addEventListener("click", (e) => {
      if (!body) return;
      e.preventDefault();
      const token = `{{${chip.value}}}`;
      // Into an empty box the token is the whole message; otherwise it goes in at the
      // cursor, after any selection, never replacing what was typed.
      if (body.value.trim() === "") {
        body.value = token;
      } else {
        const at = Math.max(body.selectionStart ?? body.value.length, body.selectionEnd ?? 0);
        body.value = body.value.slice(0, at) + token + body.value.slice(at);
        body.setSelectionRange(at + token.length, at + token.length);
      }
      body.focus();
      draw();
      mark();
    });
  }

  // Leaving with unsaved changes asks first, on a reload or a close. A click on Save or on a
  // merge-field chip is not leaving.
  const start = new FormData(form);
  let dirty = false;
  const mark = () => {
    const now = new FormData(form);
    dirty = [...now].some(([k, v]) => k !== "op" && String(start.get(k) ?? "") !== String(v));
  };
  form.addEventListener("input", mark);
  form.addEventListener("submit", () => {
    dirty = false;
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
  });

  // Archiving throws away whatever is unsaved, so it asks first, as Next's does. The sentence
  // comes off the button, so the copy lives in one place: the Go side.
  const archive = form.querySelector("[data-archive-confirm]");
  if (archive) {
    archive.addEventListener("click", (e) => {
      if (dirty && !window.confirm(archive.getAttribute("data-archive-confirm"))) {
        e.preventDefault();
      }
    });
  }
}
