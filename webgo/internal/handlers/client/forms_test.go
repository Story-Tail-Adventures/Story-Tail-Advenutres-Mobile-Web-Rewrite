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
		{"/trips/t1/messages", func(hn *harness) {
			seedThread(hn, message("m1", "agent", "Hello", "2026-11-24T16:14:00Z"))
		}},
		{"/messages", seedInbox},
		{"/messages/cv1", seedInbox},
		{"/messages/new", func(*harness) {}},
		{"/trips/t1/update", func(hn *harness) { seedTrip(hn, "proposal") }},
		{"/account", func(*harness) {}},
		{"/account/personal", seedPersonal},
		{"/account/preferences", func(*harness) {}},
		{"/account/connected", func(*harness) {}},
		{"/account/privacy", func(*harness) {}},
		{"/account/close", func(*harness) {}},
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

// --- The thread's two forms, clicked ------------------------------------------------------

// The quick replies are their own form, which the React version does not need: there they
// are type="button" and fill the box from JavaScript. Here they have to work without it, so
// they are real submits — and a real submit inside the compose form would be the button
// Enter presses, which is the defect PR #225 fixed on three wizard screens.
func TestEnterInTheComposeBoxSendsRatherThanPickingAChip(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn)
	c := hn.signedIn()
	body := c.get("/trips/t1/messages").Body.String()

	compose := readForm(t, body, "send-form")
	if len(compose.submits) != 1 {
		t.Fatalf("the compose form has %d submits: %+v", len(compose.submits), compose.submits)
	}
	if _, ok := compose.fields["quick"]; ok {
		t.Error("a quick reply is serialized by the compose form; Enter would pick one")
	}
	// Attach is drawn off and is type="button", so a browser sends nothing for it and it is
	// not a submit at all.
	if _, ok := compose.fields["attach"]; ok {
		t.Error("the disabled attach button is in the post")
	}

	compose.fields.Set("body", "Yes please.")
	rec := c.click(compose, compose.submits[0])
	where(t, rec, http.StatusSeeOther, "/trips/t1/messages")
	if got := hn.f.one(t, "POST /functions/v1/trip-message").Body["body"]; got != "Yes please." {
		t.Errorf("sent %v", got)
	}

	// And the chips post to the same route, where they fill the box instead of sending.
	chips := readForm(t, body, "quick-form")
	if chips.action != compose.action {
		t.Errorf("the chips post to %q, the compose bar to %q", chips.action, compose.action)
	}
	if len(chips.submits) != 4 {
		t.Fatalf("%d chips", len(chips.submits))
	}
	picked := c.click(chips, chips.submits[1])
	if picked.Code != http.StatusOK {
		t.Fatalf("picking a chip = %d", picked.Code)
	}
	if calls := hn.f.seen("POST /functions/v1/trip-message"); len(calls) != 1 {
		t.Errorf("%d sends after picking a chip; it must only fill the box", len(calls))
	}
}

// A refused send hands the draft back INTO the box, so clicking Send again sends the same
// words rather than an empty message.
func TestARefusedSendCanBeRetriedFromTheFormItDrew(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn)
	hn.f.fnReply("trip-message", 503, map[string]any{"error": "upstream"})
	c := hn.signedIn()

	first := readForm(t, c.get("/trips/t1/messages").Body.String(), "send-form")
	first.fields.Set("body", "Yes please, lock it in.")
	refused := c.click(first, first.submits[0])

	again := readForm(t, refused.Body.String(), "send-form")
	if got := again.fields.Get("body"); got != "Yes please, lock it in." {
		t.Fatalf("the box came back holding %q", got)
	}
	hn.f.fnReply("trip-message", 200, map[string]any{"ok": true})
	where(t, c.click(again, again.submits[0]), http.StatusSeeOther, "/trips/t1/messages")
	if calls := hn.f.seen("POST /functions/v1/trip-message"); len(calls) != 2 {
		t.Errorf("%d sends", len(calls))
	}
}
