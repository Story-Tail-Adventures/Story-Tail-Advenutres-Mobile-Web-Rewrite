package trips

import (
	"net/url"
	"testing"
)

// Ported from web/lib/agent/newTrip.test.ts and web/lib/agent/templates.test.ts (the shape
// label the template picker shows).

func form(kv ...string) url.Values {
	v := url.Values{}
	for i := 0; i+1 < len(kv); i += 2 {
		v.Add(kv[i], kv[i+1])
	}
	return v
}

func TestNewTripFromForm(t *testing.T) {
	// It reads templateId, which nothing else would notice was missing.
	v := newTripFromForm(form("clientId", "c1", "tripType", "cruise", "title", "Negril again", "travelerCount", "2", "templateId", "tpl-1"))
	if v.templateID != "tpl-1" {
		t.Errorf("templateId = %q", v.templateID)
	}
	// An absent template field, or the empty option, is "start from scratch".
	if v := newTripFromForm(form("clientId", "c1", "tripType", "cruise", "title", "T", "travelerCount", "2")); v.templateID != "" {
		t.Errorf("absent templateId = %q", v.templateID)
	}
	if v := newTripFromForm(form("clientId", "c1", "templateId", "")); v.templateID != "" {
		t.Errorf("empty templateId = %q", v.templateID)
	}
	// A stray space is not a uuid.
	if v := newTripFromForm(form("templateId", " tpl-2 ", "clientId", " c1 ", "title", "  A trip ")); v.templateID != "tpl-2" || v.clientID != "c1" || v.title != "A trip" {
		t.Errorf("not trimmed: %+v", v)
	}
	// The posted trip type is not trusted: "honeymoon" is the prototype's sixth tile.
	if v := newTripFromForm(form("tripType", "honeymoon")); v.tripType != defaultTripType {
		t.Errorf("tripType = %q", v.tripType)
	}
}

func TestValidateNewTrip(t *testing.T) {
	// The template id is NOT validated: the RPC's ownership check refuses a stale one.
	if e := validateNewTrip(newTripValues{clientID: "c1", title: "A trip", travelerCount: "2", templateID: "not-a-uuid-at-all"}); e.any() {
		t.Errorf("errors = %+v", e)
	}
	e := validateNewTrip(newTripValues{})
	if e.client != "Pick a client first." || e.title != "Give the trip a name." {
		t.Errorf("errors = %+v", e)
	}
}

func TestTripTypeLabel(t *testing.T) {
	for _, tt := range tripTypes {
		if got := tripTypeLabel(tt.value); got != tt.label {
			t.Errorf("%s = %q", tt.value, got)
		}
	}
	// An unknown value is real data: echo it rather than render nothing.
	if got := tripTypeLabel("group_charter"); got != "group_charter" {
		t.Errorf("unknown = %q", got)
	}
}

func TestShapeLabel(t *testing.T) {
	cases := []struct {
		c, d int
		want string
	}{
		{6, 4, "6 bookings · 4 days"},
		{6, 0, "6 bookings"}, // "· 0 days" would read as something having gone wrong
		{1, 1, "1 booking · 1 day"},
	}
	for _, c := range cases {
		if got := shapeLabel(c.c, c.d); got != c.want {
			t.Errorf("shapeLabel(%d, %d) = %q, want %q", c.c, c.d, got, c.want)
		}
	}
}

func TestMatchClient(t *testing.T) {
	book := []pickClient{{"c1", "Jordan Hayes", ""}, {"c2", "Sam Rivera", ""}, {"c3", "Sam Rivera", ""}}
	if got := matchClient(book, "  jordan hayes "); got != "c1" {
		t.Errorf("match = %q", got)
	}
	// A name two clients share never picks one silently.
	if got := matchClient(book, "Sam Rivera"); got != "" {
		t.Errorf("ambiguous = %q", got)
	}
	if got := matchClient(book, "Jordan"); got != "" {
		t.Errorf("partial = %q", got)
	}
}

func TestParseIntJS(t *testing.T) {
	cases := map[string]struct {
		n  int
		ok bool
	}{
		"2": {2, true}, " 3": {3, true}, "3.7": {3, true}, "-2": {-2, true}, "1e3": {1, true},
		"": {0, false}, "abc": {0, false}, "+4": {4, true},
	}
	for in, want := range cases {
		n, ok := parseIntJS(in)
		if n != want.n || ok != want.ok {
			t.Errorf("parseIntJS(%q) = %d %v, want %d %v", in, n, ok, want.n, want.ok)
		}
	}
}
