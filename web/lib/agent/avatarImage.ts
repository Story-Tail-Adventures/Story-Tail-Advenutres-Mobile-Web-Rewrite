/**
 * §3.12.1's photo, made square in the browser (Q8): centre-cropped, scaled to 400×400, saved
 * as a JPEG and handed over as base64. Browser only (canvas); no React here.
 */

export const AVATAR_SIZE = 400;
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarPrepError = "too-big" | "wrong-type" | "unreadable";

/** The centred square crop of a w×h image: [sx, sy, side]. */
export function centreSquare(w: number, h: number): [number, number, number] {
  const side = Math.min(w, h);
  return [Math.floor((w - side) / 2), Math.floor((h - side) / 2), side];
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export async function prepareAvatar(
  file: File,
): Promise<{ ok: true; base64: string } | { ok: false; error: AvatarPrepError }> {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return { ok: false, error: "wrong-type" };
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, error: "too-big" };
  try {
    const bitmap = await createImageBitmap(file);
    const [sx, sy, side] = centreSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "unreadable" };
    // A transparent PNG would turn black as a JPEG; paint white under it first.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) return { ok: false, error: "unreadable" };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { ok: true, base64: bytesToBase64(bytes) };
  } catch {
    return { ok: false, error: "unreadable" };
  }
}
