package trips_test

import (
	"net/url"
	"strings"
	"testing"
)

const tripID = "0195a2c0-1a00-7000-8000-000000000110"

const overviewJSON = `[{"trip_id":"` + tripID + `","client_id":"c-1","client_display_name":"Jordan Hayes",
 "title":"Anniversary <Week>","trip_type":"all_inclusive","status":"booked","start_date":"2027-01-13","end_date":"2027-01-20",
 "destinations":["Negril","Montego Bay"],"traveler_count":2,"total_value_cents":"1284500","total_paid_cents":"256000",
 "total_commission_cents":"131800","currency":"USD","cancellation_reason":null,"refund_status":null,"refund_detail":null,
 "notes":"Window seat <please>","version":7,"last_activity_at":"2026-09-08T00:30:00+00:00","component_count":4,
 "manual_component_count":4,"api_component_count":0,"as_of_date":"2026-09-07","next_unpaid_due_date":"2026-09-14"}]`

const paymentsJSON = `[
 {"milestone_id":"m-1","kind":"deposit","label":"Deposit","amount_cents":"100000","paid_cents":"100000","currency":"USD","due_date":"2026-08-01","paid_at":"2026-08-01T10:00:00Z","status":"paid","order_index":0,"pay_url":null,"paid_reference":null,"paid_note":"left a voicemail"},
 {"milestone_id":"m-2","kind":"final","label":"Final balance","amount_cents":"1184500","paid_cents":"0","currency":"USD","due_date":"2026-09-14","paid_at":null,"status":"scheduled","order_index":1,"pay_url":"https://www.sandals.com/pay/x","paid_reference":null,"paid_note":null}]`

const linesJSON = `[{"commission_id":"0195a2c0-1a00-7000-8000-00000000c001","supplier_name":"Sandals","status":"expected","expected_commission_cents":"131800","currency":"USD","version":3}]`

func detailApp(t *testing.T) *app {
	a := newApp(t)
	a.fake.read("agent_trip_overview", overviewJSON)
	a.fake.read("agent_trip_payments", paymentsJSON)
	a.fake.read("agent_trip_open_commission", linesJSON)
	return a
}

func readNames(a *app) []string {
	a.fake.mu.Lock()
	defer a.fake.mu.Unlock()
	var out []string
	for _, r := range a.fake.readLog {
		out = append(out, r.name)
	}
	return out
}

func TestTripDetailOverview(t *testing.T) {
	a := detailApp(t)
	rec := a.get("/agent/trips/" + tripID)
	if rec.Code != 200 {
		t.Fatalf("status %d\n%s", rec.Code, rec.Body)
	}
	has(t, rec,
		"<title>Trip · Story-Tail Adventures</title>",
		"Anniversary &lt;Week&gt;", "Jordan Hayes",
		// The header's chip reads the real milestone: a final payment due in 7 days.
		"status-chip status-due", "Final payment due",
		`href="/agent/trips/`+tripID+`/builder"`,
		`action="/agent/trips/`+tripID+`/stage"`, `name="expectedVersion" value="7"`,
		`value="booked" data-slot="stage-opt" selected=""`,
		// The overview tab is current; the tab links are one URL each.
		`href="/agent/trips/`+tripID+`?tab=components"`, `aria-current="page"`,
		// At a glance.
		">All-inclusive<", "Negril, Montego Bay", "2 travelers", "Jan 13 – Jan 20", "Sep 07",
		// The side cards.
		"$12,845", "$2,560", "$1,318", `href="/agent/commission/ledger?trip=`+tripID+`"`,
		"Final balance · Sep 14", "$11,845",
		// The cancel dialog: impact derived from this trip, the open line offered as Lost.
		"Commission expected drops by $1,318 — a cancelled trip leaves the forecast.",
		"$2,560 is recorded as paid.", "4 booked items stay on the trip.",
		"Sandals · Expected · $1,318", `value="0195a2c0-1a00-7000-8000-00000000c001:3"`, "Mark this line as Lost",
	)
	lacks(t, rec, "Cancellation reason", "Refund status", "left a voicemail", "sandals.com/pay", "No such trip")
	// Every tab reads the header's three, and the overview tab nothing more.
	for _, n := range readNames(a) {
		switch n {
		case "agent_trip_overview", "agent_trip_payments", "agent_trip_open_commission":
		default:
			t.Errorf("the overview tab read %s", n)
		}
	}
	jsonEq(t, a.fake.lastRead(t, "agent_trip_overview"), "p_trip_id", `"`+tripID+`"`)
}

