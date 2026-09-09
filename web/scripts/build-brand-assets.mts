/**
 * Generate every shipped brand raster from the master artwork in
 * design/source-prototype/brand/.
 *
 * See docs/Design-System.md §11.1 for the masters and §11.4 for the icon set. P1.
 *
 * Nothing here runs at build time — the outputs are committed. Run it when the master
 * artwork changes:  npm run generate:brand -w web
 *
 * Three masters, all 5000px-ish PNGs with a real alpha channel:
 *   logo-adventures-light.png  the horizontal book/fox lockup   (exported from the PSD)
 *   logo-tropical-dark.png     the stacked palm/sun lockup
 *   logo-adventures-glyph.png  the book + fox tail, no wordmark (favicon + app icons)
 *
 * There is no vector master we can use: FF.ai / FF-01.eps need Illustrator, and this
 * machine has no ImageMagick, Inkscape or potrace. So everything is raster, cut from the
 * PNGs at 3x the largest rendered size.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SRC = join(ROOT, "design/source-prototype/brand");
const ART = join(ROOT, "web/components/brand/art");
const APP = join(ROOT, "web/app");
const RES = join(ROOT, "mobile/androidApp/src/main/res");
const IOS = join(ROOT, "mobile/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset");
const CMP = join(ROOT, "mobile/shared/src/commonMain/composeResources/drawable");

/** brand.cream — the light-scheme background, per Design-System §4.1. */
const CREAM = { r: 0xfb, g: 0xf6, b: 0xee, alpha: 1 };

/**
 * Alpha above which a pixel counts as ink.
 *
 * Deliberately not 0: all three masters carry a soft drop shadow that trails out to
 * alpha ~0.01, which is why sharp's own .trim() returns the full canvas on every one of
 * them. Scanning at alpha>0 grows the glyph's box 6.3% on the bottom edge alone, which
 * floats the artwork high in frame once it is centred.
 */
const INK_ALPHA = 128;
/** Alpha at which the drop shadow still counts, once the ink box is known. */
const SOFT_ALPHA = 5;
/**
 * Qualifying pixels a row/column needs before it counts as content. The glyph master has
 * a single stray speck to the right of the book; without this it defines the bounding box
 * on its own and the glyph ends up wildly off-centre.
 */
const MIN_RUN = 3;
/** Cap on how far the box may grow from ink toward shadow, as a fraction of the ink box. */
const MAX_BLEED = 0.08;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

async function pixels(file: string | Buffer) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    // Every scan below indexes with a hard-coded 4-byte RGBA stride, so both halves of
    // that assumption are pinned here rather than assumed.
    //
    // `depth` is sharp's own default, not a fix: a hand-built 16-bit RGBA PNG (verified
    // `depth: ushort`) still comes back as 4 bytes/px through a bare `.raw()`. Stating it
    // costs nothing and means a future default change cannot quietly re-interpret the
    // buffer. The channel count is the half that can actually vary — that one throws.
    .raw({ depth: "uchar" })
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(
      `expected 4 channels after ensureAlpha, got ${info.channels} — the scans assume 8-bit RGBA`,
    );
  }
  return { data, w: info.width, h: info.height };
}

