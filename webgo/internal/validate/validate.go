package validate

// The traveler side's half of this package, added by the onboarding and client area
// (docs/GO-MIGRATION.md Phase 4). text.go's package comment covers the rules all of it
// follows; this is the map of which file ports which screen.
//
//	fields.go       the shared optional-field rules (text, date, birth date, country)
//	dates.go        date-only values: IsRealDate, TodayISO
//	countries.go    the alpha-2 list, generated from web/lib/countries.ts
//	phone.go        NormalizePhone (profile.ts), E.164 with the NANP guess checked
//	profile.go      2.1.10 Profile Completion / 2.5.2 Personal Info
//	companion.go    2.1.12 Travel Companions / 2.5.4
//	preferences.go  2.1.11 Travel Preferences / 2.5.3
//
// copy_test.go reads the TypeScript and fails on any message, option value or country that
// has drifted from it, so the two apps cannot say different words to the same traveler.