func TestTripDetailTabsReadOnlyTheirOwn(t *testing.T) {
	cases := map[string]struct {
		read, body string
		want       []string
	}{
		"components": {"agent_trip_components", `[{"component_id":"k1","kind":"flight","display_name":"MBJ → JFK","supplier_id":null,"supplier_name":null,"start_date":"2027-01-20","end_date":null,"start_time":"15:05:00","end_time":null,"location":"Montego Bay","confirmation_number":"ABC123","cost_cents":"84000","commission_pct":10.5,"commission_cents":"8400","currency":"USD","api_source":null,"payload":{"airline":"JetBlue"},"order_index":0}]`,
			[]string{"MBJ → JFK", "Jan 20 · 15:05 · Montego Bay", ">Manual<", "$840", "#plane", "Edit components"}},
		"itinerary": {"agent_trip_itinerary_days", `[{"day_id":"d1","day_number":1,"date":"2027-01-13","day_label":"Arrival","day_summary":"Land and rest.","activity_id":"a1","block":"afternoon","start_time":"15:00:00","end_time":null,"activity_title":"Check in","activity_body":null,"location":null,"address":null,"phone":null,"confirmation_number":null,"gyasis_tip":"Ask for the sunset side.","component_id":null,"activity_order":0},{"day_id":"d2","day_number":2,"date":null,"day_label":null,"day_summary":null,"activity_id":null}]`,
			[]string{"Day 1", "Arrival", "Jan 13", "Land and rest.", "AFTERNOON", "15:00 · Check in", "Ask for the sunset side.", "Day 2", "trp-it-gap-16", "trp-it-end-24", ">Published<"}},
		"documents": {"agent_trip_documents", `[{"document_id":"x","owner_user_id":"u","kind":"passport","filename":"passport.pdf","mime_type":"application/pdf","size_bytes":"245760","is_sensitive":true,"created_at":"2026-09-08T00:30:00Z"}]`,
			[]string{"passport.pdf", "Passport · 240 KB · Sep 07"}},
		"messages": {"agent_trip_messages", `[{"message_id":"x","sender_role":"client","body":"Can we <b>move</b> dinner?","created_at":"2026-09-07T15:00:00Z","is_internal_note":false},{"message_id":"y","sender_role":"agent","body":"Noted","created_at":"2026-09-07T15:00:00Z","is_internal_note":true}]`,
			[]string{"Can we &lt;b&gt;move&lt;/b&gt; dinner?", ">Client<", ">You<", "Internal note", `href="/agent/messages/new?client=c-1&amp;trip=` + tripID + `"`}},
		"activity": {"agent_trip_activity", `[{"history_id":"h","from_status":"proposal","to_status":"booked","changed_at":"2026-09-07T15:00:00Z","changed_by_name":null}]`,
			[]string{"Proposal ready → Booked", ">System<"}},
	}
	for tab, c := range cases {
		a := detailApp(t)
		a.fake.read(c.read, c.body)
		a.fake.read("agent_trip_itinerary_meta", `[{"itinerary_id":"i","cover_image_url":null,"intro_note":null,"closing_note":null,"published_at":"2026-09-01T00:00:00Z","last_published_at":null}]`)
		rec := a.get("/agent/trips/" + tripID + "?tab=" + tab)
		if rec.Code != 200 {
			t.Fatalf("%s: status %d", tab, rec.Code)
		}
		has(t, rec, c.want...)
		lacks(t, rec, ">All-inclusive<", "That didn’t load")
		for _, n := range readNames(a) {
			if strings.HasPrefix(n, "agent_trip_") && n != c.read && n != "agent_trip_overview" && n != "agent_trip_payments" &&
				n != "agent_trip_open_commission" && !(tab == "itinerary" && n == "agent_trip_itinerary_meta") {
				t.Errorf("%s tab also read %s", tab, n)
			}
		}
	}

	// The payments tab is the full schedule, paid rows included, and links to the editor.
	a := detailApp(t)
	rec := a.get("/agent/trips/" + tripID + "?tab=payments")
	has(t, rec, "Deposit · Paid", "trp-dot-good", "Edit schedule", `href="/agent/trips/`+tripID+`/payments"`)
	lacks(t, rec, "left a voicemail")

	// An unknown tab is the overview.
	has(t, a.get("/agent/trips/"+tripID+"?tab=bogus"), ">All-inclusive<")
}

