/**
 * Generate the cruise fleet migration from `data/cruise_ships.csv` plus Wikimedia imagery.
 *
 * WHY THIS IS A GENERATOR AND NOT A HAND-WRITTEN MIGRATION: 153 ships each need a photo URL,
 * an author, a licence and a source page, and none of those four are in the CSV. Typing them
 * out once would be a day of copy-paste with no way to check it; typing them out twice — when
 * a ship joins a fleet — is how the list rots. The migration is the committed artefact, this
 * is how it was produced, and the CSV beside it is the input of record.
 *
 * WHY THE CSV'S OWN IMAGE COLUMN IS NOT USED: every one of its 153 values is a Google Images
 * *search* link (`google.com/search?tbm=isch&q=…`), not a picture. Storing one would give
 * every ship a broken <img> — the same "a row pointing at bytes that are not there is worse
 * than nothing" failure that seed-storage-objects.sh was written to prevent. So the column is
 * dropped on the way in and the photos are sourced fresh here.
 *
 * NOT WIRED INTO CI. It talks to two public APIs, and CI has no business doing that on every
 * push. Re-run it by hand when the fleet changes, commit the migration it writes.
 *
 *   node supabase/scripts/build-cruise-fleet.mts            # writes the migration
 *   node supabase/scripts/build-cruise-fleet.mts --dry-run  # report only, writes nothing
 *
 * ── The three decisions that make this correct rather than merely finished ──────────────
 *
 * 1. SHIPS ARE RESOLVED THROUGH WIKIPEDIA TITLES, NOT WIKIDATA LABELS. The obvious approach —
 *    SPARQL `?item rdfs:label "Koningsdam"@en` — is wrong in a way that looks like it works:
 *    it returned two STREETS in the Netherlands and no ship, and it found nothing at all for
 *    Icon of the Seas, Wonder of the Seas or Celebrity Flora, whose articles are titled
 *    exactly that. Wikipedia's title index follows redirects (Koningsdam → MS Koningsdam,
 *    Regal Princess → Regal Princess (ship)) and hands back the Wikidata id, which is what
 *    turns a 130/153 hit rate into a real one.
 *
 * 2. EVERY PHOTO IS CROSS-CHECKED AGAINST THE LINE. Matching a ship by name alone is how the
 *    wrong hull gets the right name's photo, and it fails silently — a plausible cruise ship
 *    appears on the card and nothing anywhere errors. See `verdict()`: a candidate whose
 *    Wikidata operator names a DIFFERENT line is always rejected, and the report says so.
 *
 * 3. LICENCES ARE ALLOW-LISTED BY NAME, AND THE UNKNOWN IS REFUSED. Commons is overwhelmingly
 *    free but not exclusively, and an unfree photo on a commercial travel page is a real
 *    problem. Note the trap: `extmetadata.License` — the machine-readable id — is simply
 *    ABSENT on a good fraction of files (measured: BSD and FAL both come back with License
 *    undefined and only LicenseShortName set), so keying on it silently discards free images.
 *    `LicenseShortName` is always present, so that is what is matched.
 *
 * Misses are expected and fine. They land with NULL imagery and are named in the report.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV = resolve(HERE, "data/cruise_ships.csv");
const OUT = resolve(HERE, "../migrations/20260930120001_cruise_fleet_catalog.sql");

/**
 * Wikimedia's user-agent policy rejects generic clients, and a 403 from it reads exactly like
 * a network failure. Naming the project and a contact is the price of using the endpoints.
 */
const UA = "StoryTailAdventures-FleetSeed/1.0 (https://storytailadventures.com; gyasi.story@cru.org)";

const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";

// ─────────────────────────────────────────────────────────────────────────────
// The editorial layer.
//
// `slug`, `is_booked` and `display_order` are ours — Data-Model §24.0 rule 3 — and the values
// below are COPIED FROM supabase/functions/_shared/cruise/map.ts:43-80. That duplication is
// deliberate and load-bearing: `mapCruiseLine` writes both columns from its own constants, so
// if these two lists ever disagree, the first successful sync silently rewrites the catalog's
// ordering and its "lines we book" row. supabase/tests/constraints_cruise_fleet.sql pins the
// agreement. Move them together.
//
// `cunard` is the one slug the mapper cannot produce — it is absent from COMPANY_SLUG, so
// track.cruises has no coverage and nothing will ever overwrite it. Same standing as
// `virgin-voyages`, which 20260909001124:742-748 already inserted for exactly that reason.
// ─────────────────────────────────────────────────────────────────────────────
interface Line {
  slug: string;
  name: string;
  isBooked: boolean;
  displayOrder: number;
  /** Lowercased fragment a Wikidata operator or owner label must contain to confirm a hull. */
  operatorKey: string;
  /** Pre-existing row id, when the line is already in the database. */
  existingId?: string;
}

