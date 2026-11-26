package onboardingpreferences

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(nil, httptest.NewRequest("PUT", "/functions/v1/onboarding-preferences", nil))
	if p, ok := problem.As(err); !ok || p.Status != 400 || p.Detail != "Use POST." {
		t.Fatalf("err = %v", err)
	}
}

func parseString(t *testing.T, body string) (js.Ordered, error) {
	t.Helper()
	v, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	return parse(v)
}

func TestParseRefusals(t *testing.T) {
	long := func(n int) string { return `"` + strings.Repeat("a", n) + `"` }
	thirteen := `["a","b","c","d","e","f","g","h","i","j","k","l","m"]`
	eleven := `[` + strings.Repeat(`{"program":"P"},`, 10) + `{"program":"P"}]`
	cases := map[string]string{
		`{"destinations":"Aruba"}`:                                  "destinations must be an array.",
		`{"destinations":` + thirteen + `}`:                         "destinations has too many entries.",
		`{"destinations":[1]}`:                                      "destinations must contain only strings.",
		`{"destinations":[` + long(61) + `]}`:                       "An entry in destinations is too long.",
		`{"travelStyles":["spa"]}`:                                  "travelStyles accepts only: resort, cruise, adventure, family, romantic, group.",
		`{"travelStyles":["a","b","c","d","e","f","g"]}`:            "travelStyles has too many entries.",
		`{"dietary":["none","halal"]}`:                              `dietary cannot be "none" and something else at the same time.`,
		`{"dietary":["kosher"]}`:                                    "dietary accepts only: none, vegetarian, pescatarian, gluten_free, halal.",
		`{"dietary":["a","b","c","d","e","f"]}`:                     "dietary has too many entries.",
		`{"accessibility":["stairs"]}`:                              "accessibility accepts only: none, mobility, quiet_room, service_animal.",
		`{"accessibility":["none","mobility"]}`:                     `accessibility cannot be "none" and something else at the same time.`,
		`{"dietaryNotes":5}`:                                        "dietaryNotes must be a string or null.",
		`{"dietaryNotes":` + long(501) + `}`:                        "dietaryNotes is longer than 500 characters.",
		`{"accessibilityNotes":` + long(501) + `}`:                  "accessibilityNotes is longer than 500 characters.",
		`{"dietary":["none"],"dietaryNotes":"shellfish"}`:           `dietary cannot be "none" and carry a note at the same time ` + "\U00002014" + ` the note is the answer.`,
		`{"accessibility":["none"],"accessibilityNotes":"ramp"}`:    `accessibility cannot be "none" and carry a note at the same time ` + "\U00002014" + ` the note is the answer.`,
		`{"favoritePastTrips":` + long(1001) + `}`:                  "favoritePastTrips is longer than 1000 characters.",
		`{"budgetBand":"cheap"}`:                                    "budgetBand accepts only: budget, mid, premium, luxury.",
		`{"budgetBand":1}`:                                          "budgetBand must be a string or null.",
		`{"loyalty":{}}`:                                            "loyalty must be an array.",
		`{"loyalty":` + eleven + `}`:                                "loyalty accepts at most 10 programs.",
		`{"loyalty":[null]}`:                                        "Each loyalty entry must be an object.",
		`{"loyalty":[[]]}`:                                          "Each loyalty entry must be an object.",
		`{"loyalty":[{"number":"AB12"}]}`:                           "Every loyalty number needs the program it belongs to.",
		`{"loyalty":[{"program":` + long(61) + `}]}`:                "That program name is too long.",
		`{"loyalty":[{"program":"IHG","number":"92 214"}]}`:         "A membership number is letters, digits and hyphens.",
		`{"loyalty":[{"program":"IHG","number":` + long(41) + `}]}`: "A membership number is letters, digits and hyphens.",
		`{"loyalty":[{"program":5}]}`:                               "program must be a string or null.",
		// Order: the sentinel-and-something check comes before the notes are read.
		`{"dietary":["none","halal"],"dietaryNotes":5}`: `dietary cannot be "none" and something else at the same time.`,
		`{"destinations":1,"travelStyles":["spa"]}`:     "destinations must be an array.",
	}
	for body, want := range cases {
		_, err := parseString(t, body)
		if p, ok := problem.As(err); !ok || p.Status != 400 || p.Detail != want {
			t.Errorf("%s: err = %v, want %q", body, err, want)
		}
	}
}

