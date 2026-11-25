package people

import (
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// templateMerge.test.ts, ported case for case. The one case that does not come over is the
// Deno half of "the three copies agree": the web test reads the Edge Function's own copy of
// the field list, and that file is the Edge Function's, not this service's. The SQL half is
// here, because the SQL is what the database enforces for both.

func TestTemplateFieldListsMatchTheMigration(t *testing.T) {
	// 20261021120000 (§3.6) redefines the field list with payment.link; the LATEST definition
	// is the live one. The categories' CHECK is still the 20261016 migration's.
	root := filepath.Join("..", "..", "..", "..", "..", "supabase", "migrations")
	read := func(name string) string {
		t.Helper()
		b, err := os.ReadFile(filepath.Join(root, name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		return string(b)
	}
	sql := read("20261016120000_agent_message_templates.sql")
	latest := read("20261021120000_supplier_pay_links.sql")

	quoted := func(s string) []string {
		var out []string
		for _, m := range regexp.MustCompile(`'([^']+)'`).FindAllStringSubmatch(s, -1) {
			out = append(out, m[1])
		}
		return out
	}
	between := func(body, pattern string) string {
		m := regexp.MustCompile(pattern).FindStringSubmatch(body)
		if m == nil {
			t.Fatalf("no match for %s", pattern)
		}
		return m[1]
	}

	fromSQL := quoted(between(latest, `(?s)message_template_fields\(\).*?ARRAY\[(.*?)\]::text\[\]`))
	if !slices.Equal(fromSQL, mergeFields) {
		t.Errorf("merge fields: migration %q, Go %q", fromSQL, mergeFields)
	}
	fromCheck := quoted(between(sql, `(?s)message_template_category CHECK \(category IN \((.*?)\)\)`))
	if !slices.Equal(fromCheck, templateCategories) {
		t.Errorf("categories: migration %q, Go %q", fromCheck, templateCategories)
	}

	bodies := func(s string) []string {
		var out []string
		for _, m := range regexp.MustCompile(`(?s)\$body\$(.*?)\$body\$`).FindAllStringSubmatch(s, -1) {
			out = append(out, m[1])
		}
		return out
	}
	starters := bodies(sql)
	if len(starters) != 7 {
		t.Errorf("starters = %d, want 7", len(starters))
	}
	current := bodies(latest)
	if len(current) < 7 {
		t.Errorf("current starters = %d, want at least 7", len(current))
	}
	for _, b := range slices.Concat(starters, current) {
		if got := unknownTokens(b); len(got) > 0 {
			t.Errorf("a starter uses %q, which is not a merge field", got)
		}
	}
	if !slices.ContainsFunc(current, func(b string) bool { return strings.Contains(b, "{{payment.link}}") }) {
		t.Error("the current payment reminder starter does not carry the pay link")
	}
}

func TestRenderTemplate(t *testing.T) {
	t.Run("fills what has a value and leaves the rest as raw tokens, reported once each", func(t *testing.T) {
		out := renderTemplate("Hi {{client.firstName}}, see you {{ trip.dates }} and {{trip.dates}}.",
			map[string]string{"client.firstName": "Maya"})
		if want := "Hi Maya, see you {{ trip.dates }} and {{trip.dates}}."; out.Text != want {
			t.Errorf("text = %q, want %q", out.Text, want)
		}
		if !slices.Equal(out.Missing, []string{"trip.dates"}) {
			t.Errorf("missing = %q", out.Missing)
		}
	})

	t.Run("treats a blank value as missing, never as an empty gap", func(t *testing.T) {
		out := renderTemplate("Your trip on {{trip.dates}}.", map[string]string{"trip.dates": "  "})
		if !slices.Equal(out.Missing, []string{"trip.dates"}) {
			t.Errorf("missing = %q", out.Missing)
		}
	})

	t.Run("leaves unknown tokens untouched and does not call them missing", func(t *testing.T) {
		out := renderTemplate("{{client.firstname}}", nil)
		if out.Text != "{{client.firstname}}" || len(out.Missing) != 0 {
			t.Errorf("= %+v", out)
		}
	})
}

func TestTemplateTokenScans(t *testing.T) {
	if got := unknownTokens("{{a}} {{ client.firstName }} {{a}} {{trip.when}}"); !slices.Equal(got, []string{"a", "trip.when"}) {
		t.Errorf("unknownTokens = %q", got)
	}
	if got := unfilledFields("A {{braces}} note, {{payment.amount}} and {{ payment.amount }}"); !slices.Equal(got, []string{"payment.amount"}) {
		t.Errorf("unfilledFields = %q", got)
	}
}

func mayaContext() mergeContext {
	return mergeContext{
		ClientFirstName:  "Maya",
		AgentFirstName:   "Gyasi",
		TripTitle:        "Saint Lucia · Between Semesters",
		TripDestinations: []string{"Soufriere, Saint Lucia", "Castries"},
		TripStartDate:    "2026-10-12",
		TripEndDate:      "2026-10-19",
		PaymentLabel:     "Final balance",
		PaymentOwedCents: "200000",
		PaymentCurrency:  "USD",
		PaymentDueDate:   "2026-11-02",
		PaymentLink:      "https://www.sandals.com/pay/SRB-220119",
	}
}

func TestMergeValues(t *testing.T) {
	t.Run("formats every field", func(t *testing.T) {
		want := map[string]string{
			"client.firstName": "Maya",
			"agent.firstName":  "Gyasi",
			"trip.name":        "Saint Lucia · Between Semesters",
			"trip.destination": "Soufriere, Saint Lucia and Castries",
			"trip.dates":       "Oct 12 – 19, 2026",
			"payment.label":    "Final balance",
			"payment.amount":   "$2,000",
			"payment.dueDate":  "Nov 2, 2026",
			"payment.link":     "https://www.sandals.com/pay/SRB-220119",
		}
		if got := mergeValuesOf(mayaContext()); !maps.Equal(got, want) {
			t.Errorf("mergeValues = %v, want %v", got, want)
		}
	})

	t.Run("leaves out what a general thread does not have, and never writes 'Dates to come'", func(t *testing.T) {
		ctx := mayaContext()
		ctx.TripTitle, ctx.TripDestinations, ctx.TripStartDate, ctx.TripEndDate = "", nil, "", ""
		ctx.PaymentLabel, ctx.PaymentOwedCents, ctx.PaymentCurrency, ctx.PaymentDueDate, ctx.PaymentLink = "", "", "", "", ""
		got := slices.Sorted(maps.Keys(mergeValuesOf(ctx)))
		if !slices.Equal(got, []string{"agent.firstName", "client.firstName"}) {
			t.Errorf("keys = %q", got)
		}
	})

	t.Run("leaves payment.link missing when the milestone has no link", func(t *testing.T) {
		ctx := mayaContext()
		ctx.PaymentLink = ""
		values := mergeValuesOf(ctx)
		if _, ok := values["payment.link"]; ok {
			t.Error("payment.link has a value")
		}
		if got := renderTemplate("Pay here: {{payment.link}}", values).Missing; !slices.Equal(got, []string{"payment.link"}) {
			t.Errorf("missing = %q", got)
		}
	})

	t.Run("an owed amount of zero is still a value", func(t *testing.T) {
		ctx := mayaContext()
		ctx.PaymentOwedCents = "0"
		if got := mergeValuesOf(ctx)["payment.amount"]; got != "$0" {
			t.Errorf("payment.amount = %q", got)
		}
	})

	t.Run("a cents string that is not digits is not an amount", func(t *testing.T) {
		// Go-only: the column arrives as text, and Number("12.5") would be a float in JS.
		for _, bad := range []string{"12.5", "-100", "1e5", " 100", ""} {
			ctx := mayaContext()
			ctx.PaymentOwedCents = bad
			if _, ok := mergeValuesOf(ctx)["payment.amount"]; ok {
				t.Errorf("%q became an amount", bad)
			}
		}
	})

	t.Run("the editor's sample fills every field", func(t *testing.T) {
		got := slices.Sorted(maps.Keys(mergeValuesOf(sampleMergeContext)))
		want := slices.Sorted(slices.Values(mergeFields))
		if !slices.Equal(got, want) {
			t.Errorf("sample fills %q, want %q", got, want)
		}
	})
}

func TestJoinDestinations(t *testing.T) {
	for _, c := range []struct {
		in   []string
		want string
	}{
		{nil, ""},
		{[]string{"Bahamas"}, "Bahamas"},
		{[]string{"Bahamas", "St. Maarten"}, "Bahamas and St. Maarten"},
		{[]string{"Aruba", " Curaçao ", "", "Bonaire"}, "Aruba, Curaçao and Bonaire"},
	} {
		if got := joinDestinations(c.in); got != c.want {
			t.Errorf("joinDestinations(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestTripDatesLabel(t *testing.T) {
	// formatTripDates, which is NOT clientDetail's dateRange: across a year it writes the
	// start with no year at all ("Dec 28 – Jan 3, 2027").
	for _, c := range []struct{ start, end, want string }{
		{"", "", "Dates to come"},
		{"2026-11-02", "", "Nov 2, 2026"},
		{"2026-10-12", "2026-10-19", "Oct 12 – 19, 2026"},
		{"2026-08-28", "2026-09-03", "Aug 28 – Sep 3, 2026"},
		{"2026-12-28", "2027-01-03", "Dec 28 – Jan 3, 2027"},
	} {
		if got := tripDatesLabel(c.start, c.end); got != c.want {
			t.Errorf("tripDatesLabel(%q, %q) = %q, want %q", c.start, c.end, got, c.want)
		}
	}
}

func TestInsertTemplate(t *testing.T) {
	// insertAtCursor with no cursor, which is what a server has: an empty box gets the
	// template, and a draft keeps every word with the template after it.
	for _, c := range []struct{ draft, text, want string }{
		{"  ", "Hello", "Hello"},
		{"", "Hello", "Hello"},
		{"abc", "X", "abcX"},
		{"Hi there", " X", "Hi there X"},
	} {
		if got := insertTemplate(c.draft, c.text); got != c.want {
			t.Errorf("insertTemplate(%q, %q) = %q, want %q", c.draft, c.text, got, c.want)
		}
	}
}