const LINES: Readonly<Record<string, Line>> = {
  "Royal Caribbean": {
    slug: "royal-caribbean", name: "Royal Caribbean",
    isBooked: true, displayOrder: 10, operatorKey: "royal caribbean",
  },
  "Celebrity Cruises": {
    slug: "celebrity", name: "Celebrity",
    isBooked: true, displayOrder: 20, operatorKey: "celebrity",
  },
  "Disney Cruise Line": {
    slug: "disney", name: "Disney",
    isBooked: true, displayOrder: 30, operatorKey: "disney",
  },
  "Princess Cruises": {
    slug: "princess", name: "Princess",
    isBooked: true, displayOrder: 40, operatorKey: "princess",
  },
  "Carnival Cruise Line": {
    slug: "carnival", name: "Carnival",
    isBooked: true, displayOrder: 50, operatorKey: "carnival",
  },
  "Virgin Voyages": {
    slug: "virgin-voyages", name: "Virgin Voyages",
    isBooked: true, displayOrder: 60, operatorKey: "virgin",
    // Already in the database — 20260909001124:748. Its ships attach to this id and the line
    // row itself is not re-inserted.
    existingId: "01a08376-dc00-7000-8000-000000000100",
  },
  "Norwegian (NCL)": {
    slug: "norwegian", name: "Norwegian",
    isBooked: true, displayOrder: 70, operatorKey: "norwegian",
  },
  "Holland America Line": {
    slug: "holland-america", name: "Holland America",
    isBooked: true, displayOrder: 80, operatorKey: "holland america",
  },
  // UNBOOKED_ORDER_BASE in map.ts:80. `msc` must be exactly 900, because the mapper produces
  // that value and would otherwise rewrite it.
  "MSC Cruises": {
    slug: "msc", name: "MSC Cruises",
    isBooked: false, displayOrder: 900, operatorKey: "msc",
  },
  // 910 rather than 900 only because nothing can ever overwrite it — see the note above.
  "Cunard Line": {
    slug: "cunard", name: "Cunard",
    isBooked: false, displayOrder: 910, operatorKey: "cunard",
  },
};

/**
 * UUIDv7-shaped, hand-authored, deterministic — the convention 20260909001124:643-648 set and
 * seed.sql:7-9 explains (Postgres 17 has no uuidv7(); that arrives in 18).
 *
 * The cruise catalog's prefix is reused rather than restamped with today's date: a v7
 * timestamp on a reference row is decoration, and keeping one prefix makes the whole domain
 * greppable. Taken already: …0000-30 (sync scopes), …0100 (Virgin Voyages), …02xx (seed.sql).
 * This takes …3001-3009 for lines and …4001-4153 for ships.
 */
const PREFIX = "01a08376-dc00-7000-8000-";
const lineId = (n: number) => `${PREFIX}${String(3000 + n).padStart(12, "0")}`;
const shipId = (n: number) => `${PREFIX}${String(4000 + n).padStart(12, "0")}`;

/** Byte-for-byte the rule in map.ts:86-93, so a ship slug here matches one the sync would mint. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const sqlText = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();

async function api(base: string, params: Record<string, string>) {
  const res = await fetch(`${base}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`,
    { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${base} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function* batched<T>(items: T[], size: number) {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
    if (i + size < items.length) await new Promise((r) => setTimeout(r, 300));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wikipedia: title -> Wikidata id + lead image
// ─────────────────────────────────────────────────────────────────────────────

interface Page { qid: string | null; pageImage: string | null }

/**
 * Four candidate titles per ship, because English Wikipedia disambiguates hulls inconsistently:
 * "Icon of the Seas" is bare, "Regal Princess (ship)" is qualified (the bare title is a
 * different, scrapped hull), "MS Koningsdam" and "MV Britannia" carry a prefix. Querying all
 * four costs 13 batched calls in total and removes an entire class of miss.
 */
function candidateTitles(name: string): string[] {
  return [name, `${name} (ship)`, `MS ${name}`, `MV ${name}`];
}

