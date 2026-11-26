package trips

import (
	"strings"
	"testing"
)

// Ported from web/lib/agent/templates.test.ts.

func TestTemplateCard(t *testing.T) {
	desc := "Ocean-view suite, transfer, catamaran, insurance"
	base := templateRow{TemplateID: "t1", Name: "Sandals Negril · 7n", Description: &desc, TripType: "all_inclusive",
		ComponentCount: 6, DayCount: 4, ValueCents: 1284500, TimesUsed: 14}
	with := func(f func(*templateRow)) templateCard { r := base; f(&r); return toTemplateCard(r) }

	if c := toTemplateCard(base); c.tripTypeLabel == "all_inclusive" || c.tripTypeLabel == "" {
		t.Errorf("trip type label = %q", c.tripTypeLabel)
	}
	if c := with(func(r *templateRow) { r.TripType = "group_charter" }); c.tripTypeLabel != "group_charter" {
		t.Errorf("unknown trip type = %q", c.tripTypeLabel)
	}
	if c := toTemplateCard(base); c.shapeLabel != "6 bookings · 4 days" {
		t.Errorf("shape = %q", c.shapeLabel)
	}
	if c := with(func(r *templateRow) { r.DayCount = 0 }); c.shapeLabel != "6 bookings" {
		t.Errorf("no days = %q", c.shapeLabel)
	}
	if c := with(func(r *templateRow) { r.ComponentCount, r.DayCount = 1, 1 }); c.shapeLabel != "1 booking · 1 day" {
		t.Errorf("singular = %q", c.shapeLabel)
	}
	if c := with(func(r *templateRow) { r.ValueCents = 0 }); c.valueLabel != "" {
		t.Errorf("an unpriced pattern = %q", c.valueLabel)
	}
	if c := toTemplateCard(base); !strings.Contains(c.valueLabel, "12,845") {
		t.Errorf("value = %q", c.valueLabel)
	}
	for used, want := range map[int]string{0: "", 1: "1× used", 14: "14× used"} {
		if c := with(func(r *templateRow) { r.TimesUsed = used }); c.usageLabel != want {
			t.Errorf("used %d = %q", used, c.usageLabel)
		}
	}
	if c := with(func(r *templateRow) { r.Description = nil }); c.description != "" {
		t.Errorf("null description = %q", c.description)
	}
	if c := with(func(r *templateRow) { r.ValueCents = 900000000000000000 }); c.valueLabel == "" || strings.Contains(c.valueLabel, "e+") {
		t.Errorf("a big digit-string = %q", c.valueLabel)
	}
}
