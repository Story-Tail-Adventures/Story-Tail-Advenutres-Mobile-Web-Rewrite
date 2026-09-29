import { describe, expect, it } from "vitest";

import { templateCard } from "./templates";
import type { AgentTemplateRow } from "./api";

/**
 * §3.4.13's card view model.
 *
 * Three rules worth pinning, each one a thing the accessor CAN legitimately return and
 * which reads as a defect if the card renders it literally.
 */

const BASE: AgentTemplateRow = {
  template_id: "t1",
  name: "Sandals Negril · 7n",
  description: "Ocean-view suite, transfer, catamaran, insurance",
  trip_type: "all_inclusive",
  component_count: 6,
  day_count: 4,
  value_cents: "1284500",
  times_used: 14,
  created_at: "2026-09-28T00:00:00Z",
  updated_at: "2026-09-28T00:00:00Z",
};

describe("templateCard", () => {
  it("reads the trip type as a label, not an enum value", () => {
    expect(templateCard(BASE).tripTypeLabel).not.toBe("all_inclusive");
    expect(templateCard(BASE).tripTypeLabel.length).toBeGreaterThan(0);
  });

  it("falls back to the raw trip_type rather than rendering nothing", () => {
    // `trip_type` has six enum members and TRIP_TYPES carries five — the prototype's
    // "Honeymoon" tile was dropped because it is not a trip_type. A value outside the list
    // is real data, so showing it beats an empty cell.
    expect(templateCard({ ...BASE, trip_type: "group_charter" }).tripTypeLabel).toBe(
      "group_charter",
    );
  });

  it("says '6 bookings · 4 days'", () => {
    expect(templateCard(BASE).shapeLabel).toBe("6 bookings · 4 days");
  });

  it("omits the days entirely when there is no day-by-day", () => {
    // A pattern saved from a trip with no itinerary is real and useful — the bookings are
    // most of the value. "· 0 days" would read as something having gone wrong.
    expect(templateCard({ ...BASE, day_count: 0 }).shapeLabel).toBe("6 bookings");
  });

  it("pluralises both halves independently", () => {
    const one = templateCard({ ...BASE, component_count: 1, day_count: 1 });
    expect(one.shapeLabel).toBe("1 booking · 1 day");
  });

  it("gives an unpriced pattern a dash rather than $0", () => {
    // Same rule §3.3.1 settled for a client with nothing committed: a labelled zero claims
    // the pattern is worth nothing, where the truth is that nobody priced its components.
    expect(templateCard({ ...BASE, value_cents: "0" }).valueLabel).toBeNull();
    expect(templateCard(BASE).valueLabel).toContain("12,845");
  });

  it("shows a usage chip only once something has used it", () => {
    // `times_used` is derived in SQL from trip.template_id, so a brand-new template is
    // genuinely 0 — and "0× used" on every new card is a number that means nothing.
    expect(templateCard({ ...BASE, times_used: 0 }).usageLabel).toBeNull();
    expect(templateCard({ ...BASE, times_used: 1 }).usageLabel).toBe("1× used");
    expect(templateCard(BASE).usageLabel).toBe("14× used");
  });

  it("carries a null description through rather than inventing one", () => {
    expect(templateCard({ ...BASE, description: null }).description).toBeNull();
  });

  it("reads value_cents as a digit-string, which is how the accessor sends it", () => {
    // PostgREST serialises bigint as a JSON number and loses precision past 2^53, so every
    // money column on this side arrives as text. A card that treated it as a number would
    // be right until somebody saved an expensive pattern.
    const big = templateCard({ ...BASE, value_cents: "900000000000000000" });
    expect(big.valueLabel).not.toBeNull();
    expect(big.valueLabel).not.toContain("e+");
  });
});
