// §3.12's two enhancements. Everything else on these four screens is a plain form post, and
// every one of them still saves with this file absent.
//
//   The photo   the browser makes the square 400x400 JPEG the function stores, exactly as
//               the Next client does (a port of lib/agent/avatarImage.ts). Without it the
//               Upload button posts an empty image and the server says so.
//   The preview the signature as a client will read it, as it is typed, and the Insert
//               chips. Without it the preview is of the SAVED signature.
//
// It writes nothing the server does not work out again: the signature is checked and
// rendered server-side on every save.

// ── The photo ───────────────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 400;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const PHOTO_TOO_BIG = "That photo is over 5 MB. Try a smaller one.";
const PHOTO_WRONG_TYPE = "Use a JPG, PNG or WebP photo.";
const PHOTO_UNREADABLE = "We couldn't read that photo. Try another one.";

/** The centred square crop of a w×h image: [sx, sy, side]. */
function centreSquare(w, h) {
  const side = Math.min(w, h);
  return [Math.floor((w - side) / 2), Math.floor((h - side) / 2), side];
}

function bytesToBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function prepareAvatar(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, error: PHOTO_WRONG_TYPE };
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, error: PHOTO_TOO_BIG };
  try {
    const bitmap = await createImageBitmap(file);
    const [sx, sy, side] = centreSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: PHOTO_UNREADABLE };
    // A transparent PNG would turn black as a JPEG; paint white under it first.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) return { ok: false, error: PHOTO_UNREADABLE };
    return { ok: true, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  } catch {
    return { ok: false, error: PHOTO_UNREADABLE };
  }
}

function showPhotoError(message) {
  const block = document.querySelector("[data-photo-error]");
  const text = document.querySelector("[data-photo-error-text]");
  if (!block || !text) return;
  text.textContent = message;
  block.hidden = message === "";
}

function wireAvatar(form) {
  const file = form.querySelector("[data-avatar-file]");
  const image = form.querySelector("[data-avatar-image]");
  const pick = form.querySelector("[data-avatar-pick]");
  if (!file || !image || !pick) return;

  // With this module running the button opens the picker instead of posting an empty image.
  pick.type = "button";
  pick.addEventListener("click", () => file.click());

  file.addEventListener("change", async () => {
    const chosen = file.files && file.files[0];
    file.value = "";
    if (!chosen) return;
    showPhotoError("");
    const prepared = await prepareAvatar(chosen);
    if (!prepared.ok) {
      showPhotoError(prepared.error);
      return;
    }
    image.value = prepared.base64;
    form.submit();
  });
}

// ── The signature ───────────────────────────────────────────────────────────────────────

const LOCKED_LINE = "Story-Tail Adventures · Hosted by Inteletravel";

/** renderSignature in _shared/email.ts, the same lines the server just drew. */
function signatureLines(text, me) {
  const src = text.trim();
  const filled = src
    .replace(/\{\{\s*agent\.name\s*\}\}/g, me.name.trim())
    .replace(/\{\{\s*agent\.phone\s*\}\}/g, me.phone.trim())
    .replace(/\{\{\s*agent\.email\s*\}\}/g, me.email.trim());
  const sourceLines = src.split("\n");
  const lines = [];
  for (const [i, raw] of filled.split("\n").entries()) {
    const hadField = /\{\{/.test(sourceLines[i] ?? "");
    const line = raw
      .replace(/\s*·\s*(?:·\s*)+/g, " · ")
      .replace(/^\s*·\s*/, "")
      .replace(/\s*·\s*$/, "")
      .trimEnd();
    if (line.trim() === "" && hadField) continue;
    lines.push(line);
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return [...lines, "", LOCKED_LINE];
}

function wireSignature(area) {
  const preview = document.querySelector("[data-signature-preview]");
  if (!preview) return;
  const me = {
    name: preview.dataset.sigName ?? "",
    phone: preview.dataset.sigPhone ?? "",
    email: preview.dataset.sigEmail ?? "",
  };

  const draw = () => {
    const lines = signatureLines(area.value, me);
    preview.replaceChildren();
    for (const [i, line] of lines.entries()) {
      const p = document.createElement("p");
      // textContent, never raw markup: these are the advisor's own words, and a signature
      // is plain text.
      p.textContent = line;
      p.className = "type-caption mny-sig-line";
      if (i === 0) p.classList.add("mny-sig-first");
      if (i === lines.length - 1 && line === LOCKED_LINE) p.classList.add("mny-sig-locked");
      preview.append(p);
    }
  };
  area.addEventListener("input", draw);

  for (const chip of document.querySelectorAll("[data-signature-insert]")) {
    chip.addEventListener("click", () => {
      const token = chip.dataset.signatureInsert ?? "";
      const start = area.selectionStart ?? area.value.length;
      const end = area.selectionEnd ?? start;
      area.value = area.value.slice(0, start) + token + area.value.slice(end);
      const caret = start + token.length;
      area.focus();
      area.setSelectionRange(caret, caret);
      draw();
    });
  }
}

for (const form of document.querySelectorAll("[data-avatar-form]")) wireAvatar(form);
const signatureArea = document.querySelector("[data-signature-text]");
if (signatureArea) wireSignature(signatureArea);
