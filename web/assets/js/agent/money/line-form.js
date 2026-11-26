// §3.7.3 / §3.7.4's two forms, enhanced. Everything here is a PREVIEW of what the server is
// about to work out; nothing it writes is trusted, and every screen below works with this
// module absent — the figures are then the saved ones, and the save corrects them.
//
// Three jobs, each one the React components did:
//   Expected     gross × rate, beside the two fields it multiplies (never a field itself).
//   The gap      expected − fee − received, as it is typed, and a Disputed suggestion while
//                the advisor has not picked a status themselves.
//   The prefill  on ADD only: the supplier's usual rate and terms, then this trip's bookings
//                with that supplier. Never over a field somebody has typed in.
//
// The arithmetic is the TypeScript's, in cents: dollarsToCents and parseRate below are
// payments.ts and commissionForm.ts, and a figure is shown only when BOTH parse.

const DOLLARS = /^\d+(\.\d{1,2})?$/;
const RATE = /^\d{1,3}(\.\d{1,2})?$/;

function dollarsToCents(input) {
  const cleaned = String(input).replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  if (!DOLLARS.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

function parseRate(input) {
  const cleaned = String(input).replace(/[%\s]/g, "");
  if (!RATE.test(cleaned)) return null;
  const n = Number(cleaned);
  return n >= 0 && n <= 100 ? n : null;
}

// money is formatTripMoney: en-US currency, and CENTS ONLY WHERE THERE ARE ANY, which is
// what lib/public/money.ts does and what the server already wrote into this page. Two places
// always would make the figure change shape the moment a key is pressed. The platform quotes
// in USD (docs/BRD.md), and formatTripMoney formats anything else as USD anyway.
function money(cents) {
  const digits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
}

const $ = (id) => document.getElementById(id);

// ── Expected ────────────────────────────────────────────────────────────────────────────

function wireExpected() {
  const gross = $("line-gross");
  const rate = $("line-rate");
  const out = document.querySelector("output.mny-expected");
  if (!gross || !rate || !out) return null;
  const show = () => {
    const cents = dollarsToCents(gross.value);
    const pct = parseRate(rate.value);
    // An em dash while either field does not parse, as CommissionLineForm renders a null —
    // never "$0", which is a figure rather than "nothing worked out yet".
    out.textContent = cents === null || pct === null ? "\u2014" : money(Math.round((cents * pct) / 100));
  };
  gross.addEventListener("input", show);
  rate.addEventListener("input", show);
  return show;
}

// ── The gap ─────────────────────────────────────────────────────────────────────────────

function gapLine(gapCents, label) {
  if (gapCents === 0) return "Matches expected, once the fee is taken out.";
  if (gapCents > 0) return `${label} short of expected, after the fee. Record it as Disputed to chase it.`;
  return `${label} more than expected, after the fee.`;
}

function wireGap() {
  const received = $("pay-received");
  const fee = $("pay-fee");
  const out = document.querySelector("p.mny-gap");
  const asReceived = $("pay-status-received");
  const asDisputed = $("pay-status-disputed");
  if (!received || !fee || !out) return;

  const expected = Number.parseInt(out.getAttribute("data-expected") || "", 10);
  if (!Number.isFinite(expected)) return;

  // Until the advisor picks a status themselves, a shortfall the fee does not explain
  // SUGGESTS Disputed. After they pick, it stops second-guessing them: a payment can land
  // short for a reason Gyasi already knows about.
  let chosen = false;
  for (const radio of [asReceived, asDisputed]) {
    if (radio) radio.addEventListener("change", () => { chosen = true; });
  }

  const show = () => {
    const r = dollarsToCents(received.value);
    const f = dollarsToCents(fee.value);
    if (r === null || f === null || received.value.trim() === "") {
      out.textContent = "";
      return;
    }
    const gap = expected - f - r;
    out.textContent = gapLine(gap, money(Math.abs(gap)));
    if (!chosen && asReceived && asDisputed) {
      asDisputed.checked = gap > 0;
      asReceived.checked = gap <= 0;
    }
  };
  received.addEventListener("input", show);
  fee.addEventListener("input", show);
}

// ── The supplier's prefill (ADD only) ───────────────────────────────────────────────────

function wirePrefill(showExpected) {
  const picker = $("line-supplier");
  const note = $("line-prefill-note");
  // The note only exists on §3.7.4. On the edit page, changing the supplier changes nothing
  // else: a line's figures are what Inteletravel was told, not a supplier default.
  if (!picker || !note) return;

  const fields = {
    gross: { el: $("line-gross"), blank: "" },
    rate: { el: $("line-rate"), blank: "" },
    paymentTerms: { el: $("line-terms"), blank: "after_travel" },
    paymentLagDays: { el: $("line-lag"), blank: "" },
  };
  // Which fields the advisor has typed in — a prefill never overwrites one of these — and
  // which a PREVIOUS supplier filled in, so supplier B never inherits supplier A's figures.
  const touched = new Set();
  const prefilled = new Set();
  for (const [key, f] of Object.entries(fields)) {
    if (!f.el) continue;
    f.el.addEventListener("input", () => { touched.add(key); prefilled.delete(key); });
    f.el.addEventListener("change", () => { touched.add(key); prefilled.delete(key); });
  }

  picker.addEventListener("change", () => {
    const option = picker.selectedOptions[0];
    for (const key of prefilled) {
      const f = fields[key];
      if (f && f.el) f.el.value = f.blank;
    }
    prefilled.clear();

    const put = (key, value) => {
      const f = fields[key];
      if (!f || !f.el || touched.has(key) || value == null || value === "") return;
      f.el.value = value;
      prefilled.add(key);
    };

    const fromTrip = option ? option.getAttribute("data-gross") : null;
    const tripRate = option ? option.getAttribute("data-trip-rate") : null;
    if (fromTrip !== null) {
      put("gross", fromTrip);
      if (tripRate !== null) put("rate", tripRate);
      note.textContent = `Gross and rate filled in from this trip's ${option.textContent.trim()} bookings. Change them if the final figures differ.`;
      note.hidden = false;
    } else {
      note.textContent = "";
      note.hidden = true;
    }
    if (tripRate === null) put("rate", option ? option.getAttribute("data-rate") : null);
    put("paymentTerms", option ? option.getAttribute("data-terms") : null);
    put("paymentLagDays", option ? option.getAttribute("data-lag") : null);
    if (showExpected) showExpected();
  });
}

const showExpected = wireExpected();
wireGap();
wirePrefill(showExpected);
