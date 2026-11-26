package push_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/fcm"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// The push half of _shared/agentAlerts_test.ts ("── Push ──"), one Go test per Deno.test:
// four here, "a trip request on Android carries ids only" in fcm (it checks androidData), the
// email half in email. This is an external test package so the lead test can call
// fcm.AndroidData as the Deno test does (fcm imports push).

func str(s string) *string { return &s }

func row(edit func(r *push.ClaimedRow)) push.ClaimedRow {
	r := push.ClaimedRow{
		OutboxID:        uuid.New(),
		AgentID:         "agent-1",
		Kind:            push.KindQuoteRequest,
		TripID:          str("trip-1"),
		Held:            false,
		MessageCount:    1,
		ClientName:      str("Jordan Hayes"),
		TripTitle:       str("Hotel in Negril"),
		LatestCreatedAt: "2026-10-19T08:00:00.123456+00:00",
		Destination:     str("Negril, Jamaica"),
		StartDate:       str("2027-02-10"),
		EndDate:         str("2027-02-14"),
	}
	if edit != nil {
		edit(&r)
	}
	return r
}

func eq[T any](t *testing.T, got, want T) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

// heldMessage is `row({ kind: "message", conversation_id: "c1", trip_id: null, held: true, hold_reason })`.
func heldMessage(reason string, count int) push.ClaimedRow {
	return row(func(r *push.ClaimedRow) {
		r.Kind = push.KindMessage
		r.ConversationID = str("c1")
		r.TripID = nil
		r.Held = true
		r.HoldReason = str(reason)
		r.MessageCount = count
	})
}

// Deno: "a trip request: the name in the title, where and when in the body, opening the trip"
func TestTripRequestNameTitleWhereWhenBody(t *testing.T) {
	p := push.QuoteRequestPayload(row(nil))
	eq(t, p.Title, "New trip request from Jordan Hayes")
	eq(t, p.Body, "Negril, Jamaica \U000000b7 Feb 10 \U00002013 Feb 14")
	eq(t, p.URL, "/agent/trips/trip-1")
	eq(t, p.Tag, "quote-trip-1")
	eq(t, push.QuoteRequestDetail(push.ClaimedRow{}), "")
	eq(t, push.QuoteRequestPayload(row(func(r *push.ClaimedRow) { r.Destination, r.StartDate, r.EndDate = nil, nil, nil })).Body,
		"Open it to see what they're dreaming of.")
}

// Deno: "the summary after time away says so, and counts trip requests apart from messages"
func TestSummaryAfterTimeAway(t *testing.T) {
	now := time.Date(2026, 10, 26, 13, 0, 0, 0, time.UTC)
	s := push.SummaryPayload([]push.ClaimedRow{
		heldMessage("away", 2),
		row(func(r *push.ClaimedRow) { r.Held = true; r.HoldReason = str("away") }),
	}, now)
	eq(t, s.Title, "2 new messages and 1 trip request while you were away")
	eq(t, s.Body, "Jordan Hayes reached out.")
	rested := push.SummaryPayload([]push.ClaimedRow{heldMessage("rest", 1)}, time.Date(2026, 10, 19, 8, 30, 0, 0, time.UTC))
	eq(t, rested.Title, "1 new message while you rested")
}

// Deno: "a lead's message: their name, no words, opening the lead; Android gets the id only"
func TestLeadMessageNameNoWordsAndroidIDOnly(t *testing.T) {
	lead := row(func(r *push.ClaimedRow) {
		r.Kind = push.KindLeadMessage
		r.TripID, r.TripTitle, r.Destination, r.StartDate, r.EndDate = nil, nil, nil, nil, nil
		r.ClientName = str("Dana Reyes")
		r.LeadID = str("lead-1")
	})
	p := push.LeadMessagePayload(lead)
	eq(t, p.Title, "New note from Dana Reyes")
	eq(t, p.Body, "They wrote from the website. Open it to read and reply.")
	eq(t, p.URL, "/agent/leads/lead-1")
	eq(t, p.Tag, "lead-lead-1")
	eq(t, fcm.AndroidData(p), js.O("v", "1", "kind", "lead_message", "tag", "lead-lead-1", "leadId", "lead-1"))
	eq(t, push.PlanForAgent([]push.ClaimedRow{lead}, time.Now())[0].Payload.PayloadKind(), "lead_message")

	heldLead := lead
	heldLead.Held, heldLead.HoldReason = true, str("rest")
	s := push.SummaryPayload([]push.ClaimedRow{
		heldMessage("rest", 1),
		row(func(r *push.ClaimedRow) { r.Held = true; r.HoldReason = str("rest") }),
		heldLead,
	}, time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC))
	eq(t, s.Title, "1 new message, 1 trip request and 1 note from someone new while you rested")
	eq(t, s.Count, 3)
	onlyLeads := push.SummaryPayload([]push.ClaimedRow{heldLead, heldLead}, time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC))
	eq(t, onlyLeads.Title, "2 notes from new people while you rested")
	eq(t, onlyLeads.URL, "/agent/leads")
}

// Deno: "planForAgent: a live trip request is its own notification"
func TestPlanForAgentLiveTripRequestIsItsOwn(t *testing.T) {
	sends := push.PlanForAgent([]push.ClaimedRow{row(nil)}, time.Now())
	eq(t, len(sends), 1)
	eq(t, sends[0].Payload.PayloadKind(), "quote_request")
}
