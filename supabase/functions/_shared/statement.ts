/**
 * Reading an Inteletravel statement: the bytes, the CSV, the column guesses, and each row's
 * amounts and dates. The `commission-import` route's pure half, for the reason
 * `commission.ts` is the `agent-commission` route's: everything here is a case that would
 * otherwise reach Postgres as a cast error, or worse, land as the wrong number.
 * `statement_test.ts` pins each one.
 *
 * ── NO PARSING LIBRARY ───────────────────────────────────────────────────────────
 *
 * CSV only (Gyasi, 2026-10-11), and RFC 4180 is small enough to read by hand: a new
 * dependency on the path money takes would need a security review first (CLAUDE.md).
 *
 * ── WHAT IS STILL A GUESS ────────────────────────────────────────────────────────
 *
 * No real Inteletravel statement has been seen yet. The header hints below are common
 * names, not Inteletravel's; the mapping screen shows every guess and the advisor confirms
 * it, and the map is remembered for next month by header NAME. When a real file arrives,
 * its headers belong at the front of these lists.
 */
import { badRequest } from "./problem.ts";

/** 512 KiB: thousands of rows for one advisor, and under the web's 1 MB action body cap. */
export const MAX_FILE_BYTES = 512 * 1024;
/** Matches `commission_import_rows_range` — and PostgREST's max_rows, which the rows read relies on. */
export const MAX_ROWS = 1000;
export const MAX_COLUMNS = 60;
const MAX_CELL = 1000;
/** The ledger's own reference cap (`commission.ts`), so a matched line's edit form takes it. */
const MAX_REFERENCE = 64;
const MAX_NAME = 200;
/** $99,999,999.99, hand entry's cap (`component.ts`): a wrongly mapped column is not $90 trillion. */
export const MAX_AMOUNT_CENTS = 9_999_999_999;

/** The first `n` characters by CODE POINT: slicing UTF-16 units can cut an emoji in half,
 *  and a lone surrogate reached Postgres as a 500 (found in review). */
function clip(value: string, n: number): string {
  return Array.from(value).slice(0, n).join("");
}

export const STATEMENT_FIELDS = [
  "reference",
  "supplier",
  "traveler",
  "gross",
  "received",
  "fee",
  "paid_on",
] as const;
export type StatementField = (typeof STATEMENT_FIELDS)[number];
export type ColumnMap = Partial<Record<StatementField, number>>;

// ─────────────────────────────────────────────────────────────────────────────
// Bytes → text → rows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The file as text. UTF-8 first; anything that is not valid UTF-8 is read as Windows-1252,
 * which is what Excel on Windows writes when it saves "CSV" — so "Peña" survives either way.
 * An Excel workbook (a zip: "PK\3\4") is named for what it is, so the advisor knows to
 * save it as CSV, rather than parsed into noise.
 */
export function decodeStatement(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) {
    throw badRequest("That's an Excel file. Save it as CSV (File, Save As, CSV) and upload that.");
  }
  let text: string;
  try {
    // `fatal` makes invalid UTF-8 throw instead of turning into U+FFFD; the default
    // `ignoreBOM: false` drops a leading byte-order mark.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  if (text.includes("\u0000")) {
    throw badRequest("That file doesn't look like a CSV. Download the statement as CSV and try again.");
  }
  return text;
}

/**
 * RFC 4180: commas between cells; a cell in double quotes may hold commas, line breaks and
 * doubled quotes; rows end in CRLF, LF or CR. A quote that is not at the start of a cell is
 * kept as text, as spreadsheets do. A quoted cell that never closes is an error with its line.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quoteLine = 0;
  let line = 1;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === "\n") line++;
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") {
      inQuotes = true;
      quoteLine = line;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      line++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (inQuotes) {
    throw badRequest(`Line ${quoteLine} has a quote mark that never closes. Fix it in the file and upload again.`);
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export type StatementFile = { headers: string[]; rows: string[][] };

/**
 * The header row and the rows under it. Blank lines are dropped (Excel leaves them at the
 * end); every row is padded to one width so a cell index always means the same column; a
 * blank header gets a name the mapping screen can show.
 *
 * THE HEADER IS THE FIRST LINE WITH TWO OR MORE FILLED CELLS. A title line above it ("Commission
 * Statement") otherwise became the header and the real header a data row (found in review).
 */
