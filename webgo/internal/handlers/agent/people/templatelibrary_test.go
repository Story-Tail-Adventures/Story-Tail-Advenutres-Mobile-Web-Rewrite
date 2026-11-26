package people

import (
	"slices"
	"strings"
	"testing"
)

// templateLibrary.test.ts, ported case for case.

func sampleTemplate(id, category, name string, tags []string, body string) messageTemplate {
	return toTemplate(messageTemplateRow{
		TemplateID: id, Category: category, Name: name, Body: body, Tags: tags,
		Archived: false, UpdatedAt: "2026-10-14T23:30:00Z",
	}, "America/Chicago")
}

func TestTemplateLibrary(t *testing.T) {
	t.Run("groups in the library's order, A to Z inside each, empty groups left out", func(t *testing.T) {
		groups := groupTemplates([]messageTemplate{
			sampleTemplate("1", "pre_trip", "Pre-trip · 7 days", nil, ""),
			sampleTemplate("2", "other", "zebra", nil, ""),
			sampleTemplate("3", "lead_response", "Lead response", nil, ""),
			sampleTemplate("4", "pre_trip", "Pre-trip · 14 days", nil, ""),
			sampleTemplate("5", "other", "Apple", nil, ""),
		})
		var got []string
		for _, g := range groups {
			names := make([]string, len(g.Templates))
			for i, x := range g.Templates {
				names[i] = x.Name
			}
			got = append(got, g.Label+": "+strings.Join(names, ", "))
		}
		want := []string{
			"Lead response: Lead response",
			"Pre-trip: Pre-trip · 14 days, Pre-trip · 7 days",
			"Other: Apple, zebra",
		}
		if !slices.Equal(got, want) {
			t.Errorf("groups = %q, want %q", got, want)
		}
	})

	t.Run("an unknown category files under Other rather than vanishing", func(t *testing.T) {
		if got := sampleTemplate("1", "newsletter", "x", nil, "").Category; got != "other" {
			t.Errorf("category = %q", got)
		}
	})

	t.Run("Last edited is the day in the advisor's zone", func(t *testing.T) {
		// 23:30 UTC on the 14th is still the 14th in Chicago.
		if got := sampleTemplate("1", "other", "x", nil, "").LastEditedLabel; got != "Last edited Oct 14" {
			t.Errorf("label = %q", got)
		}
	})

	t.Run("search needs every word, in the name, a tag or the body", func(t *testing.T) {
		x := sampleTemplate("1", "other", "Lead response", []string{"Honeymoon"}, "Thanks for reaching out")
		for _, c := range []struct {
			search string
			want   bool
		}{{"", true}, {"honeymoon thanks", true}, {"lead cruise", false}, {"   ", true}} {
			if got := matchesSearch(x, c.search); got != c.want {
				t.Errorf("matchesSearch(%q) = %v", c.search, got)
			}
		}
	})

	t.Run("tag suggestions are A to Z, first spelling kept", func(t *testing.T) {
		got := knownTags([]messageTemplate{
			sampleTemplate("1", "other", "a", []string{"Beach", "honeymoon"}, ""),
			sampleTemplate("2", "other", "b", []string{"beach", "Cruise"}, ""),
		})
		if !slices.Equal(got, []string{"Beach", "Cruise", "honeymoon"}) {
			t.Errorf("knownTags = %q", got)
		}
	})
}

// The copy helpers that carry a rule in their words.
func TestTemplateCopyHelpers(t *testing.T) {
	t.Run("templateMissing names what the thread lacks in plain words, once each", func(t *testing.T) {
		for _, c := range []struct {
			fields []string
			want   string
		}{
			{[]string{"trip.dates"},
				"This one needs trip dates, which this thread doesn't have. Use Insert & edit to fill them in yourself."},
			{[]string{"trip.name"},
				"This one needs a trip, which this thread doesn't have. Use Insert & edit to fill it in yourself."},
			// payment.label, payment.amount and payment.dueDate are all "a payment": one need,
			// not three.
			{[]string{"payment.label", "payment.amount", "payment.dueDate"},
				"This one needs a payment, which this thread doesn't have. Use Insert & edit to fill it in yourself."},
			{[]string{"trip.dates", "payment.amount"},
				"This one needs trip dates and a payment, which this thread doesn't have. Use Insert & edit to fill them in yourself."},
			{[]string{"trip.name", "trip.dates", "payment.link"},
				"This one needs a trip, trip dates and a pay link, which this thread doesn't have. Use Insert & edit to fill them in yourself."},
		} {
			if got := templateMissing(c.fields); got != c.want {
				t.Errorf("templateMissing(%q) =\n %q\nwant\n %q", c.fields, got, c.want)
			}
		}
	})

	t.Run("templateUnknownFields names each token and counts them", func(t *testing.T) {
		if got := templateUnknownFields([]string{"client.firstname"}); got !=
			"{{client.firstname}} isn't a merge field. Pick from the list under the message." {
			t.Errorf("one = %q", got)
		}
		if got := templateUnknownFields([]string{"a", "b"}); got !=
			"{{a}}, {{b}} aren't merge fields. Pick from the list under the message." {
			t.Errorf("two = %q", got)
		}
	})

	t.Run("templateUnfilled is the reply box's refusal", func(t *testing.T) {
		if got := templateUnfilled([]string{"trip.dates"}); got !=
			"{{trip.dates}} is still in your message, and this thread has no value for it. Fill it in before you send." {
			t.Errorf("one = %q", got)
		}
		if got := templateUnfilled([]string{"trip.dates", "payment.amount"}); got !=
			"{{trip.dates}}, {{payment.amount}} are still in your message, and this thread has no values for them. Fill them in before you send." {
			t.Errorf("two = %q", got)
		}
	})

	t.Run("the picker's preview heading names the client", func(t *testing.T) {
		if got := templatePreviewFor("Maya"); got != "Preview · for Maya" {
			t.Errorf("= %q", got)
		}
	})
}