func TestTripDetailStates(t *testing.T) {
	a := detailApp(t)
	// Not there (or another advisor's): TripNotFound, and a real 404.
	a.fake.read("agent_trip_overview", `[]`)
	rec := a.get("/agent/trips/" + tripID)
	if rec.Code != 404 {
		t.Errorf("not found = %d", rec.Code)
	}
	has(t, rec, "No such trip", "It may have been deleted, or it belongs to another advisor.", "Back to the worklist")
	lacks(t, rec, "That didn’t load")

	// Not a uuid: not found, and the database is not asked.
	b := detailApp(t)
	if rec := b.get("/agent/trips/not-a-trip"); rec.Code != 404 || len(readNames(b)) != 0 {
		t.Errorf("bad id = %d, reads %v", rec.Code, readNames(b))
	}

	// A failed overview or payments read is the retry state.
	c := detailApp(t)
	c.fake.reads["agent_trip_payments"] = reply{500, `{}`}
	has(t, c.get("/agent/trips/"+tripID+"?tab=notes"), "That didn’t load", `href="/agent/trips/`+tripID+`?tab=notes"`)

	// A failed tab read keeps the header and says so in the tab.
	e := detailApp(t)
	e.fake.reads["agent_trip_components"] = reply{500, `{}`}
	rec = e.get("/agent/trips/" + tripID + "?tab=components")
	has(t, rec, "That didn’t load", "Anniversary &lt;Week&gt;", "Cost &amp; commission")
	lacks(t, rec, "Edit components")

	// A failed open-commission read never fails the page; the dialog says it could not check.
	f := detailApp(t)
	f.fake.reads["agent_trip_open_commission"] = reply{500, `{}`}
	has(t, f.get("/agent/trips/"+tripID), "We couldn&#39;t check this trip&#39;s commission lines just now")
}