export function readStatementFile(text: string): StatementFile {
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const start = all.findIndex((r) => r.filter((c) => c.trim() !== "").length >= 2);
  const lines = start < 0 ? [] : all.slice(start);
  if (lines.length < 2) {
    throw badRequest("The file needs a header row and at least one row under it.");
  }
  const [head, ...data] = lines;
  if (data.length > MAX_ROWS) {
    throw badRequest(`A statement can have up to ${MAX_ROWS.toLocaleString("en-US")} rows. This one has ${data.length.toLocaleString("en-US")}.`);
  }
  const width = Math.max(head.length, ...data.map((r) => r.length));
  if (width > MAX_COLUMNS) {
    throw badRequest(`A statement can have up to ${MAX_COLUMNS} columns. This one has ${width}.`);
  }
  for (const r of data) {
    if (r.some((c) => c.length > MAX_CELL)) {
      throw badRequest(`A cell in this file is over ${MAX_CELL.toLocaleString("en-US")} characters. Check that it's the right file.`);
    }
  }
  const headers = Array.from({ length: width }, (_, i) => {
    const h = clip((head[i] ?? "").trim(), 100);
    return h === "" ? `Column ${i + 1}` : h;
  });
  const rows = data.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { headers, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guessing the map
// ─────────────────────────────────────────────────────────────────────────────

/** "Booking Ref #" and "booking_ref" are one header. */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * EXACT names first, best first. For `received`, what ARRIVED comes before a gross
 * "commission": a statement with both a commission column and a net-paid column pays the
 * net. CONTAINS hints are kept narrow on purpose — a bare "date" would take "TravelDate" for
 * the paid-on date, and a bare "booking" would take "BookingDate" for the reference.
 */
const EXACT: Record<StatementField, string[]> = {
  reference: [
    "bookingref", "bookingreference", "bookingnumber", "bookingno", "bookingid", "booking",
    "confirmation", "confirmationnumber", "confirmationno", "confno", "reservation",
    "reservationnumber", "resno", "reference", "ref", "recordlocator", "pnr",
  ],
  supplier: ["supplier", "suppliername", "vendor", "vendorname", "provider", "cruiseline", "brand"],
  traveler: [
    "pax", "paxname", "passenger", "passengername", "traveler", "traveller", "travelername",
    "client", "clientname", "customer", "customername", "guest", "guestname", "leadpassenger",
    "name",
  ],
  gross: [
    "gross", "grossamt", "grossamount", "grosssale", "grosssales", "grossbooking",
    "bookingamount", "bookingtotal", "totalsale", "totalsales", "saleamount", "fare", "totalfare",
  ],
  received: [
    "commissionpaid", "netcommission", "advisorcommission", "agentcommission", "yourcommission",
    "payout", "amountpaid", "paidamount", "netpaid", "netamount", "net", "commissionamt",
    "commissionamount", "commission",
  ],
  fee: [
    "fee", "fees", "hostfee", "processingfee", "split", "hostsplit", "deduction",
    "inteletravelshare", "inteletravelfee", "withheld",
  ],
  paid_on: [
    "paidon", "paiddate", "datepaid", "paymentdate", "paydate", "statementdate",
    "commissiondate", "depositdate", "date",
  ],
};

const CONTAINS: Record<StatementField, string[]> = {
  reference: ["confirmation", "bookingref", "bookingnum", "reservation", "locator"],
  supplier: ["supplier", "vendor"],
  traveler: ["passenger", "traveler", "traveller", "client", "customer", "guest"],
  gross: ["gross", "fare"],
  received: ["commission", "payout"],
  fee: ["fee", "split", "withheld"],
  paid_on: ["paiddate", "paidon", "datepaid", "statementdate", "paymentdate"],
};

/** The order fields claim headers in, within each pass: the specific before the generic. */
const CLAIM_ORDER: StatementField[] = ["reference", "received", "fee", "paid_on", "gross", "supplier", "traveler"];

export type PreviousMap = { headers: string[]; columnMap: ColumnMap };

/**
 * A column map for these headers: the advisor's LAST statement first (matched by header
 * name, so a reordered file still maps), then the hints. Never maps one header twice.
 */
export function guessColumnMap(headers: string[], previous?: PreviousMap | null): ColumnMap {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const map: ColumnMap = {};

  if (previous) {
    for (const field of STATEMENT_FIELDS) {
      const idx = previous.columnMap[field];
      if (idx === undefined || idx === null) continue;
      const name = previous.headers[idx];
      if (name === undefined) continue;
      const at = norm.findIndex((h, i) => !used.has(i) && h === normalizeHeader(name));
      if (at >= 0) {
        map[field] = at;
        used.add(at);
      }
    }
  }

  // Two passes: every EXACT name first, then the looser CONTAINS hints for what is left.
  // One pass per field let "Net Paid" go to the paid-on date (it contains "paid") before
  // the commission column, which wanted it by its exact name, got a turn.
  for (const field of CLAIM_ORDER) {
    if (map[field] !== undefined) continue;
    let best = -1;
    let bestRank = Infinity;
    norm.forEach((h, i) => {
      if (used.has(i)) return;
      const rank = EXACT[field].indexOf(h);
      if (rank >= 0 && rank < bestRank) {
        best = i;
        bestRank = rank;
      }
    });
    if (best >= 0) {
      map[field] = best;
      used.add(best);
    }
  }
  for (const field of CLAIM_ORDER) {
    if (map[field] !== undefined) continue;
    const at = norm.findIndex((h, i) => !used.has(i) && CONTAINS[field].some((c) => h.includes(c)));
    if (at >= 0) {
      map[field] = at;
      used.add(at);
    }
  }
  return map;
}

/**
 * The map the advisor confirmed: known fields, whole indexes into these headers, no header
 * twice, and the one column a statement cannot do without.
 */
export function readColumnMap(value: unknown, headerCount: number): ColumnMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("Send the column map as an object.");
  }
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const [key, idx] of Object.entries(value as Record<string, unknown>)) {
    if (!STATEMENT_FIELDS.includes(key as StatementField)) {
      throw badRequest(`Unknown field in the column map: ${key}.`);
    }
    if (idx === null || idx === undefined) continue;
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= headerCount) {
      throw badRequest("A column in the map is not one of this file's columns.");
    }
    if (used.has(idx)) throw badRequest("Each column can be used for one thing only.");
    used.add(idx);
    map[key as StatementField] = idx;
  }
  if (map.received === undefined) {
    throw badRequest("Choose the column that holds the commission paid.");
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// One row's amounts and dates
// ─────────────────────────────────────────────────────────────────────────────

function quoteShort(raw: string): string {
  const t = raw.trim();
  return `"${t.length > 30 ? `${t.slice(0, 30)}…` : t}"`;
}

/**
 * Dollars as cents, exactly: "$1,234.56", "1234.5", "USD 80". Read from the digits, never
 * through a float. Commas must be thousands groups (US only, BRD §2): "12,34" is refused
 * rather than read as 1,234. A NEGATIVE amount is refused by name — one row per booking
 * (Gyasi, 2026-10-11) means a clawback is not something this import applies.
 */
export function parseAmountCents(
  raw: string,
  /** A FEE column may show its deduction as negative, "(36.00)": read it as the amount kept. */
  { deduction = false }: { deduction?: boolean } = {},
): { cents: number | null } | { error: string } {
  let s = raw.trim();
  if (s === "") return { cents: null };
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  }
  s = s.replace(/^(usd|us\$|\$)\s*/i, "").replace(/\s*usd$/i, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) {
    return { error: `${quoteShort(raw)} is not an amount.` };
  }
  s = s.replace(/,/g, "");
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) {
    return { error: `${quoteShort(raw)} is not an amount.` };
  }
  if (negative && !deduction && /[1-9]/.test(s)) {
    return {
      error: "This row takes money back (a negative amount), which this import doesn't apply. Set the row aside, then edit the line by hand.",
    };
  }
  const [whole, frac = ""] = s.split(".");
  if (whole.replace(/^0+/, "").length > 8) return { error: `${quoteShort(raw)} is too large. Check that the column is the right one.` };
  const cents = Number(whole === "" ? "0" : whole) * 100 + Number(`${frac}00`.slice(0, 2));
  if (cents > MAX_AMOUNT_CENTS) return { error: `${quoteShort(raw)} is too large. Check that the column is the right one.` };
  return { cents };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthOf(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

/**
 * A calendar date as ISO: "2026-04-15", "4/15/2026", "4/15/26", "Apr 15, 2026",
 * "15-Apr-2026", with or without a time after it. Month first, as US statements write it.
 * A date that does not exist ("2/30/2026") is refused, not rolled into March.
 */
export function parseDate(raw: string): { date: string | null } | { error: string } {
  let s = raw.trim();
  if (s === "") return { date: null };
  s = s.replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm)?(z|[+-]\d{2}:?\d{2})?$/i, "").trim();

  let y = 0;
  let m = 0;
  let d = 0;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s))) {
    m = Number(match[1]);
    d = Number(match[2]);
    y = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  } else if ((match = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s))) {
    m = monthOf(match[1]);
    d = Number(match[2]);
    y = Number(match[3]);
  } else if ((match = /^(\d{1,2})[-\s]([a-z]{3,9})[-\s](\d{2}|\d{4})$/i.exec(s))) {
    d = Number(match[1]);
    m = monthOf(match[2]);
    y = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  }

  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (y < 2000 || y > 2100 || m < 1 || Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso) {
    return { error: `${quoteShort(raw)} is not a date we can read. Use one like 4/15/2026.` };
  }
  return { date: iso };
}

