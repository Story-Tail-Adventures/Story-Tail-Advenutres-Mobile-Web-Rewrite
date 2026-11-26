package client_test

import (
	"net/http"
	"strings"
	"testing"
)

// What a BROWSER does to the traveler's forms. Each test reads the rendered page,
// serializes a form the way a browser would, and clicks ONE button. Hand-built url.Values
// cannot see any of this: they post fields no control writes, in an order no browser
// produces, with whichever op the test happens to name.

// --- Rule: the op goes on the button, never in a hidden field -----------------------------

// A hidden field is serialized in tree order and url.Values.Get returns the first match, so
// a hidden op would silently beat whichever button was pressed.
func TestNoTravelerFormHidesItsOpInAField(t *testing.T) {
	for _, tc := range []struct {
		path string
		seed func(*harness)
	}{
		{"/dashboard", func(hn *harness) { seedPayable(hn, "https://resort.example.com/pay") }},
		{"/trips", func(hn *harness) { seedTrip(hn, "booked") }},
		{"/trips/t1", func(hn *harness) { seedTrip(hn, "booked") }},
		{"/trips/t1/itinerary", seedItinerary},
		{"/trips/t1/documents", seedDocuments},
		{"/documents", seedDocuments},
		{"/trips/t1/memories", func(hn *harness) { seedTrip(hn, "completed") }},
	} {
		hn := newHarness(t)
		tc.seed(hn)
		body := hn.signedIn().get(tc.path).Body.String()
		for _, slot := range formSlots(body) {
			f := readForm(t, body, slot)
			for name := range f.fields {
				for _, b := range f.submits {
					if b.name != "" && name == b.name {
						t.Errorf("%s: form %q hides %q in a field AND on a button; the field wins",
							tc.path, slot, name)
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

// --- A browser only sends what it can see --------------------------------------------------

// The upload buttons are drawn disabled because the screen they belong to is not built. A
// browser sends nothing for a disabled control, so no form may offer one as a real submit.
func TestNoTravelerFormOffersADisabledSubmit(t *testing.T) {
	hn := newHarness(t)
	seedDocuments(hn)
	body := hn.signedIn().get("/trips/t1/documents").Body.String()
	for _, slot := range formSlots(body) {
		f := readForm(t, body, slot)
		for _, b := range f.submits {
			if b.disabled {
				t.Errorf("form %q offers a disabled submit %q=%q", slot, b.name, b.value)
			}
		}
	}
}

// A document row, clicked the way it is drawn: the form's own action names the document, and
// "next" rides along so the signed URL comes back to the page they were on.
func TestADocumentRowOpensWhatItDraws(t *testing.T) {
	hn := newHarness(t)
	seedDocuments(hn)
	c := hn.signedIn()
	// Every row is drawn from one repeat, so they share a slot name; readForm takes the
	// first, which is the first document on the page.
	f := readForm(t, c.get("/trips/t1/documents").Body.String(), "group-rows")
	if !strings.HasSuffix(f.action, "/open") {
		t.Fatalf("action = %q", f.action)
	}
	if got := f.fields.Get("next"); got != "/trips/t1/documents" {
		t.Errorf("next = %q", got)
	}
	rec := c.click(f, f.submits[0])
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("opening a document = %d", rec.Code)
	}
}

// The pay block, clicked the way it is drawn. This is the form worth being strict about: a
// milestone id that did not come from the page would aim the post at another trip, and the
// post itself must stay a MESSAGE (CLAUDE.md rule 4).
func TestThePayBlockPostsWhatItDraws(t *testing.T) {
	hn := newHarness(t)
	seedPayable(hn, "https://resort.example.com/pay")
	c := hn.signedIn()
	f := readForm(t, c.get("/dashboard").Body.String(), "pay-form")
	if f.action != "/trips/t1/paid" {
		t.Errorf("action = %q", f.action)
	}
	if got := f.fields.Get("milestoneId"); got != "m1" {
		t.Errorf("milestoneId = %q", got)
	}
	rec := c.click(f, f.submits[0])
	where(t, rec, http.StatusSeeOther, "/dashboard")
	if got := hn.f.one(t, "POST /functions/v1/trip-message").Body["body"]; got != "I've paid the final payment ($2,410)." {
		t.Errorf("message = %v", got)
	}
	if calls := hn.f.seen("PATCH /rest/v1/payment_milestone"); len(calls) != 0 {
		t.Errorf("%d writes to the milestone; clicking it must mark nothing paid", len(calls))
	}
}

// The click asks for the milestone the PAGE drew, not for "the next one due". A list where
// the button carries only an id and the server falls back to the first row is how a post
// comes to act on a record nobody was looking at; here the id from the form and the trip
// from the path are both in the query, so there is nothing to fall back to.
func TestThePayBlockAsksForTheMilestoneItWasGiven(t *testing.T) {
	hn := newHarness(t)
	seedPayable(hn, "https://resort.example.com/pay")
	c := hn.signedIn()
	f := readForm(t, c.get("/dashboard").Body.String(), "pay-form")
	c.click(f, f.submits[0])

	var read *call
	for _, got := range hn.f.seen("GET /rest/v1/payment_milestone") {
		if got.Query.Get("id") != "" {
			read = &got
		}
	}
	if read == nil {
		t.Fatal("the milestone was never read back")
	}
	if got := read.Query.Get("id"); got != "eq.m1" {
		t.Errorf("id filter = %q, want the one the form carried", got)
	}
	if got := read.Query.Get("trip_id"); got != "eq.t1" {
		t.Errorf("trip_id filter = %q, want the trip in the path", got)
	}
}