function boxAt(data: Buffer, w: number, h: number, alpha: number): Box {
  const rows = new Int32Array(h);
  const cols = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > alpha) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (a: Int32Array) => a.findIndex((v) => v >= MIN_RUN);
  const last = (a: Int32Array) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] >= MIN_RUN) return i;
    return -1;
  };
  const top = first(rows);
  const bottom = last(rows);
  const left = first(cols);
  const right = last(cols);
  if (top < 0 || left < 0) throw new Error(`no content above alpha ${alpha}`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

interface Content {
  /** Ink plus as much of the drop shadow as MAX_BLEED allows. This is what gets extracted. */
  box: Box;
  /** The artwork proper, at INK_ALPHA. This is what the eye centres on. */
  ink: Box;
}

/**
 * The ink box, expanded toward the shadow box but never by more than MAX_BLEED per axis.
 *
 * Per axis matters. A single cap taken from the LONGEST side and applied to all four
 * edges never binds on a shadow this size, so the returned box was simply the shadow box
 * — and since the shadow falls down-right, its centre sits below and right of the ink's.
 * Centring that box put every generated icon high and left by ~1.8%.
 */
function contentBox(data: Buffer, w: number, h: number): Content {
  const ink = boxAt(data, w, h, INK_ALPHA);
  const soft = boxAt(data, w, h, SOFT_ALPHA);
  const bleedX = Math.round(ink.width * MAX_BLEED);
  const bleedY = Math.round(ink.height * MAX_BLEED);
  const left = Math.max(soft.left, ink.left - bleedX);
  const top = Math.max(soft.top, ink.top - bleedY);
  const right = Math.min(soft.left + soft.width - 1, ink.left + ink.width - 1 + bleedX);
  const bottom = Math.min(soft.top + soft.height - 1, ink.top + ink.height - 1 + bleedY);
  return { box: { left, top, width: right - left + 1, height: bottom - top + 1 }, ink };
}

/** Row-ink profile across a box, used to find the gap above the tagline band. */
function rowInk(data: Buffer, w: number, box: Box): Int32Array {
  const rows = new Int32Array(box.height);
  for (let y = 0; y < box.height; y++) {
    const row = (box.top + y) * w * 4;
    for (let x = box.left; x < box.left + box.width; x++) {
      if (data[row + x * 4 + 3] > INK_ALPHA) rows[y]++;
    }
  }
  return rows;
}

/**
 * Drop the "MAKING TRAVEL AN ADVENTURE" band off the bottom of a lockup.
 *
 * Both lockups carry it. It is 5% of the light lockup's height and 2.3% of the dark one's,
 * so it needs a 140px-tall mark to clear 7px — and the mark never renders above 120px. It
 * belongs on print collateral, not in the app chrome.
 *
 * Found rather than hard-coded: walk up from the bottom through the tagline's ink, then
 * through the empty gap above it, and cut at the top of that gap.
 */
function cropTagline(data: Buffer, w: number, box: Box): Box {
  const rows = rowInk(data, w, box);
  let y = box.height - 1;
  while (y >= 0 && rows[y] < MIN_RUN) y--; // trailing shadow, if any
  while (y >= 0 && rows[y] >= MIN_RUN) y--; // the tagline band itself
  const gapBottom = y;
  while (y >= 0 && rows[y] < MIN_RUN) y--; // the gap above it
  const gapTop = y + 1;
  if (gapTop <= 0 || gapBottom - gapTop < 2) {
    throw new Error("no clean gap above the tagline — check the master artwork");
  }
  const cut = Math.round((gapTop + gapBottom) / 2);
  console.log(`   tagline gap rows ${gapTop}..${gapBottom} of ${box.height}, cutting at ${cut}`);
  return { ...box, height: cut };
}

/**
 * Drop isolated specks from a master.
 *
 * The glyph master carries a stray red mark a little way off the book's lower-right
 * corner — an artefact of the original export. It is far enough out that it drags the
 * content box with it and, once the glyph is centred in a square, shows up as a red dot
 * in the favicon. MIN_RUN keeps it out of the bounding box but not out of the picture.
 *
 * Label connected components at the *shadow* threshold, so the book, the tail and their
 * shared drop shadow stay one blob, then keep only components worth more than 0.1% of the
 * total ink. Anything else has its alpha zeroed.
 */
async function despeckle(file: string): Promise<Buffer> {
  const { data, w, h } = await pixels(file);
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] <= SOFT_ALPHA) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    let area = 0;
    while (head < tail) {
      const px = queue[head++];
      area++;
      const x = px % w;
      const y = (px - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (label[n] !== -1 || data[n * 4 + 3] <= SOFT_ALPHA) continue;
          label[n] = id;
          queue[tail++] = n;
        }
      }
    }
    sizes.push(area);
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  const keep = sizes.map((area) => area / total >= 0.001);
  const dropped = sizes.filter((_, i) => !keep[i]);
  if (dropped.length) {
    console.log(`   despeckled ${dropped.length} stray component(s), ${dropped.join(", ")} px`);
  }
  for (let px = 0; px < w * h; px++) {
    const id = label[px];
    if (id !== -1 && !keep[id]) data[px * 4 + 3] = 0;
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** Content box of a master, in that master's own pixel coordinates. */
async function measure(file: string | Buffer) {
  const { data, w, h } = await pixels(file);
  return { data, w, h, content: contentBox(data, w, h) };
}

/**
 * Place the artwork on a square canvas so the INK is optically centred.
 *
 * `scale` is how much of the edge the ink occupies; the drop shadow spills into the
 * margin around it rather than counting toward the fit, which is what stops a
 * directional shadow from dragging the artwork off-centre. The second term clamps the
 * scale so that spill can never leave the canvas — at the small `scale` values there is
 * margin to spare, and at 0.92+ it gives back a pixel or two instead of clipping.
 */
function placeSquare(content: Content, edge: number, scale: number) {
  const { box, ink } = content;
  const cx = ink.left + ink.width / 2;
  const cy = ink.top + ink.height / 2;
  const halfSpan = Math.max(
    cx - box.left,
    box.left + box.width - cx,
    cy - box.top,
    box.top + box.height - cy,
  );
  const s = Math.min((edge * scale) / Math.max(ink.width, ink.height), edge / (2 * halfSpan));
  return {
    width: Math.max(1, Math.round(box.width * s)),
    height: Math.max(1, Math.round(box.height * s)),
    left: Math.round(edge / 2 - (cx - box.left) * s),
    top: Math.round(edge / 2 - (cy - box.top) * s),
  };
}

async function squareIcon(
  src: string | Buffer,
  content: Content,
  edge: number,
  { scale = 0.86, background = { r: 0, g: 0, b: 0, alpha: 0 }, flatten = false, grayscale = false } = {},
) {
  const fit = placeSquare(content, edge, scale);
  const art = await sharp(src)
    .extract(content.box)
    // fit:"fill" because width and height are already derived from one scale factor and
    // only differ from the source aspect by rounding. sharp's default is "cover", which
    // resolves that sub-pixel drift by cropping the source — worst at the smallest sizes,
    // where it shaved a sliver off the 16px favicon.
    .resize({ width: fit.width, height: fit.height, fit: "fill", kernel: "lanczos3" })
    .toBuffer();
  let canvas = sharp({
    create: { width: edge, height: edge, channels: 4, background },
  }).composite([{ input: art, top: fit.top, left: fit.left }]);
  if (grayscale) canvas = sharp(await canvas.png().toBuffer()).grayscale();
  if (flatten) canvas = sharp(await canvas.png().toBuffer()).flatten({ background: CREAM });
  return canvas.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * The themed-icon (API 33+) layer.
 *
 * Android tints whatever is opaque here and throws the colour away, so a flat alpha
 * silhouette of this glyph collapses into one unreadable black slab — book, fox tail and
 * globe all merge. Deriving the alpha from luminance instead keeps the artwork's own
 * light areas (the globe, the plane, the dashed route, the page edges) as holes, so the
 * shape still reads as a book once it is a single colour.
 *
 * The linear() pass is a contrast curve: it lifts the burgundy body to fully opaque and
 * drops the soft grey drop shadow to nothing, which would otherwise ghost in as a smear.
 */
async function monochrome(square: Buffer, edge: number): Promise<Buffer> {
  const alpha = await sharp(square)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .grayscale()
    .negate()
    .linear(1.6, -45)
    .raw()
    .toBuffer();
  return sharp({ create: { width: edge, height: edge, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .joinChannel(alpha, { raw: { width: edge, height: edge, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Pack PNG payloads into an .ico. PNG-in-ICO is understood by every browser we target. */
function packIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries: Buffer[] = [];
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const out = (dir: string, name: string, buf: Buffer) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), buf);
  console.log(`   ${join(dir, name).replace(ROOT + "/", "")}  ${(buf.length / 1024).toFixed(1)} KB`);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. The two lockups, for the web brand mark.
//    Emitted at 3x the largest rendered height (120px) so every slot downsamples.
// ─────────────────────────────────────────────────────────────────────────────
const LOCKUP_H = 384;
/** 96dp on an xxxhdpi screen is 384px; 512 leaves headroom without a density ladder. */
const LOCKUP_H_MOBILE = 512;

async function lockup(file: string, box: Box, height: number) {
  return sharp(file)
    .extract(box)
    .resize({ height, kernel: "lanczos3" })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
}

async function buildLockups() {
  console.log("lockups");
  const lightFile = join(SRC, "logo-adventures-light.png");
  const light = await measure(lightFile);
  const lightBox = cropTagline(light.data, light.w, light.content.box);
  out(ART, "lockup-light.webp", await lockup(lightFile, lightBox, LOCKUP_H));
  out(CMP, "lockup_light.webp", await lockup(lightFile, lightBox, LOCKUP_H_MOBILE));
  console.log(`   light aspect ${(lightBox.width / lightBox.height).toFixed(3)}:1`);

  // The dark lockup carries the same tagline, set across the bottom of the stack. It goes
  // for the same reason, and because a mark that gains a line of copy when you switch
  // themes is worse than one that never had it.
  const darkFile = join(SRC, "logo-tropical-dark.png");
  const dark = await measure(darkFile);
  const darkBox = cropTagline(dark.data, dark.w, dark.content.box);
  out(ART, "lockup-dark.webp", await lockup(darkFile, darkBox, LOCKUP_H));
  out(CMP, "lockup_dark.webp", await lockup(darkFile, darkBox, LOCKUP_H_MOBILE));
  console.log(`   dark aspect ${(darkBox.width / darkBox.height).toFixed(3)}:1`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Web icons. Next 16 file conventions: app/icon.png, app/apple-icon.png,
//    app/favicon.ico — Next emits the <link> tags itself.
// ─────────────────────────────────────────────────────────────────────────────
async function buildWebIcons(glyph: Buffer, content: Content) {
  console.log("web icons");
  out(APP, "icon.png", await squareIcon(glyph, content, 512, { scale: 0.92 }));

  // Apple composites transparency onto black, so this one has to carry its own ground.
  out(APP, "apple-icon.png", await squareIcon(glyph, content, 180, { scale: 0.72, flatten: true }));

  const ico = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      png: await squareIcon(glyph, content, size, { scale: 0.94 }),
    })),
  );
  out(APP, "favicon.ico", packIco(ico));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Android. Adaptive icon on a 108dp canvas; the glyph has to sit inside the 66dp
//    safe zone or the launcher's mask will clip it.
// ─────────────────────────────────────────────────────────────────────────────
const DENSITIES = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
] as const;
/** 66dp of a 108dp canvas — everything outside this can be masked away. */
const SAFE_ZONE = 66 / 108;

async function buildAndroidIcons(glyph: Buffer, content: Content) {
  console.log("android icons");
  const circle = (edge: number) =>
    Buffer.from(
      `<svg width="${edge}" height="${edge}"><circle cx="${edge / 2}" cy="${edge / 2}" r="${edge / 2}" fill="#fff"/></svg>`,
    );

  for (const [bucket, scale] of DENSITIES) {
    const dir = join(RES, `mipmap-${bucket}`);
    const canvas = Math.round(108 * scale); // adaptive layers
    const legacy = Math.round(48 * scale); // legacy launcher bitmap

    out(dir, "ic_launcher_foreground.png", await squareIcon(glyph, content, canvas, { scale: SAFE_ZONE }));

    out(
      dir,
      "ic_launcher_monochrome.png",
      await monochrome(await squareIcon(glyph, content, canvas, { scale: SAFE_ZONE }), canvas),
    );

    const square = await squareIcon(glyph, content, legacy, { scale: 0.76, flatten: true });
    out(dir, "ic_launcher.png", square);
    out(
      dir,
      "ic_launcher_round.png",
      await sharp(square)
        .ensureAlpha()
        .composite([{ input: circle(legacy), blend: "dest-in" }])
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. iOS. Xcode 15+ single-size catalog: one 1024 per appearance. The App Store
//    rejects alpha on the base icon; the dark and tinted slots want it.
// ─────────────────────────────────────────────────────────────────────────────
async function buildIosIcons(glyph: Buffer, content: Content) {
  console.log("ios icons");
  out(
    IOS,
    "app-icon-1024.png",
    await sharp(await squareIcon(glyph, content, 1024, { scale: 0.7, flatten: true }))
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );
  // iOS lays the dark variant over its own dark ground, so it ships transparent.
  out(IOS, "app-icon-1024-dark.png", await squareIcon(glyph, content, 1024, { scale: 0.7 }));
  out(
    IOS,
    "app-icon-1024-tinted.png",
    await squareIcon(glyph, content, 1024, { scale: 0.7, grayscale: true }),
  );
}

async function main() {
  await buildLockups();
  console.log("glyph");
  const glyph0 = await despeckle(join(SRC, "logo-adventures-glyph.png"));
  const glyph = await measure(glyph0);
  console.log(
    `   ink ${glyph.content.ink.width}x${glyph.content.ink.height} at (${glyph.content.ink.left},${glyph.content.ink.top})` +
      ` | +shadow ${glyph.content.box.width}x${glyph.content.box.height} of ${glyph.w}x${glyph.h}`,
  );
  await buildWebIcons(glyph0, glyph.content);
  await buildAndroidIcons(glyph0, glyph.content);
  await buildIosIcons(glyph0, glyph.content);
}

await main();