func TestTripStageChange(t *testing.T) {
	a := detailApp(t)
	a.fake.fn("agent-trip-status", reply{200, `{"status":"in_progress","version":8}`})
	rec := a.post("/agent/trips/"+tripID+"/stage", url.Values{"status": {"in_progress"}, "expectedVersion": {"7"}, "tab": {"notes"}})
	if rec.Code != 303 || rec.Header().Get("Location") != "/agent/trips/"+tripID+"?tab=notes" {
		t.Fatalf("stage = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	sent := a.fake.calls("agent-trip-status")[0].body
	jsonEq(t, sent, "tripId", `"`+tripID+`"`)
	jsonEq(t, sent, "status", `"in_progress"`)
	jsonEq(t, sent, "expectedVersion", `7`)

	// The 409 is read from the status, never the words: a reworded sentence still says ours.
	a.fake.fn("agent-trip-status", reply{409, `{"type":"about:blank","title":"Conflict","status":409,"detail":"Something else entirely."}`})
	rec = a.post("/agent/trips/"+tripID+"/stage", url.Values{"status": {"completed"}, "expectedVersion": {"7"}})
	if rec.Code != 409 {
		t.Errorf("stale = %d", rec.Code)
	}
	has(t, rec, "This trip moved since the board was loaded. Reload and try again.")
	lacks(t, rec, "Something else entirely.")

	// Any other refusal is the function's own sentence.
	a.fake.fn("agent-trip-status", reply{422, `{"type":"about:blank","title":"x","status":422,"detail":"A completed trip needs dates."}`})
	rec = a.post("/agent/trips/"+tripID+"/stage", url.Values{"status": {"completed"}, "expectedVersion": {"7"}})
	if rec.Code != 422 {
		t.Errorf("rejected = %d", rec.Code)
	}
	has(t, rec, "A completed trip needs dates.")

	// Cancelled is not a stage the menu moves to; a bad version is not sent.
	n := len(a.fake.calls("agent-trip-status"))
	for _, f := range []url.Values{{"status": {"cancelled"}, "expectedVersion": {"7"}}, {"status": {"booked"}, "expectedVersion": {"x"}}} {
		if rec := a.post("/agent/trips/"+tripID+"/stage", f); rec.Code != 422 {
			t.Errorf("%v = %d", f, rec.Code)
		}
	}
	if len(a.fake.calls("agent-trip-status")) != n {
		t.Error("a refused stage was sent")
	}
	// The same stage is no change at all.
	if rec := a.post("/agent/trips/"+tripID+"/stage", url.Values{"status": {"booked"}, "from": {"booked"}, "expectedVersion": {"7"}}); rec.Code != 303 || len(a.fake.calls("agent-trip-status")) != n {
		t.Errorf("same stage = %d", rec.Code)
	}
}

func TestTripNotes(t *testing.T) {
	a := detailApp(t)
	has(t, a.get("/agent/trips/"+tripID+"?tab=notes"), "Window seat &lt;please&gt;</textarea>", `name="expectedVersion" value="7"`)

	a.fake.fn("agent-trip-notes", reply{200, `{"version":8}`})
	rec := a.post("/agent/trips/"+tripID+"/notes", url.Values{"notes": {"  Late check-out  "}, "expectedVersion": {"7"}})
	if rec.Code != 303 || rec.Header().Get("Location") != "/agent/trips/"+tripID+"?tab=notes&noted=1" {
		t.Fatalf("notes = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	jsonEq(t, a.fake.calls("agent-trip-notes")[0].body, "notes", `"  Late check-out  "`) // sent as typed
	has(t, a.get("/agent/trips/"+tripID+"?tab=notes&noted=1"), ">Saved<")

	a.fake.fn("agent-trip-notes", reply{409, `{"detail":"x"}`})
	rec = a.post("/agent/trips/"+tripID+"/notes", url.Values{"notes": {"Mine"}, "expectedVersion": {"7"}})
	if rec.Code != 409 {
		t.Errorf("stale notes = %d", rec.Code)
	}
	// What was typed stays, and the save stops offering a write that can only fail.
	has(t, rec, "This trip changed since you opened it. Reload and try again.", "Mine</textarea>", `data-slot="notes-save" disabled=""`)
}

func TestTripCancel(t *testing.T) {
	a := detailApp(t)
	a.fake.fn("agent-trip-status", reply{200, `{"status":"cancelled","commissionLinesClosed":1,"commissionLinesSkipped":0}`})
	rec := a.post("/agent/trips/"+tripID+"/cancel", url.Values{
		"reason": {" Family schedule conflict "}, "refundStatus": {"pending"}, "refundDetail": {"  "},
		"closeLines": {"1"}, "line": {"0195a2c0-1a00-7000-8000-00000000c001:3"}, "expectedVersion": {"7"}, "tab": {"payments"},
	})
	if rec.Code != 303 {
		t.Fatalf("cancel = %d\n%s", rec.Code, rec.Body)
	}
	loc := rec.Header().Get("Location")
	if loc != "/agent/trips/"+tripID+"?tab=payments&cancelled=1&closed=1&named=1&skipped=0" {
		t.Errorf("cancel redirect = %q", loc)
	}
	sent := a.fake.calls("agent-trip-status")[0].body
	jsonEq(t, sent, "status", `"cancelled"`)
	jsonEq(t, sent, "cancellationReason", `"Family schedule conflict"`)
	jsonEq(t, sent, "refundStatus", `"pending"`)
	jsonEq(t, sent, "closeCommission", `[{"id":"0195a2c0-1a00-7000-8000-00000000c001","version":3}]`)
	if _, ok := sent["refundDetail"]; ok {
		t.Error("an empty refund detail was sent; omitted means leave it alone")
	}
	// The receipt comes back in the dialog, open.
	has(t, a.get(loc), "Trip cancelled. 1 commission line marked Lost.", `data-slot="cancel-dialog" aria-label="Cancel trip" open=""`)

	// Unticked: no lines are named, and the dialog simply closes.
	a.fake.fn("agent-trip-status", reply{200, `{"status":"cancelled"}`})
	rec = a.post("/agent/trips/"+tripID+"/cancel", url.Values{"reason": {"R"},
		"line": {"0195a2c0-1a00-7000-8000-00000000c001:3"}, "expectedVersion": {"7"}})
	if rec.Header().Get("Location") != "/agent/trips/"+tripID {
		t.Errorf("unticked = %q", rec.Header().Get("Location"))
	}
	sent = a.fake.calls("agent-trip-status")[1].body
	for _, k := range []string{"closeCommission", "refundStatus"} {
		if _, ok := sent[k]; ok {
			t.Errorf("%s sent", k)
		}
	}

	// Stale: our sentence, the dialog back open with what was typed.
	a.fake.fn("agent-trip-status", reply{409, `{"detail":"x"}`})
	rec = a.post("/agent/trips/"+tripID+"/cancel", url.Values{"reason": {"Typed reason"}, "refundDetail": {"Refunded $10"}, "expectedVersion": {"7"}})
	if rec.Code != 409 {
		t.Errorf("stale cancel = %d", rec.Code)
	}
	has(t, rec, "This trip moved since the page loaded. Reload and try again.", "Typed reason</textarea>", `value="Refunded $10"`, `data-slot="cancel-dialog" aria-label="Cancel trip" open=""`)

	// A forged line is refused before anything is sent.
	n := len(a.fake.calls("agent-trip-status"))
	rec = a.post("/agent/trips/"+tripID+"/cancel", url.Values{"reason": {"R"}, "closeLines": {"1"}, "line": {"not-a-uuid:3"}, "expectedVersion": {"7"}})
	if rec.Code != 422 || len(a.fake.calls("agent-trip-status")) != n {
		t.Errorf("forged line = %d", rec.Code)
	}
}

func TestTripCancelledReadsAsSaveDetails(t *testing.T) {
	a := detailApp(t)
	a.fake.read("agent_trip_overview", strings.Replace(strings.Replace(strings.Replace(overviewJSON,
		`"status":"booked"`, `"status":"cancelled"`, 1),
		`"cancellation_reason":null,"refund_status":null`, `"cancellation_reason":"Family schedule conflict","refund_status":"partial"`, 1),
		`"refund_detail":null`, `"refund_detail":"Refunded $1,640 on Feb 12"`, 1))
	rec := a.get("/agent/trips/" + tripID)
	has(t, rec, "status-cancelled", "Cancellation reason", "Family schedule conflict", "Refund status", ">Partial<",
		"Refunded $1,640 on Feb 12", "CANCELLATION DETAILS", "Correct what the client reads.", `name="editing" value="1"`,
		`value="partial" data-slot="refund-opt" selected=""`)
	lacks(t, rec, "WHAT THIS CHANGES")
	// "Mark these as Lost" is off on Save details.
	lacks(t, rec, `data-slot="cancel-close" checked=""`)
}

func TestTripSaveAsTemplate(t *testing.T) {
	a := detailApp(t)
	has(t, a.get("/agent/trips/"+tripID), `name="name" required="" placeholder="e.g. Sandals Negril · 7 nights" data-trp-required="" data-slot="save-name" value="Anniversary &lt;Week&gt;"`)
	a.fake.fn("agent-template", reply{200, `{"templateId":"t","componentsSaved":6,"daysSaved":4}`})
	rec := a.post("/agent/trips/"+tripID+"/save-template", url.Values{"name": {" Negril 7n "}, "description": {""}})
	if loc := rec.Header().Get("Location"); rec.Code != 303 || loc != "/agent/trips/"+tripID+"?bookings=6&days=4&saved=1" {
		t.Fatalf("save = %d %q", rec.Code, loc)
	}
	sent := a.fake.calls("agent-template")[0].body
	jsonEq(t, sent, "op", `"save"`)
	jsonEq(t, sent, "name", `"Negril 7n"`)
	if _, ok := sent["description"]; ok {
		t.Error("an empty description was sent")
	}
	has(t, a.get("/agent/trips/"+tripID+"?bookings=6&days=4&saved=1"), "Saved. 6 bookings and 4 days captured.", `data-slot="save-dialog" open=""`)

	if rec := a.post("/agent/trips/"+tripID+"/save-template", url.Values{"name": {"  "}}); rec.Code != 422 {
		t.Errorf("no name = %d", rec.Code)
	} else {
		has(t, rec, "A template needs a name.")
	}
	a.fake.fn("agent-template", reply{400, `{"detail":"You already have a template with that name."}`})
	has(t, a.post("/agent/trips/"+tripID+"/save-template", url.Values{"name": {"Dup"}}), "You already have a template with that name.", `value="Dup"`)
}

// Review findings (PR 2), each pinned.
func TestTripDetailReviewFindings(t *testing.T) {
	// An admin's write sends nothing, on all four.
	a := detailApp(t)
	a.fake.role = "admin"
	for _, path := range []string{"stage", "notes", "cancel", "save-template"} {
		rec := a.post("/agent/trips/"+tripID+"/"+path, url.Values{"status": {"completed"}, "expectedVersion": {"7"}, "reason": {"R"}, "name": {"N"}, "notes": {"N"}})
		if rec.Code != 403 {
			t.Errorf("admin %s = %d", path, rec.Code)
		}
	}
	if n := len(a.fake.calls("agent-trip-status")) + len(a.fake.calls("agent-trip-notes")) + len(a.fake.calls("agent-template")); n != 0 {
		t.Errorf("an admin's posts sent %d calls", n)
	}

	// After a refused post, "Try again" and the sign-in return are the tab's own GET URL.
	b := detailApp(t)
	b.fake.reads["agent_trip_components"] = reply{500, `{}`}
	b.fake.fn("agent-trip-status", reply{409, `{"detail":"x"}`}, reply{401, ``})
	rec := b.post("/agent/trips/"+tripID+"/stage", url.Values{"status": {"completed"}, "expectedVersion": {"7"}, "tab": {"components"}})
	has(t, rec, `data-slot="tab-retry" href="/agent/trips/`+tripID+`?tab=components"`)
	lacks(t, rec, `href="/agent/trips/`+tripID+`/stage"`)
	rec = b.post("/agent/trips/"+tripID+"/stage", url.Values{"status": {"completed"}, "expectedVersion": {"7"}, "tab": {"components"}})
	if loc := rec.Header().Get("Location"); loc != "/login?next="+url.QueryEscape("/agent/trips/"+tripID+"?tab=components") {
		t.Errorf("sign-in return = %q", loc)
	}

	// Every document kind has its label.
	c := detailApp(t)
	c.fake.read("agent_trip_documents", `[{"document_id":"x","kind":"pdf_proposal","filename":"p.pdf","size_bytes":"245760","is_sensitive":false,"created_at":"2026-09-08T00:30:00Z"},{"document_id":"y","kind":"other","filename":"o.pdf","size_bytes":"1","is_sensitive":false,"created_at":"2026-09-08T00:30:00Z"}]`)
	has(t, c.get("/agent/trips/"+tripID+"?tab=documents"), "Proposal PDF · 240 KB · Sep 07", "Other · 1 B")

	// A textarea's CRLF is sent as the LF Next sent.
	c.fake.fn("agent-trip-notes", reply{200, `{"version":8}`})
	c.post("/agent/trips/"+tripID+"/notes", url.Values{"notes": {"Line one\r\nLine two"}, "expectedVersion": {"7"}})
	jsonEq(t, c.fake.calls("agent-trip-notes")[0].body, "notes", `"Line one\nLine two"`)
	c.fake.fn("agent-trip-status", reply{200, `{}`}, reply{400, `{"detail":"Unknown refund status."}`})
	c.post("/agent/trips/"+tripID+"/cancel", url.Values{"reason": {"Two\r\nlines"}, "expectedVersion": {"7"}})
	jsonEq(t, c.fake.calls("agent-trip-status")[0].body, "cancellationReason", `"Two\nlines"`)
	// A refund status outside the vocabulary is sent, and the function's refusal shown.
	has(t, c.post("/agent/trips/"+tripID+"/cancel", url.Values{"reason": {"R"}, "refundStatus": {"maybe"}, "expectedVersion": {"7"}}), "Unknown refund status.")

	// The stage form posts the stage it showed, so the same stage is no change.
	page := c.get("/agent/trips/" + tripID).Body.String()
	if !strings.Contains(page, `name="from" value="booked"`) {
		t.Error("the stage form does not post its current stage")
	}
	// The save dialog says a template needs a name only while the name is blank.
	has(t, c.get("/agent/trips/"+tripID), `data-slot="save-name-hint" hidden=""`)
	has(t, c.post("/agent/trips/"+tripID+"/save-template", url.Values{"name": {" "}}), "A template needs a name.")
}