func TestParsePatch(t *testing.T) {
	_, err := parseString(t, `{"destinations":[" Aruba ","Aruba","",null],"travelStyles":null,
		"dietary":["none"],"dietaryNotes":"","accessibility":["mobility","quiet_room"],"accessibilityNotes":" ramp ",
		"favoritePastTrips":"Kyoto","budgetBand":"mid","loyalty":[{"program":" IHG ","number":"92214"},{},{"program":"Hilton","number":""}]}`)
	if err == nil || !strings.Contains(err.Error(), "only strings") {
		// null inside the destinations array is not a string
		t.Fatalf("null entry: %v", err)
	}
	patch, err := parseString(t, `{"destinations":[" Aruba ","Aruba",""],"travelStyles":null,
		"dietary":["none"],"dietaryNotes":"","accessibility":["mobility","quiet_room"],"accessibilityNotes":" ramp ",
		"favoritePastTrips":"Kyoto","budgetBand":"mid","loyalty":[{"program":" IHG ","number":"92214"},{},{"program":"Hilton","number":""}]}`)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := js.Marshal(patch)
	want := `{"preferred_destinations":["Aruba"],"travel_styles":[],"dietary_restrictions":["none"],"accessibility_needs":["mobility","quiet_room"],` +
		`"dietary_notes":null,"accessibility_notes":"ramp","favorite_past_trips":"Kyoto","budget_band":"mid",` +
		`"loyalty_programs":[{"program":"IHG","number":"92214","tier":null},{"program":"Hilton","number":null,"tier":null}]}`
	if string(b) != want {
		t.Errorf("patch\n got %s\nwant %s", b, want)
	}
	if got := strings.Join(sortedKeys(patch.Set("updated_at", "x")), ","); got != "accessibility_needs,accessibility_notes,budget_band,dietary_notes,dietary_restrictions,favorite_past_trips,loyalty_programs,preferred_destinations,travel_styles,updated_at" {
		t.Errorf("fields %s", got)
	}
}

// Absent keys are left out entirely; null loyalty is an empty list.
func TestParseAbsentAndNull(t *testing.T) {
	patch, err := parseString(t, `{}`)
	if err != nil || len(patch) != 0 {
		t.Fatalf("%v %v", patch, err)
	}
	patch, err = parseString(t, `{"loyalty":null,"budgetBand":null,"favoritePastTrips":"  "}`)
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := js.Marshal(patch); string(b) != `{"favorite_past_trips":null,"budget_band":null,"loyalty_programs":[]}` {
		t.Errorf("%s", b)
	}
	// A sentinel with the note only cleared, or with no note key at all, is fine.
	for _, body := range []string{`{"dietary":["none"],"dietaryNotes":null}`, `{"dietary":["none"]}`, `{"dietaryNotes":"x"}`} {
		if _, err := parseString(t, body); err != nil {
			t.Errorf("%s: %v", body, err)
		}
	}
}

// Lengths are UTF-16 units: 250 emoji are 500 units, 251 are too many.
func TestBoundedTextCountsUTF16(t *testing.T) {
	ok := `{"dietaryNotes":"` + strings.Repeat("\U0001F990", 250) + `"}`
	if _, err := parseString(t, ok); err != nil {
		t.Errorf("500 units refused: %v", err)
	}
	over := `{"dietaryNotes":"` + strings.Repeat("\U0001F990", 251) + `"}`
	if _, err := parseString(t, over); err == nil {
		t.Error("502 units accepted")
	}
}