/** One row, as `agent_map_commission_import` takes it. */
export type ParsedRow = {
  reference: string | null;
  supplier: string | null;
  traveler: string | null;
  gross_cents: number | null;
  received_cents: number | null;
  fee_cents: number | null;
  paid_on: string | null;
  parse_error: string | null;
};

/**
 * Every row under the confirmed map. A row that cannot be read keeps its FIRST problem as a
 * sentence the screen shows — it is still stored, so nothing in the file disappears.
 * `statementDate` stands in for the paid-on date when no column carries one, or a cell is
 * blank. Whether a date is after the advisor's TODAY is SQL's call: only SQL knows their zone.
 */
export function parseRows(rows: string[][], map: ColumnMap, statementDate: string | null): ParsedRow[] {
  return rows.map((cells) => {
    const cell = (f: StatementField): string => {
      const idx = map[f];
      return idx === undefined ? "" : (cells[idx] ?? "").trim();
    };
    const errors: string[] = [];
    const amount = (f: StatementField): number | null => {
      if (map[f] === undefined) return null;
      const r = parseAmountCents(cell(f), { deduction: f === "fee" });
      if ("error" in r) {
        errors.push(r.error);
        return null;
      }
      return r.cents;
    };

    const reference = cell("reference");
    if (Array.from(reference).length > MAX_REFERENCE) {
      errors.push(`The booking reference is longer than ${MAX_REFERENCE} characters.`);
    }

    const received = amount("received");
    const gross = amount("gross");
    const fee = amount("fee");
    if (errors.length === 0 && received === null) errors.push("No commission amount on this row.");
    if (errors.length === 0 && received === 0) errors.push("Nothing was paid on this row.");

    let paidOn: string | null = null;
    if (map.paid_on !== undefined && cell("paid_on") !== "") {
      const r = parseDate(cell("paid_on"));
      if ("error" in r) errors.push(r.error);
      else paidOn = r.date;
    } else {
      paidOn = statementDate;
    }
    if (errors.length === 0 && paidOn === null) errors.push("No paid-on date for this row.");

    return {
      reference: reference === "" ? null : reference,
      supplier: clip(cell("supplier"), MAX_NAME) || null,
      traveler: clip(cell("traveler"), MAX_NAME) || null,
      gross_cents: gross,
      received_cents: errors.length ? null : received,
      fee_cents: fee,
      paid_on: errors.length ? null : paidOn,
      parse_error: errors[0] ?? null,
    };
  });
}

/** Lowercase hex, which PostgREST takes for a `bytea` as `\x…`. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Base64 → bytes, refusing anything over the size cap BEFORE it is decoded. */
export function readFileBase64(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || value === "") throw badRequest("Choose a CSV file to upload.");
  if (value.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4) {
    throw badRequest("That file is larger than 512 KB. Check that it's the statement.");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw badRequest("That file didn't come through. Try uploading it again.");
  }
  if (binary.length > MAX_FILE_BYTES) {
    throw badRequest("That file is larger than 512 KB. Check that it's the statement.");
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The name the advisor will recognise in the list. Path parts are dropped. */
export function readFilename(value: unknown): string {
  if (typeof value !== "string") throw badRequest("The file needs a name.");
  const base = value.split(/[\\/]/).pop()?.trim() ?? "";
  if (base === "" || base.includes("\u0000") || !base.isWellFormed()) {
    throw badRequest("The file needs a name.");
  }
  return base.slice(0, 255);
}
