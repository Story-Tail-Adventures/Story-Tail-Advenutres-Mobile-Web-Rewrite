package validate

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The messages here are the Next app's, word for word (docs/GO-MIGRATION.md §4.10), and
// these are the sentences a traveler reads when a form refuses them. A test that only
// compared them to themselves would pass forever while the two apps drifted, so this one
// reads the TypeScript and fails on any difference.
//
// It joins adjacent string literals first ("a " + "b" is one sentence in the source) and
// unescapes the quotes, then looks for each Go message in what is left.

func tsSource(t *testing.T, name string) string {
	t.Helper()
	path := filepath.Join("..", "..", "..", "web", "lib", "validation", name)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	src := string(raw)
	// Join `"…" +\n  "…"` into one literal, in any mix of quote styles: one of these
	// sentences is written as a single-quoted literal plus a double-quoted one, because it
	// contains both kinds of quote.
	join := regexp.MustCompile(`['"]\s*\+\s*\n?\s*['"]`)
	src = join.ReplaceAllString(src, "")
	return strings.NewReplacer(`\'`, "'", `\"`, `"`).Replace(src)
}

func wantIn(t *testing.T, src, file string, messages map[string]string) {
	t.Helper()
	for name, message := range messages {
		if !strings.Contains(src, message) {
			t.Errorf("%s: %s is not in web/lib/validation/%s word for word:\n  %q",
				file, name, file, message)
		}
	}
}

func TestProfileMessagesMatchTheNextApp(t *testing.T) {
	m := ProfileMessages
	wantIn(t, tsSource(t, "profile.ts"), "profile.ts", map[string]string{
		"phoneInvalid": m.PhoneInvalid, "phoneNeedsCountryCode": m.PhoneNeedsCountryCode,
		"dobInvalid": m.DobInvalid, "dobTooEarly": m.DobTooEarly, "dateInvalid": m.DateInvalid,
		"countryInvalid": m.CountryInvalid, "postalInvalid": m.PostalInvalid,
		"tooLong": m.TooLong, "invalidChars": m.InvalidChars,
		"addressIncomplete": m.AddressIncomplete, "emergencyIncomplete": m.EmergencyIncomplete,
		"passportIncomplete": m.PassportIncomplete,
	})
}

func TestCompanionMessagesMatchTheNextApp(t *testing.T) {
	m := CompanionMessages
	wantIn(t, tsSource(t, "companion.ts"), "companion.ts", map[string]string{
		"firstNameRequired": m.FirstNameRequired, "lastNameRequired": m.LastNameRequired,
		"nameTooLong": m.NameTooLong, "invalidChars": m.InvalidChars,
		"relationshipTooLong": m.RelationshipTooLong, "dobInvalid": m.DobInvalid,
		"dateInvalid": m.DateInvalid, "countryInvalid": m.CountryInvalid,
		"passportNeedsExpiry": m.PassportNeedsExpiry,
	})
}

func TestPreferencesMessagesMatchTheNextApp(t *testing.T) {
	m := PreferencesMessages
	wantIn(t, tsSource(t, "preferences.ts"), "preferences.ts", map[string]string{
		"destinationsTooMany": m.DestinationsTooMany, "destinationTooLong": m.DestinationTooLong,
		"invalidChars": m.InvalidChars, "unknownOption": m.UnknownOption,
		"dietaryNoneAlone": m.DietaryNoneAlone, "dietaryNoneWithNote": m.DietaryNoneWithNote,
		"accessibilityNoneAlone":    m.AccessibilityNoneAlone,
		"accessibilityNoneWithNote": m.AccessibilityNoneWithNote,
		"notesTooLong":              m.NotesTooLong, "favoritesTooLong": m.FavoritesTooLong,
		"loyaltyNeedsProgram": m.LoyaltyNeedsProgram, "loyaltyNumberShape": m.LoyaltyNumberShape,
		"loyaltyProgramTooLong": m.LoyaltyProgramTooLong, "loyaltyTooMany": m.LoyaltyTooMany,
		"budgetUnknown": m.BudgetUnknown,
	})
}

// The vocabularies are the values columns store and CHECK constraints enforce, so a label
// quietly becoming a value would be a bad day. Each slug must appear in the TypeScript.
func TestPreferenceVocabulariesMatchTheNextApp(t *testing.T) {
	src := tsSource(t, "preferences.ts")
	for _, group := range [][]Option{TravelStyleOptions, DietaryOptions, AccessibilityOptions, BudgetOptions} {
		for _, o := range group {
			if !strings.Contains(src, `{ label: "`+o.Label+`", value: "`+o.Value+`" }`) {
				t.Errorf("preferences.ts has no option %q -> %q", o.Label, o.Value)
			}
		}
	}
	for _, d := range DestinationSuggestions {
		if !strings.Contains(src, `"`+d+`"`) {
			t.Errorf("preferences.ts does not suggest %q", d)
		}
	}
}

// The country list is 249 rows that nobody will re-check by eye, and a code that drifted
// would refuse a traveler's own country with "Pick a country from the list".
func TestCountryListMatchesTheNextApp(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "web", "lib", "countries.ts"))
	if err != nil {
		t.Fatalf("reading countries.ts: %v", err)
	}
	rows := regexp.MustCompile(`\{ code: "([A-Z]{2})", name: "([^"]+)" \}`).FindAllStringSubmatch(string(raw), -1)
	if len(rows) != len(Countries) {
		t.Fatalf("countries.ts has %d countries, Go has %d", len(rows), len(Countries))
	}
	for i, row := range rows {
		if Countries[i].Code != row[1] || Countries[i].Name != row[2] {
			t.Errorf("country %d: Go has %q %q, countries.ts has %q %q",
				i, Countries[i].Code, Countries[i].Name, row[1], row[2])
		}
	}
	if !strings.Contains(string(raw), `DEFAULT_COUNTRY = "`+DefaultCountry+`"`) {
		t.Errorf("DefaultCountry %q is not countries.ts's DEFAULT_COUNTRY", DefaultCountry)
	}
}
