package fcm

import (
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
)

// The one case of _shared/agentAlerts_test.ts that checks androidData; the rest are in push
// and email.

// Deno: "a trip request on Android carries ids only"
func TestTripRequestOnAndroidCarriesIDsOnly(t *testing.T) {
	d := AndroidData(push.QuoteRequestPayload(push.ClaimedRow{
		OutboxID:        "o1",
		AgentID:         "agent-1",
		Kind:            push.KindQuoteRequest,
		TripID:          str("trip-1"),
		MessageCount:    1,
		ClientName:      str("Jordan Hayes"),
		TripTitle:       str("Hotel in Negril"),
		LatestCreatedAt: "2026-10-19T08:00:00.123456+00:00",
		Destination:     str("Negril, Jamaica"),
		StartDate:       str("2027-02-10"),
		EndDate:         str("2027-02-14"),
	}))
	eq(t, d, js.O("v", "1", "kind", "quote_request", "tag", "quote-trip-1", "tripId", "trip-1"))
}
