package people

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The worklist and calendar through the real gate and session, against a fake Supabase.

func kpiJSON(over map[string]any) string {
	row := map[string]any{
		"agent_id": "a1", "as_of_date": "2026-09-21", "currency": "USD",
		"pipeline_value_cents": "1250000", "booked_month_cents": "748000", "commission_expected_cents": "94000",
		"commission_weighted_cents": "61000", "commission_confidence_pct": 65, "inquiry_to_book_days": 12.0,
		"inquiry_to_book_sample": 4, "active_client_count": 7, "active_trip_count": 3, "new_inquiry_count": 2,
		"unread_message_count": 1,
	}
	for k, v := range over {
		row[k] = v
	}
	return mustJSON([]map[string]any{row})
}

func boardJSON() string {
	return mustJSON([]map[string]any{
		{"trip_id": "t-prop", "client_id": "c1", "client_display_name": "Maya & Daniel Carter", "title": "Cabo, Four Nights",
			"trip_type": "leisure", "status": "proposal", "status_changed_at": "2026-09-01T12:00:00+00:00",
			"start_date": "2026-09-29", "end_date": "2026-10-03", "total_value_cents": "500000", "currency": "USD", "version": 1,
			"proposal_sent_at": "2026-09-10T12:00:00+00:00", "proposal_viewed_at": nil},
		{"trip_id": "t-inq", "client_id": "c2", "client_display_name": "<script>alert(1)</script>", "title": "Tokyo",
			"trip_type": "leisure", "status": "inquiry", "status_changed_at": "2026-09-19T15:00:00Z",
			"total_value_cents": "0", "currency": "USD", "version": 1},
		{"trip_id": "t-gone", "client_id": "c3", "client_display_name": "Cancelled Family", "title": "Nowhere",
			"trip_type": "leisure", "status": "cancelled", "status_changed_at": "2026-09-01T12:00:00Z",
			"start_date": "2026-09-25", "end_date": "2026-09-28", "total_value_cents": "100", "currency": "USD", "version": 1},
	})
}

func dueJSON() string {
	return mustJSON([]map[string]any{
		{"milestone_id": "m1", "trip_id": "t-prop", "trip_title": "Cabo, Four Nights", "client_id": "c1",
			"client_display_name": "Maya & Daniel Carter", "kind": "supplier", "label": "Final balance",
			"amount_cents": "250000", "paid_cents": "0", "currency": "USD", "due_date": "2026-09-19", "status": "overdue", "days_until": -2},
		{"milestone_id": "m-gone", "trip_id": "t-gone", "trip_title": "Nowhere", "client_id": "c3",
			"client_display_name": "Cancelled Family", "kind": "supplier", "label": "Deposit",
			"amount_cents": "1000", "paid_cents": "0", "currency": "USD", "due_date": "2026-09-23", "status": "scheduled", "days_until": 2},
	})
}

func agentBook(f *fakeSupa) {
	f.rpc["agent_kpis"] = kpiJSON(nil)
	f.rpc["agent_trip_board"] = boardJSON()
	f.rpc["agent_payments_due"] = dueJSON()
	f.rpc["agent_inbox"] = mustJSON([]map[string]any{{
		"conversation_id": "conv-1", "client_id": "c1", "client_display_name": "Maya & Daniel Carter",
		"last_message_at": "2026-09-22T00:30:00+00:00", "last_message_preview": "Can we add a night?", "agent_unread_count": 2,
	}})
	f.rpc["agent_leads"] = mustJSON([]map[string]any{{
		"id": "lead-1", "first_name": "Dana", "last_name": "Reyes", "email": "dana@example.com", "source": "website",
		"status": "new", "already_client": false, "message_count": 1, "latest_preview": "Hi there",
		"first_message_at": "2026-09-18T15:00:00Z", "last_message_at": "2026-09-18T15:00:00Z",
	}})
}

func TestWorklistRendersTheBook(t *testing.T) {
	wd := newWorld(t)
	agentBook(wd.fake)
	rec := wd.get("/agent")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /agent = %d\n%s\n%s", rec.Code, rec.Body.String(), wd.logs.String())
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control = %q", cc)
	}
	body := rec.Body.String()
	has(t, body,
		"<title>Worklist · Story-Tail Adventures</title>",
		">SEP 21<", ", Gyasi.<", "4 things need you today.",
		">$12,500<", ">5 open trips<", ">$7,480<", ">$940<", ">65% confidence<", ">12 d<", ">over 4 trips<", ">7<",
		`href="/agent/trips/t-prop"`, ">Awaiting reply<", ">MD<",
		">Cabo, Four Nights · Final balance<", ">2 days late<", "text-error",
		`href="/agent/leads/lead-1"`, ">Dana Reyes<", ">Hi there<",
		`href="/agent/messages/conv-1"`, ">Sep 21<", ">Can we add a night?<",
		`aria-current="page"`,
	)
	// Escaped, never markup; a cancelled trip is not travelling and its money is not work.
	has(t, body, "&lt;script&gt;alert(1)&lt;/script&gt;")
	lacks(t, body, "<script>alert(1)</script>", "Cancelled Family", "Nothing out in client court.", "The book is quiet")
	// The worklist asked the reads with Next's arguments.
	if got := wd.fake.rpcArgs["agent_payments_due"]; got != `{"p_within_days":21}` {
		t.Errorf("payments_due args = %s", got)
	}
	if got := wd.fake.rpcArgs["agent_inbox"]; got != `{"p_limit":5}` {
		t.Errorf("inbox args = %s", got)
	}
}

