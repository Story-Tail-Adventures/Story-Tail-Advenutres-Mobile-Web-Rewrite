package onboarding_test

import (
	"net/http"
	"strings"
	"testing"
)

// What a BROWSER does to the wizard's forms.
//
// Every test here reads the rendered page, serializes the form as a browser would, and
// clicks ONE button. Hand-built url.Values cannot see any of this: they post fields no
// control writes, in an order no browser produces, with whichever op the test happens to
// name. All four defects below passed a green handler test.

// --- Rule: the first submit is the one Enter presses, so it must be the safe one ----------

// 2.1.9's first button used to be "Skip the tour" — the one action that ends the wizard for
// good. Enter is not how somebody means to decline the tour.
func TestEnterOnWelcomeStartsTheWizardRatherThanEndingIt(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	f := readForm(t, c.get("/welcome").Body.String(), "welcome-actions")
	if got := f.submits[0].value; got != "start" {
		t.Fatalf("the default button is %q; Enter would %s the wizard", got, got)
	}
	rec := c.click(f, f.submits[0])
	where(t, rec, http.StatusSeeOther, "/onboarding/profile")
	if got := hn.f.one(t, "POST /functions/v1/onboarding-step").Body["step"]; got != "profile" {
		t.Errorf("the cursor moved to %v", got)
	}
}

// 2.1.10's first button used to be "Update the labels for this country", so Enter in any of
// its fields re-rendered the form instead of saving it.
func TestEnterOnProfileSaves(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	f := readForm(t, c.get("/onboarding/profile").Body.String(), "profile-form")
	if got := f.submits[0].value; got != "save" {
		t.Fatalf("the default button is %q, so Enter does not save", got)
	}
	f.fields.Set("phone", "(305) 555-0184")
	rec := c.click(f, f.submits[0])
	where(t, rec, http.StatusSeeOther, "/onboarding/preferences")
	if got := hn.f.one(t, "POST /functions/v1/onboarding-profile").Body["phone"]; got != "+13055550184" {
		t.Errorf("phone = %v", got)
	}
}

// 2.1.11's first button used to be "Add another" loyalty row.
func TestEnterOnPreferencesSaves(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	f := readForm(t, c.get("/onboarding/preferences").Body.String(), "preferences-form")
	if got := f.submits[0].value; got != "save" {
		t.Fatalf("the default button is %q, so Enter does not save", got)
	}
	rec := c.click(f, f.submits[0])
	where(t, rec, http.StatusSeeOther, "/onboarding/companions")
	if calls := hn.f.seen("POST /functions/v1/onboarding-preferences"); len(calls) != 1 {
		t.Errorf("%d saves", len(calls))
	}
}

// The wizard's other two step forms were already in the right order; this keeps them there.
func TestEveryWizardFormsDefaultButtonIsTheSafeOne(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	for _, tc := range []struct{ path, slot, want string }{
		{"/onboarding/companions", "companions-actions", "continue"},
		{"/onboarding/connect", "connect-form", "save"},
	} {
		f := readForm(t, c.get(tc.path).Body.String(), tc.slot)
		if got := f.submits[0].value; got != tc.want {
			t.Errorf("%s: the default button is %q, want %q", tc.path, got, tc.want)
		}
	}
}

// --- Rule: the op goes on the button, never in a hidden field -----------------------------

// A hidden field is serialized in tree order and url.Values.Get returns the first match, so
// a hidden op silently beats whichever button was pressed. 2.1.12 carried one.
func TestNoWizardFormHidesItsOpInAField(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("companion", map[string]any{
		"id": "c-1", "first_name": "Sam", "last_name": "Hayes", "relationship": nil,
		"date_of_birth": nil, "passport_expiry": nil, "passport_country": nil,
	})
	c := hn.signedIn()
	for _, path := range []string{
		"/welcome", "/onboarding/profile", "/onboarding/preferences",
		"/onboarding/companions", "/onboarding/companions?edit=c-1", "/onboarding/connect",
		"/onboarding/complete",
	} {
		body := c.get(path).Body.String()
		for _, slot := range formSlots(body) {
			f := readForm(t, body, slot)
			for name := range f.fields {
				for _, b := range f.submits {
					if b.name != "" && name == b.name {
						t.Errorf("%s: form %q hides %q in a field AND on a button; the field wins",
							path, slot, name)
					}
				}
			}
		}
	}
}

// formSlots lists the data-slot names of every form on a page.
func formSlots(body string) []string {
	var out []string
	for _, chunk := range strings.Split(body, "<form")[1:] {
		tag := chunk
		if i := strings.Index(tag, ">"); i >= 0 {
			tag = tag[:i]
		}
		const key = `data-slot="`
		if i := strings.Index(tag, key); i >= 0 {
			rest := tag[i+len(key):]
			if j := strings.Index(rest, `"`); j >= 0 {
				out = append(out, rest[:j])
			}
		}
	}
	return out
}

// --- Rule: a form posts to its ACTION, which must carry the query it was rendered with ----

// The companion editor is a URL (?edit=<id>). Its form must post back to that same URL, or a
// refused save renders the ADD form and the traveler's edits are gone.
func TestTheCompanionEditorPostsBackToItself(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("companion", map[string]any{
		"id": "c-1", "first_name": "Sam", "last_name": "Hayes", "relationship": nil,
		"date_of_birth": nil, "passport_expiry": nil, "passport_country": nil,
	})
	c := hn.signedIn()
	f := readForm(t, c.get("/onboarding/companions?edit=c-1").Body.String(), "form")

	// The id travels in the form, so the post edits that companion and not a new one.
	if got := f.fields.Get("id"); got != "c-1" {
		t.Errorf("the form carries id=%q", got)
	}
	f.fields.Set("lastName", "")
	rec := c.click(f, f.submitNamed(t, "save"))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a refused save = %d", rec.Code)
	}
	// The refusal comes back as the EDIT form, with what they typed still in it.
	has(t, rec, "Edit Sam Hayes", `value="Sam"`,
		esc("And their last name — suppliers need both for ticketing"))
}
