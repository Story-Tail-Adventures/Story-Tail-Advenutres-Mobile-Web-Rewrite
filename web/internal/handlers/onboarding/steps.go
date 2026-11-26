package onboarding

import (
	"fmt"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
)

// The six screens of the wizard, in order — the port of web/lib/onboarding/steps.ts.
//
// Three things have to agree about this list and they are in three different places: the
// rail on desktop, the progress bars on a phone, and the platform_user.onboarding_step
// cursor that decides where an abandoned wizard resumes.
//
// The cursor has five values and the wizard has six screens, and that is not an off-by-one:
// 2.1.9 Welcome is the cover page, and reaching it is the ABSENCE of progress, so its slug
// is empty — the same NULL the column holds before anybody has started.
// supabase/functions/_shared/onboarding.ts holds the server's copy of the five, and the
// CHECK constraint in 20260903230000_onboarding_step.sql is what refuses a typo.

type wizardStep struct {
	// slug is the platform_user.onboarding_step value, empty for the cover page.
	slug  string
	route string
	// rail is the desktop rail's label; pill is the shorter one for the mobile overline.
	rail string
	pill string
}

var wizardSteps = []wizardStep{
	{"", "/welcome", "Welcome", "Welcome"},
	{"profile", "/onboarding/profile", "Profile basics", "Profile"},
	{"preferences", "/onboarding/preferences", "Travel preferences", "Preferences"},
	{"companions", "/onboarding/companions", "Travel companions", "Companions"},
	{"connect", "/onboarding/connect", "Link existing trips", "Existing trips"},
	{"complete", "/onboarding/complete", "All set!", "All set"},
}

// The rail's heading ("WELCOME ABOARD") and the Back label are WIZARD_RAIL_HEADING and
// WIZARD_BACK_LABEL in steps.ts. They are static copy, so each step page carries them in its
// own HTML rather than Go filling a slot with a constant — the same split every other page
// in web makes. The rail LABELS are above, because which one is current changes per page.

// stepIndex is where a cursor slug sits in the wizard. It panics on a slug that is not one,
// which can only be a typo in this package: the five values are a closed set.
func stepIndex(slug string) int {
	for i, s := range wizardSteps {
		if s.slug == slug {
			return i
		}
	}
	panic("onboarding: unknown step " + slug)
}

// nextStep is the step after this one: its slug for the cursor, and its route.
func nextStep(index int) (slug, route string) {
	n := wizardSteps[index+1]
	return n.slug, n.route
}

// previousRoute is the step before this one, or "" on the cover page. Going back is
// NAVIGATION and never moves the cursor: rewinding it would mean an abandoned wizard resumed
// at a step the traveler had already worked past.
func previousRoute(index int) string {
	if index <= 0 {
		return ""
	}
	return wizardSteps[index-1].route
}

// stepOverline is "STEP 02 OF 06": zero-padded and 1-based, matching both artboards. The
// index is 0-based because it indexes wizardSteps; the label is 1-based because it is for a
// person.
func stepOverline(index int) string {
	return fmt.Sprintf("STEP %02d OF %02d", index+1, len(wizardSteps))
}

// chromeSlots are the wizard chrome's slots, carried by each of the four step pages (the
// cover page and the summary have no chrome). barSlot is one progress bar; the rail is a
// repeat, so its rows are declared with it.
func chromeSlots() []string {
	out := []string{"pill-overline", "overline", "step-count", "back", "skip"}
	for i := range wizardSteps {
		out = append(out, barSlot(i))
	}
	return out
}

// chromeRepeats is the rail's one repeat and the slots inside each of its rows.
var chromeRepeats = map[string][]string{
	"rail": {"mark", "done", "done-label", "todo"},
}

func barSlot(i int) string { return fmt.Sprintf("bar-%d", i+1) }

// fillChrome fills the wizard chrome for the step at index: the rail, the bars, the two
// overlines and the Back link. A step with nothing to skip passes skip false, and the skip
// button leaves the page rather than sitting there doing nothing.
func fillChrome(d *page.Doc, index int, skip bool) {
	d.Repeat("rail", len(wizardSteps), func(i int, r *page.Row) {
		step := wizardSteps[i]
		done, current := i < index, i == index
		r.Keep("mark")
		r.Class("mark", "is-done", done)
		r.Class("mark", "is-current", current)
		if done {
			// Pattern G (§4.3): a traveler can jump back to a completed step. The prototype
			// draws these as inert text, which leaves somebody who mistyped their phone
			// number on the previous step with no way back to it.
			r.URL("done", "href", step.route)
			r.Text("done-label", step.rail)
			r.Remove("todo")
			return
		}
		r.Remove("done")
		r.Text("todo", step.rail)
		if current {
			r.Attr("todo", "aria-current", "step")
		}
	})

	for i := range wizardSteps {
		slot := barSlot(i)
		d.Keep(slot)
		d.Class(slot, "is-done", i < index)
		d.Class(slot, "is-current", i == index)
	}

	overline := stepOverline(index)
	d.Text("overline", overline)
	d.Text("pill-overline", overline+" · "+upper(wizardSteps[index].pill))
	d.Text("step-count", fmt.Sprintf("Step %d of %d", index+1, len(wizardSteps)))

	if back := previousRoute(index); back != "" {
		d.URL("back", "href", back)
	} else {
		d.Remove("back")
	}
	if skip {
		d.Keep("skip")
	} else {
		d.Remove("skip")
	}
}

// upper is ASCII upper-casing for the four pill labels, which are ASCII.
func upper(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'a' && b[i] <= 'z' {
			b[i] -= 'a' - 'A'
		}
	}
	return string(b)
}