func TestWorklistZeroState(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_kpis"] = kpiJSON(map[string]any{"commission_confidence_pct": nil, "inquiry_to_book_days": nil, "inquiry_to_book_sample": 0})
	body := wd.get("/agent").Body.String()
	has(t, body, "Nothing urgent today.", "The book is quiet. That is allowed.",
		"Nothing out in client court.", "No supplier payments due.", "No new inquiries.", "No new leads.",
		"Nobody travelling in the next month.", "No messages waiting.",
		"Not enough history yet — this fills in as trips move to Booked.")
	lacks(t, body, "% confidence", " d</", "chip-label\">0<")
}

func TestAFailedReadIsNotAnEmptyBook(t *testing.T) {
	for _, failing := range []string{"agent_kpis", "agent_trip_board", "agent_payments_due", "agent_inbox", "agent_leads"} {
		wd := newWorld(t)
		agentBook(wd.fake)
		wd.fake.failing[failing] = true
		rec := wd.get("/agent")
		if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "That didn’t load") {
			t.Errorf("%s failing: %d", failing, rec.Code)
		}
		if strings.Contains(rec.Body.String(), "No new leads.") {
			t.Errorf("%s failing showed an empty section", failing)
		}
	}
	// No KPI row at all means not an agent: the same state, never an empty book.
	wd := newWorld(t)
	if rec := wd.get("/agent"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("no KPI row = %d", rec.Code)
	}
}

func TestTheAgentLayoutChecks(t *testing.T) {
	for _, path := range []string{"/agent", "/agent/calendar"} {
		t.Run(path, func(t *testing.T) {
			// A traveler goes home.
			wd := newWorld(t)
			wd.fake.role = "client"
			if rec := wd.get(path); rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/dashboard" {
				t.Errorf("client: %d %q", rec.Code, rec.Header().Get("Location"))
			}
			// An administrator sees the no-access card inside the shell, and nothing is read.
			wd = newWorld(t)
			wd.fake.role = "admin"
			rec := wd.get(path)
			if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "You don’t have access to this view") {
				t.Errorf("admin: %d", rec.Code)
			}
			if len(wd.fake.rpcArgs) != 0 {
				t.Errorf("admin: reads ran: %v", wd.fake.rpcArgs)
			}
			// An advisor below aal2 with a factor finishes signing in (the gate's own redirect).
			wd = newWorld(t)
			wd.fake.aal = "aal1"
			if rec := wd.get(path); rec.Code != http.StatusSeeOther || !strings.HasPrefix(rec.Header().Get("Location"), "/login/mfa") {
				t.Errorf("aal1 with a factor: %d %q", rec.Code, rec.Header().Get("Location"))
			}
			// Below aal2 with no factor: set one up (the layout's redirect).
			wd = newWorld(t)
			wd.fake.aal, wd.fake.factor = "aal1", false
			if rec := wd.get(path); rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/mfa/setup?next=%2Fagent" {
				t.Errorf("no factor: %d %q", rec.Code, rec.Header().Get("Location"))
			}
			// Signed out: sign in, and come back here.
			wd = newWorld(t)
			rec = httptest.NewRecorder()
			wd.h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
			if rec.Code != http.StatusSeeOther || !strings.HasPrefix(rec.Header().Get("Location"), "/login?next=") {
				t.Errorf("signed out: %d %q", rec.Code, rec.Header().Get("Location"))
			}
		})
	}
}

func TestCalendar(t *testing.T) {
	wd := newWorld(t)
	agentBook(wd.fake)

	rec := wd.get("/agent/calendar")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /agent/calendar = %d\n%s", rec.Code, wd.logs.String())
	}
	body := rec.Body.String()
	has(t, body,
		"<title>Calendar · Story-Tail Adventures</title>",
		">September 2026<", ">← 2026-08<", ">2026-10 →<",
		`href="/agent/calendar?month=2026-08"`, `href="/agent/calendar?month=2026-10"`,
		"Maya &amp; Daniel Carter departs", "Final balance · $2,500",
		"below-md", "from-md", ">09-29<",
		"Blocking time arrives with §3.12, which is where the time-off shape gets defined.",
	)
	lacks(t, body, "Cancelled Family", "Deposit · $10")
	if got := wd.fake.rpcArgs["agent_payments_due"]; got != `{"p_within_days":400}` {
		t.Errorf("payments_due args = %s", got)
	}

	// ?view=agenda drops the grid and keeps the view in the month links.
	body = wd.get("/agent/calendar?month=2026-10&view=agenda").Body.String()
	has(t, body, ">October 2026<", `href="/agent/calendar?month=2026-09&amp;view=agenda"`, "Maya &amp; Daniel Carter returns")
	lacks(t, body, "<table", "Final balance")
	// ?view=month drops the agenda.
	body = wd.get("/agent/calendar?view=month").Body.String()
	has(t, body, "<table")
	lacks(t, body, `class="card ppl-agenda-item"`)
	// A month nobody could mean falls back to today's; an empty month says so.
	has(t, wd.get("/agent/calendar?month=2026-13").Body.String(), ">September 2026<")
	has(t, wd.get("/agent/calendar?month=2027-03").Body.String(), "Nothing on the calendar this month.")

	wd.fake.failing["agent_trip_board"] = true
	if rec := wd.get("/agent/calendar"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("failed read = %d", rec.Code)
	}
}
