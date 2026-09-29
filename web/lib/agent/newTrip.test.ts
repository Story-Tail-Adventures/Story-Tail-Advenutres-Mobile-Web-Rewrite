import { describe, expect, it } from "vitest";

import {
  EMPTY_NEW_TRIP,
  newTripFromFormData,
  TRIP_TYPES,
  tripTypeLabel,
  validateNewTrip,
} from "./newTrip";

/**
 * §3.4.3's form parsing, and §3.4.13's template field riding in it.
 *
 * WHY THE TEMPLATE FIELD IS TESTED HERE AND NOT IN A BROWSER. `createTripAction` creates
 * the trip and then applies the pattern, and a failed apply deliberately does NOT fail the
 * create — the trip is real and the advisor is one click from the builder, where losing it
 * to recover from a seeding problem would be the worse trade. That choice means a
 * `templateId` which never reaches the action produces a trip with nothing in it AND NO
 * ERROR, which is indistinguishable on screen from picking "Start from scratch".
 *
 * So the wiring gets an assertion rather than a click. This is the layer where a missing
 * field is visible.
 */

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("newTripFromFormData", () => {
  it("reads templateId, which nothing else would notice was missing", () => {
    const values = newTripFromFormData(
      form({
        clientId: "c1",
        tripType: "cruise",
        title: "Negril again",
        travelerCount: "2",
        templateId: "tpl-1",
      }),
    );
    expect(values.templateId).toBe("tpl-1");
  });

  it("treats an absent template field as 'start from scratch'", () => {
    // The picker renders only when the library has something in it, so on an empty library
    // the field is not in the DOM at all and the FormData has no entry for it.
    const values = newTripFromFormData(
      form({ clientId: "c1", tripType: "cruise", title: "T", travelerCount: "2" }),
    );
    expect(values.templateId).toBe("");
  });

  it("treats the empty option as 'start from scratch' too", () => {
    // `<option value="">Start from scratch</option>`. The action tests truthiness, so ""
    // and absent have to behave the same.
    const values = newTripFromFormData(
      form({ clientId: "c1", tripType: "cruise", title: "T", travelerCount: "2", templateId: "" }),
    );
    expect(values.templateId).toBe("");
  });

  it("trims a template id, because a stray space is not a uuid", () => {
    const values = newTripFromFormData(
      form({ clientId: "c1", tripType: "custom", title: "T", travelerCount: "1", templateId: " tpl-2 " }),
    );
    expect(values.templateId).toBe("tpl-2");
  });

  it("does NOT validate the template id", () => {
    // Deliberate: a stale or foreign id is refused by the RPC's own ownership check and
    // comes back as an outcome. A second copy of that rule here is a second place for it
    // to drift, and this form cannot know what the agent owns anyway.
    const errors = validateNewTrip({
      ...EMPTY_NEW_TRIP,
      clientId: "c1",
      title: "A trip",
      travelerCount: "2",
      templateId: "not-a-uuid-at-all",
    });
    expect(errors).toBeNull();
  });

  it("falls back to the default trip type rather than trusting the posted one", () => {
    const values = newTripFromFormData(
      form({ clientId: "c1", tripType: "honeymoon", title: "T", travelerCount: "2" }),
    );
    // "Honeymoon" is the prototype's sixth tile and is not a `trip_type`.
    expect(values.tripType).toBe(EMPTY_NEW_TRIP.tripType);
  });
});

describe("tripTypeLabel", () => {
  it("labels every type the form can post", () => {
    for (const t of TRIP_TYPES) {
      expect(tripTypeLabel(t.value)).toBe(t.label);
    }
  });

  it("echoes an unknown value rather than rendering nothing", () => {
    // `trip_type` is an enum with more members than TRIP_TYPES carries, so a stored value
    // outside the list is real data — §3.4.13's cards render it.
    expect(tripTypeLabel("group_charter")).toBe("group_charter");
  });
});