async function resolvePages(titles: string[]): Promise<Map<string, Page>> {
  const out = new Map<string, Page>();
  for await (const batch of batched(titles, 50)) {
    const j = await api(WIKIPEDIA, {
      action: "query", redirects: "1", titles: batch.join("|"),
      prop: "pageprops|pageimages", ppprop: "wikibase_item", piprop: "name",
    }) as {
      query?: {
        redirects?: { from: string; to: string }[];
        normalized?: { from: string; to: string }[];
        pages?: { title: string; missing?: boolean; pageimage?: string;
                  pageprops?: { wikibase_item?: string } }[];
      };
    };

    // The API answers under the FINAL title, so the normalize/redirect chains have to be
    // walked backwards or every redirected ship reads as missing.
    const byFinal = new Map<string, Page>();
    for (const p of j.query?.pages ?? []) {
      if (p.missing) continue;
      byFinal.set(p.title, { qid: p.pageprops?.wikibase_item ?? null, pageImage: p.pageimage ?? null });
    }
    const hop = new Map<string, string>();
    for (const r of [...(j.query?.normalized ?? []), ...(j.query?.redirects ?? [])]) hop.set(r.from, r.to);
    const follow = (t: string) => { let c = t; for (let i = 0; i < 4 && hop.has(c); i++) c = hop.get(c)!; return c; };

    for (const asked of batch) {
      const page = byFinal.get(follow(asked));
      if (page) out.set(asked, page);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wikidata: operator, owner, type and the preferred image, for resolved ids only
// ─────────────────────────────────────────────────────────────────────────────

interface Entity {
  /** The item's label TODAY, which is not the name we looked it up by once a hull is renamed. */
  label: string | null;
  types: string[];
  operators: string[];
  image: string | null;
  /** Service entry (P729) or inception (P571), as an ISO date. The recency tiebreak. */
  entered: string | null;
}

const ENTITY_FIELDS = `
      OPTIONAL { ?item rdfs:label ?itemLabelEn FILTER(LANG(?itemLabelEn) = "en") }
      OPTIONAL { ?item wdt:P31 ?type }
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item wdt:P137 ?operator }
      OPTIONAL { ?item wdt:P127 ?owner }
      OPTIONAL { ?item wdt:P729 ?entered }
      OPTIONAL { ?item wdt:P571 ?inception }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`;

async function sparql(query: string) {
  const res = await fetch(SPARQL, {
    method: "POST",
    headers: {
      "User-Agent": UA, "Accept": "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } };
}

function absorb(out: Map<string, Entity>, b: Record<string, { value: string }>): string {
  const qid = b.item.value.split("/").pop()!;
  const e = out.get(qid) ?? { label: null, types: [], operators: [], image: null, entered: null };
  if (b.itemLabelEn?.value) e.label = b.itemLabelEn.value;
  if (b.typeLabel?.value && !e.types.includes(b.typeLabel.value)) e.types.push(b.typeLabel.value);
  for (const k of ["operatorLabel", "ownerLabel"]) {
    const v = b[k]?.value;
    if (v && !e.operators.includes(v)) e.operators.push(v);
  }
  if (b.image?.value) e.image = decodeURIComponent(b.image.value.split("/").pop()!);
  const when = b.entered?.value ?? b.inception?.value;
  if (when && (!e.entered || when > e.entered)) e.entered = when;
  out.set(qid, e);
  return qid;
}

/**
 * A `VALUES ?item { wd:Q… }` lookup, which is an indexed id join rather than the label scan
 * that failed on "Koningsdam". One request for every id we hold.
 */
async function fetchEntities(qids: string[]): Promise<Map<string, Entity>> {
  const out = new Map<string, Entity>();
  const j = await sparql(`
    SELECT ?item ?itemLabelEn ?typeLabel ?image ?operatorLabel ?ownerLabel ?entered ?inception WHERE {
      VALUES ?item { ${qids.map((q) => `wd:${q}`).join(" ")} }
      ${ENTITY_FIELDS}
    }`);
  for (const b of j.results.bindings) absorb(out, b);
  return out;
}

/**
 * Fallback for ships whose Wikipedia title is a disambiguation or set-index page — seven of
 * them, all named for a hull that has carried the name twice. Here a label scan IS safe,
 * because it is fenced by `wdt:P18` and by the ship-type filter, and because everything it
 * returns still has to survive `verdict()` and the recency tiebreak below.
 */
async function fetchByLabel(names: string[], into: Map<string, Entity>): Promise<Map<string, string[]>> {
  const byName = new Map<string, string[]>();
  const j = await sparql(`
    SELECT ?name ?item ?itemLabelEn ?typeLabel ?image ?operatorLabel ?ownerLabel ?entered ?inception WHERE {
      VALUES ?name { ${names.map((n) => `"${n.replace(/"/g, '\\"')}"@en`).join(" ")} }
      ?item rdfs:label|skos:altLabel ?name .
      ?item wdt:P31/wdt:P279* wd:Q11446 .
      ?item wdt:P18 ?image .
      ${ENTITY_FIELDS}
    }`);
  for (const b of j.results.bindings) {
    const qid = absorb(into, b);
    const list = byName.get(b.name.value) ?? [];
    if (!list.includes(qid)) list.push(qid);
    byName.set(b.name.value, list);
  }
  return byName;
}

const SHIPISH = /ship|liner|vessel|boat|ferry/i;

/**
 * A ship CLASS is not a ship, and it slips past SHIPISH because "ship class" contains "ship".
 * This is not hypothetical: English Wikipedia redirects "MSC World America" to the article
 * "World-class cruise ship", whose Wikidata item is typed `ship class` and whose photo is of
 * MSC World EUROPA — a different hull of the same class. Accepting it would put the wrong
 * ship's photo on the card, which is the one failure this whole resolver exists to avoid.
 */
const NOT_A_HULL = /\bclass\b|disambiguation|set index|\blist\b/i;

/**
 * Wikidata gives an un-named stub the item's IMO number as its label. That is an ABSENT name,
 * not a new one, and the difference decides whether the label test below means anything —
 * Brilliant Lady is a real Virgin hull whose item reads "IMO 9870654".
 */
const PLACEHOLDER_LABEL = /^(IMO\s*\d+|Q\d+)$/i;

/**
 * Brands under one corporate roof, because Wikidata files hulls under the parent or under a
 * sibling often enough to matter: Crown Princess is filed under "Carnival Cruise Line", and
 * Carnival Luminosa still under "Costa Cruises" four years after its transfer. Both are the
 * right hull. An operator from a DIFFERENT house — Peace Boat, Ambassador, Azamara — is a
 * different hull, and that is the distinction this table exists to draw.
 */
const FAMILIES: readonly string[][] = [
  ["carnival", "princess", "holland america", "cunard", "costa", "aida", "p&o", "seabourn"],
  ["royal caribbean", "celebrity", "silversea", "tui cruises"],
  ["norwegian", "ncl", "oceania", "regent"],
  ["msc"],
  ["disney"],
  ["virgin"],
];

function sameFamily(operator: string, key: string): boolean {
  const o = norm(operator);
  return FAMILIES.some((f) => f.includes(key) && f.some((brand) => o.includes(brand)));
}

type Verdict = { ok: true; why: string } | { ok: false; why: string };

/**
 * Is this Wikidata item really THIS line's hull?
 *
 * The last two rules are the ones that took work, and they exist because of a specific near
 * miss. "Island Princess" returns two ships: the 2003 Princess hull, and a 1972 hull that
 * carried the name until 1999 and has been called DISCOVERY ever since. The old one lists no
 * operator at all, so any rule that treats silence as consent puts a photo of the wrong ship
 * on the card — and nothing anywhere reports a problem, because a cruise ship is exactly what
 * you see. "Regal Princess" has the same shape (the 1991 hull is now AMBIENCE), as does
 * "Royal Princess" (the 2001 hull is now AZAMARA PURSUIT).
 *
 * What separates them is not the operator and not the date. It is that Wikidata's label for
 * the old hull is its CURRENT name, and that name is no longer the one we asked for. So an
 * item with nothing on record is taken only while it still answers to the name — which is
 * also what lets Valiant Lady and Resilient Lady through, two genuinely unstated Virgin hulls.
 */
function verdict(e: Entity, line: Line, shipName: string, viaTitle: boolean): Verdict {
  if (e.types.some((t) => NOT_A_HULL.test(t))) {
    return { ok: false, why: `not a hull (${e.types.find((t) => NOT_A_HULL.test(t))})` };
  }
  if (e.types.length && !e.types.some((t) => SHIPISH.test(t))) {
    return { ok: false, why: `not a ship (${e.types.slice(0, 2).join(", ")})` };
  }
  if (e.operators.some((o) => norm(o).includes(line.operatorKey))) return { ok: true, why: "operator" };
  if (e.operators.some((o) => sameFamily(o, line.operatorKey))) return { ok: true, why: "operator, same group" };

  // An operator is on record and it belongs to another house. This refusal outranks the ship's
  // own name: "Sun Princess" is a real Princess name, and the only hull Wikidata holds under
  // it is the 1995 ship now sailing for Peace Boat.
  if (e.operators.length) {
    return { ok: false, why: `operator mismatch (wanted "${line.operatorKey}", saw ${e.operators.join(", ")})` };
  }
  if (e.label && norm(e.label) === norm(shipName)) {
    return { ok: true, why: "no operator on record, still carries the name" };
  }
  // Nothing on record at all. Safe only when Wikipedia's own editors already decided which
  // hull this article title means; a candidate dredged up by the label scan has had no such
  // review, and that is precisely where the renamed 1972 Island Princess comes from.
  if (viaTitle && (!e.label || PLACEHOLDER_LABEL.test(e.label))) {
    return { ok: true, why: "unnamed stub reached through its own article" };
  }
  return { ok: false, why: `no operator on record, and the hull is now named ${e.label ?? "something else"}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commons
// ─────────────────────────────────────────────────────────────────────────────

interface Media { url: string; sourceUrl: string; credit: string; licence: string }

/**
 * Percent-escapes that are legal unencoded in a URL path AND whose hex digits are numeric.
 *
 * WHY THIS EXISTS, because it is not obvious and it WILL come back otherwise: Commons
 * filenames routinely end in a parenthesised Flickr id, and `%28` immediately followed by
 * eleven digits reads as a thirteen-digit run. `.github/scripts/scan_pan.py` then Luhn-checks
 * it, and one of the 151 hulls duly came up Luhn-valid (MSC Preziosa). CI fails the PCI guard
 * on a photograph of a cruise ship. Do not paste the offending string into a comment to
 * explain it, either — the scanner reads comments too, and that is how this note got written
 * twice.
 *
 * Suppressing the scanner would be the wrong fix; it is guarding CLAUDE.md rule 1 and it is
 * right to be blunt. Decoding is the correct one, because the escape was never needed:
 * parentheses are sub-delims, legal in a path, and Wikimedia serves both forms identically
 * (verified, both 200 image/jpeg). It also makes image_url read the same way as
 * image_source_url, which was never encoded.
 *
 * Space stays encoded — it is not legal bare — and everything whose hex contains a letter
 * (%2C, %3B) already breaks a digit run on its own.
 */
const SAFE_IN_PATH: Readonly<Record<string, string>> = {
  "%21": "!", "%24": "$", "%26": "&", "%27": "'", "%28": "(", "%29": ")",
};

const unescapeSafe = (url: string) =>
  url.replace(/%2[146789]/gi, (m) => SAFE_IN_PATH[m.toUpperCase()] ?? m);

/**
 * Free-licence short names, matched as prefixes against `LicenseShortName`.
 *
 * Deliberately an ALLOW-list with the unknown refused and reported, rather than a deny-list:
 * a licence nobody anticipated should hold up one photo and show up in the run report, not
 * quietly ship. `-nc` and `-nd` are then excluded even when the prefix matched, because
 * non-commercial fails on a travel business's pages and no-derivatives is at best arguable
 * once a CDN resizes the file.
 */
const FREE_LICENCE_PREFIXES = [
  "cc0", "cc by", "cc-by", "cc sa", "cc-sa", "public domain", "pd", "pdm",
  "fal", "gfdl", "bsd", "mit", "apache", "attribution", "no restrictions",
];
const UNFREE_TOKENS = /(^|[\s-])(nc|nd|noncommercial|non-commercial|noderiv|fair use)([\s-]|$)/i;

function licenceIsFree(shortName: string | null): boolean {
  if (!shortName) return false;
  const n = norm(shortName);
  if (UNFREE_TOKENS.test(n)) return false;
  return FREE_LICENCE_PREFIXES.some((p) => n.startsWith(p));
}

/** `extmetadata.Artist` is HTML — `<a href="…">Jane Doe</a>`. Unstripped it renders as markup. */
function plain(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, " ").trim();
  return text.length ? text.slice(0, 180) : null;
}

async function fetchMedia(files: string[]): Promise<{ media: Map<string, Media>; refused: Map<string, string> }> {
  const media = new Map<string, Media>();
  const refused = new Map<string, string>();

  for await (const batch of batched(files, 50)) {
    const j = await api(COMMONS, {
      action: "query", prop: "imageinfo", iiprop: "url|extmetadata",
      titles: batch.map((f) => `File:${f}`).join("|"),
    }) as {
      query?: { pages?: { title: string; imageinfo?: {
        url: string; descriptionurl: string;
        extmetadata?: Record<string, { value: string }>;
      }[] }[] };
    };

    for (const page of j.query?.pages ?? []) {
      const key = page.title.replace(/^File:/, "");
      const info = page.imageinfo?.[0];
      if (!info) { refused.set(key, "no imageinfo"); continue; }

      const meta = info.extmetadata ?? {};
      const licence = plain(meta.LicenseShortName?.value);
      if (!licenceIsFree(licence)) { refused.set(key, `licence "${licence ?? "unknown"}"`); continue; }

      // The CHECK pairs credit with url, so this can never come back empty: with no named
      // author the licence plus the source is still a complete attribution.
      const artist = plain(meta.Artist?.value);
      media.set(key, {
        // The imageinfo API bolts `?utm_source=…&utm_campaign=imageinfo` onto every url it
        // returns. Storing that would put our own analytics tags in a visitor's image request
        // for no reason, and it makes the CHECK's job harder to read. The bare path is the
        // canonical file.
        url: unescapeSafe(info.url.split("?")[0]),
        sourceUrl: info.descriptionurl,
        credit: artist ? `${artist} / Wikimedia Commons, ${licence}` : `Wikimedia Commons, ${licence}`,
        licence: licence!,
      });
    }
  }
  return { media, refused };
}

// ─────────────────────────────────────────────────────────────────────────────

interface Ship {
  n: number; line: Line; name: string; slug: string;
  media: Media | null; note: string;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const rows = readFileSync(CSV, "utf8").trim().split("\n").slice(1)
    .map((l) => l.split(","))
    .map(([lineLabel, name]) => ({ lineLabel: lineLabel.trim(), name: name.trim() }));
  for (const r of rows) {
    if (!LINES[r.lineLabel]) throw new Error(`No mapping for cruise line "${r.lineLabel}"`);
  }
  console.log(`${rows.length} ships across ${new Set(rows.map((r) => r.lineLabel)).size} lines.`);

  console.log("Resolving Wikipedia titles…");
  const pages = await resolvePages(rows.flatMap((r) => candidateTitles(r.name)));

  const entities = new Map<string, Entity>();
  const qids = [...new Set([...pages.values()].map((p) => p.qid).filter((q): q is string => !!q))];
  console.log(`Fetching ${qids.length} Wikidata entities…`);
  for (const chunk of chunks(qids, 200)) (await fetchEntities(chunk)).forEach((v, k) => entities.set(k, v));

  /** Every Wikidata id that could plausibly be this ship, from either route. */
  const candidatesFor = new Map<string, string[]>();
  const viaTitle = new Set(qids);
  for (const r of rows) {
    const found: string[] = [];
    for (const title of candidateTitles(r.name)) {
      const qid = pages.get(title)?.qid;
      if (qid && !found.includes(qid)) found.push(qid);
    }
    candidatesFor.set(r.name, found);
  }

  // Ships whose every Wikipedia candidate is a disambiguation or set-index page reach the
  // label fallback. Seven did on the run this was written against.
  const needFallback = rows
    .filter((r) => (candidatesFor.get(r.name) ?? []).every((q) => {
      const e = entities.get(q);
      return !e || (e.types.length > 0 && !e.types.some((t) => SHIPISH.test(t)));
    }))
    .map((r) => r.name);

  if (needFallback.length) {
    console.log(`Label fallback for ${needFallback.length}: ${needFallback.join(", ")}`);
    const byName = await fetchByLabel(needFallback, entities);
    for (const [name, found] of byName) {
      const list = candidatesFor.get(name) ?? [];
      for (const q of found) if (!list.includes(q)) list.push(q);
      candidatesFor.set(name, list);
    }
  }

  const ships: Ship[] = [];
  const fileByShip = new Map<string, string>();
  for (const [i, r] of rows.entries()) {
    const line = LINES[r.lineLabel];
    const all = candidatesFor.get(r.name) ?? [];

    const accepted: { qid: string; e: Entity; why: string }[] = [];
    let note = all.length ? "no candidate survived the operator check" : "no Wikipedia article";
    for (const qid of all) {
      const e = entities.get(qid) ?? { label: null, types: [], operators: [], image: null, entered: null };
      const v = verdict(e, line, r.name, viaTitle.has(qid));
      if (v.ok) accepted.push({ qid, e, why: v.why });
      else note = v.why;
    }

    // THE RECENCY TIEBREAK. Where a name has been carried twice, the hull sailing today is
    // the later one — "Royal Princess" is the 2013 ship, not the 2001 one now named Adonia,
    // and both list Princess Cruises as operator so nothing else separates them.
    accepted.sort((a, b) => (b.e.entered ?? "").localeCompare(a.e.entered ?? ""));

    for (const { qid, e, why } of accepted) {
      const picked = e.image ?? [...pages.values()].find((p) => p.qid === qid)?.pageImage;
      if (!picked) { note = "no image on the item or its article"; continue; }
      fileByShip.set(r.name, picked.replace(/_/g, " "));
      note = accepted.length > 1 ? `${why}, newest of ${accepted.length}` : why;
      break;
    }
    ships.push({ n: i + 1, line, name: r.name, slug: slugify(r.name), media: null, note });
  }

  const files = [...new Set(fileByShip.values())];
  console.log(`Resolving ${files.length} Commons files…`);
  const { media, refused } = await fetchMedia(files);

  for (const s of ships) {
    const file = fileByShip.get(s.name);
    if (!file) continue;
    const m = media.get(file);
    if (m) s.media = m;
    else s.note = `Commons refused: ${refused.get(file) ?? "not returned"} (${file})`;
  }

  // ── report ────────────────────────────────────────────────────────────────
  const withPhoto = ships.filter((s) => s.media);
  console.log(`\n${withPhoto.length}/${ships.length} ships have a freely licensed photo.`);
  const byReason = new Map<string, number>();
  for (const s of withPhoto) byReason.set(s.note, (byReason.get(s.note) ?? 0) + 1);
  for (const [why, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)} matched on ${why}`);

  const misses = ships.filter((s) => !s.media);
  if (misses.length) {
    console.log(`\nNo photo (${misses.length}):`);
    for (const s of misses) console.log(`  ${s.line.name.padEnd(16)} ${s.name.padEnd(28)} ${s.note}`);
  }
  const licences = new Map<string, number>();
  for (const s of withPhoto) licences.set(s.media!.licence, (licences.get(s.media!.licence) ?? 0) + 1);
  console.log(`\nLicences: ${[...licences].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ×${n}`).join(", ")}`);

  if (dryRun) { console.log("\n--dry-run: nothing written."); return; }
  writeFileSync(OUT, renderSql(ships), "utf8");
  console.log(`\nWrote ${OUT}`);
}

function renderSql(ships: Ship[]): string {
  const used = new Set(ships.map((s) => s.line.slug));
  // Declaration order, not CSV order, so the ids in the emitted file ascend as you read it.
  const ordered = Object.values(LINES).filter((l) => used.has(l.slug));
  const idBySlug = new Map<string, string>();
  let n = 0;
  for (const line of ordered) idBySlug.set(line.slug, line.existingId ?? lineId(++n));

  const newLines = ordered
    .filter((l) => !l.existingId)
    .map((l) => `    (${sqlText(idBySlug.get(l.slug)!)}, ${sqlText(l.slug)}, ${sqlText(l.name)}, ` +
      `${l.displayOrder}, ${l.isBooked})`)
    .join(",\n");

  const shipRows = ships.map((s) => {
    const m = s.media;
    return `    (${sqlText(shipId(s.n))}, ${sqlText(idBySlug.get(s.line.slug)!)}, ` +
      `${sqlText(s.name)}, ${sqlText(s.slug)},\n     ` +
      `${sqlText(m?.url ?? null)}, ${sqlText(m?.credit ?? null)}, ` +
      `${sqlText(m?.licence ?? null)}, ${sqlText(m?.sourceUrl ?? null)})`;
  }).join(",\n");

  const withPhoto = ships.filter((s) => s.media).length;
  const perLine = ordered.map(({ slug }) => `--   ${slug.padEnd(16)} ${String(ships.filter((s) => s.line.slug === slug).length).padStart(3)}`)
    .join("\n");

  return `-- The cruise fleet: ten lines and ${ships.length} ships, curated.
--
-- GENERATED by supabase/scripts/build-cruise-fleet.mts from
-- supabase/scripts/data/cruise_ships.csv. Re-run that, do not hand-edit this.
--
-- WHY THIS EXISTS. cruise_ship cannot be filled by the sync. Free-Travel-APIs §4.8 measured
-- /ships and /ports as unaffordable on a 100-request/month budget — one /filter-options call
-- returned 4,566 ports, and paging the same catalogue at 10 rows a request would cost four
-- and a half months of quota — so both scopes ship disabled, and ships otherwise appear only
-- as stub rows minted when a synced sailing happens to name one. No amount of syncing closes
-- that gap. A curated fleet does.
--
-- WHY IT DOES NOT RACE THE SYNC, which 20260909001124:745 warned it would. That comment
-- predates a reading of the upsert paths, and the paths settle it:
--   * cruise_line upserts on \`slug\`                     (sync.ts:589, 639)
--   * cruise_ship upserts on \`(cruise_line_id, name)\`    (sync.ts:703, 758, 1324)
--   * withExistingIds() swaps a freshly minted id for the stored one before writing
--     (sync.ts:1192-1240), so a curated row is MERGED INTO, never duplicated and never 23505.
--   * resolveShipId() looks a ship up by that same natural key BEFORE minting a stub
--     (sync.ts:1294-1330), so a synced sailing attaches to the real hull instead of a stub.
-- The curated rows carry a null provenance pair, which also puts them outside archiveMissing()
-- — it filters \`.eq("provider", PROVIDER)\`, and "a curated row is nobody's to archive"
-- (sync.ts:1245-1247).
--
-- Ships per line:
${perLine}
--
-- ${withPhoto} of ${ships.length} carry a photo, every one freely licensed and credited. The rest
-- are NULL rather than wrong — a hull whose only Wikidata match is a renamed predecessor, a
-- ship class, or another line's vessel is refused rather than guessed at. Re-running the
-- generator picks them up as Commons catches up.

-- Nine lines. virgin-voyages is NOT here: 20260909001124:748 already inserted it, for the
-- reason this whole file generalises — track.cruises has no coverage for it, so it can only
-- ever be curated. Its four ships below attach to that existing id.
INSERT INTO public.cruise_line (id, slug, name, display_order, is_booked)
VALUES
${newLines}
ON CONFLICT (slug) DO NOTHING;

-- ON CONFLICT (cruise_line_id, name): the ship table's natural key, and the same target the
-- sync uses, so replaying this over a hull the sync already minted is safe rather than a 23503.
--
-- DO UPDATE rather than DO NOTHING, and the WHERE is the whole point. A stub minted by
-- resolveShipId() (sync.ts:1294-1330) is a bare row — name, line, provenance, nothing else —
-- and if one landed before this migration, DO NOTHING would leave that ship permanently
-- without a photo while we are holding one. So the imagery is filled in, and ONLY the imagery:
-- the stub keeps its id, its name, its slug and its provenance, and a row that already has a
-- photo is never overwritten. That is §24.0 rule 3's "curated content as a layer" in the one
-- direction it has to work — curated content filling a gap, never clobbering a decision.
INSERT INTO public.cruise_ship
    (id, cruise_line_id, name, slug, image_url, image_credit, image_license, image_source_url)
VALUES
${shipRows}
ON CONFLICT (cruise_line_id, name) DO UPDATE
    SET image_url        = excluded.image_url,
        image_credit     = excluded.image_credit,
        image_license    = excluded.image_license,
        image_source_url = excluded.image_source_url
    WHERE cruise_ship.image_url IS NULL AND excluded.image_url IS NOT NULL;

-- This assertion bites, unlike one written over rows that seed.sql supplies later: the counts
-- below are of rows this same migration just wrote, in the same transaction.
DO $$
DECLARE
    lines_found integer;
    ships_found integer;
BEGIN
    SELECT count(*) INTO lines_found FROM public.cruise_line;
    SELECT count(*) INTO ships_found FROM public.cruise_ship;

    IF lines_found <> 10 THEN
        RAISE EXCEPTION 'expected 10 cruise lines after the fleet insert, found %', lines_found;
    END IF;
    IF ships_found <> ${ships.length} THEN
        RAISE EXCEPTION 'expected ${ships.length} cruise ships after the fleet insert, found %', ships_found;
    END IF;
END $$;
`;
}

await main();
