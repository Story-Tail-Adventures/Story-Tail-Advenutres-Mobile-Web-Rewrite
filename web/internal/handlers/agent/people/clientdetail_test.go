package people

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"
)

// Ported from web/lib/agent/clientDetail.test.ts. (A failed read vs a client that is not
// there, and empty tabs, are in clientdetail_handler_test.go, through the handler.)

func overviewFixture(t *testing.T, over map[string]any) overviewRow {
	t.Helper()
	row := map[string]any{
		"client_id": "c1", "display_name": "Belle Fitzwilliam-Castellanos", "first_name": "Annabelle",
		"last_name": "Fitzwilliam-Castellanos", "preferred_name": "Belle", "email": "annabelle.fc@example.com",
		"phone": "+1-555-0194", "date_of_birth": "1988-04-17", "status": "active", "tags": []string{"vip"},
		"important_dates":   []any{map[string]any{"label": "Anniversary", "date": "2026-09-14", "recurring": true}},
		"emergency_contact": map[string]any{"name": "Dominic", "phone": "+1-555-0100", "relationship": "spouse"},
		"address_line1":     "1400 Lakeview Terrace", "address_line2": nil, "address_city": "Chicago", "address_region": "IL",
		"address_postal_code": "60640", "address_country": "US", "notes": "Prefers a villa.", "version": 1,
		"created_at": "2024-03-01T00:00:00Z", "archived_at": nil, "preferred_destinations": []string{"Caribbean"},
		"travel_styles": []string{"resort"}, "dietary_restrictions": []string{"pescatarian"},
		"dietary_notes": "Shellfish is a hard no.", "accessibility_needs": []string{}, "accessibility_notes": nil,
		"loyalty_programs": []any{map[string]any{"program": "AAdvantage", "number": "SECRET123", "tier": "Platinum"}},
		"budget_band":      "premium", "favorite_past_trips": "Turks.", "lifetime_value_cents": "2480000",
		"lifetime_currency": "USD", "commission_cents": "297600", "trip_count": 1, "active_trip_count": 1,
		"note_count": 3, "document_count": 0, "last_contact_at": "2026-09-26T12:00:00Z", "as_of_date": "2026-09-26",
	}
	for k, v := range over {
		row[k] = v
	}
	var r overviewRow
	if err := json.Unmarshal([]byte(mustJSON(row)), &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestBuildOverview(t *testing.T) {
	o := buildOverview(overviewFixture(t, nil))
	if !strings.Contains(o.LifetimeLabel, "24,800") || !strings.Contains(o.CommissionLabel, "2,976") || o.SinceLabel != "Mar 2024" {
		t.Errorf("money/since = %q %q %q", o.LifetimeLabel, o.CommissionLabel, o.SinceLabel)
	}
	o = buildOverview(overviewFixture(t, map[string]any{"lifetime_value_cents": "0", "lifetime_currency": nil, "commission_cents": "0"}))
	if o.LifetimeLabel != "" || o.CommissionLabel != "" {
		t.Errorf("nothing committed = %q %q", o.LifetimeLabel, o.CommissionLabel)
	}
	if buildOverview(overviewFixture(t, nil)).Initials != "AF" {
		t.Error("initials come from the name parts")
	}
	o = buildOverview(overviewFixture(t, nil))
	if !slices.Contains(o.Prefs, "AAdvantage · Platinum") || strings.Contains(strings.Join(o.Prefs, " "), "SECRET123") {
		t.Errorf("loyalty = %v", o.Prefs)
	}
	o = buildOverview(overviewFixture(t, map[string]any{"important_dates": []any{
		map[string]any{"label": "Anniversary", "date": "2026-09-14", "recurring": true, "surprise": true},
		map[string]any{"nonsense": 1}, nil,
	}}))
	if !slices.Equal(o.ImportantDates, []importantDate{{"Anniversary", "2026-09-14", true}}) {
		t.Errorf("important dates = %+v", o.ImportantDates)
	}
	o = buildOverview(overviewFixture(t, map[string]any{"important_dates": nil, "loyalty_programs": nil, "emergency_contact": nil}))
	if len(o.ImportantDates) != 0 || o.Emergency != nil || slices.ContainsFunc(o.Prefs, func(s string) bool { return strings.Contains(s, "AAdvantage") }) {
		t.Errorf("non-array jsonb = %+v", o)
	}
	if a := buildOverview(overviewFixture(t, nil)).AddressLine; a != "1400 Lakeview Terrace, Chicago, IL 60640" {
		t.Errorf("address = %q", a)
	}
	if a := buildOverview(overviewFixture(t, map[string]any{"address_line1": nil, "address_city": nil, "address_region": nil})).AddressLine; a != "" {
		t.Errorf("no address = %q", a)
	}
}

func clientTripFixture(over map[string]any) clientTripRowDB {
	row := map[string]any{"trip_id": "t1", "title": "Maldives, overwater", "status": "booked", "start_date": "2027-04-24",
		"end_date": "2027-05-04", "destinations": []string{"Malé, Maldives"}, "total_value_cents": "2480000",
		"total_commission_cents": "297600", "currency": "USD", "as_of_date": "2026-09-26"}
	for k, v := range over {
		row[k] = v
	}
	var r clientTripRowDB
	_ = json.Unmarshal([]byte(mustJSON(row)), &r)
	return r
}

func TestBuildClientTrips(t *testing.T) {
	trips := buildClientTrips([]clientTripRowDB{clientTripFixture(nil),
		clientTripFixture(map[string]any{"trip_id": "t2", "end_date": "2025-01-13", "start_date": "2025-01-06"}),
		clientTripFixture(map[string]any{"trip_id": "t3", "status": "cancelled"})})
	var buckets []string
	for _, tr := range trips {
		buckets = append(buckets, tr.Bucket)
	}
	if !slices.Equal(buckets, []string{"active", "past", "cancelled"}) {
		t.Errorf("buckets = %v", buckets)
	}
	trips = buildClientTrips([]clientTripRowDB{
		clientTripFixture(map[string]any{"start_date": "2026-08-12", "end_date": "2026-08-19"}),
		clientTripFixture(map[string]any{"start_date": "2026-08-28", "end_date": "2026-09-03"}),
		clientTripFixture(map[string]any{"start_date": "2026-12-28", "end_date": "2027-01-03"}),
		clientTripFixture(map[string]any{"start_date": nil, "end_date": nil}),
	})
	var labels []string
	for _, tr := range trips {
		labels = append(labels, tr.DatesLabel)
	}
	if !slices.Equal(labels, []string{"Aug 12 – 19, 2026", "Aug 28 – Sep 3, 2026", "Dec 28, 2026 – Jan 3, 2027", ""}) {
		t.Errorf("ranges = %q", labels)
	}
	if trips[0].Chip != "booked" || trips[0].StatusLabel != "Booked" {
		t.Errorf("chip = %s %s", trips[0].Chip, trips[0].StatusLabel)
	}
}

func TestTripStatusPresentation(t *testing.T) {
	for _, c := range []struct{ status, due, today, chip, label string }{
		{"cancelled", "", "", "cancelled", "Cancelled"}, {"completed", "", "", "past", "Past trip"},
		{"in_progress", "", "", "traveling", "Traveling now"}, {"inquiry", "", "", "inquiry", "Inquiry"},
		{"proposal", "", "", "proposal", "Proposal ready"}, {"booked", "", "2026-09-01", "booked", "Booked"},
		{"booked", "2026-09-15", "2026-09-01", "due", "Final payment due"},
		{"booked", "2026-09-16", "2026-09-01", "booked", "Booked"},
		{"booked", "2026-08-01", "2026-09-01", "due", "Final payment due"}, // overdue is due too
	} {
		if chip, label := tripStatusPresentation(c.status, c.due, c.today); chip != c.chip || label != c.label {
			t.Errorf("%+v: %s %s", c, chip, label)
		}
	}
}

func TestBuildCompanions(t *testing.T) {
	now := time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)
	list := buildCompanions([]companionRow{
		{CompanionID: "cp1", FirstName: "Dominic", LastName: "Castellanos", PassportExpiry: p(now.AddDate(0, 3, 0).Format(time.DateOnly))},
		{CompanionID: "cp2", FirstName: "Dominic", LastName: "Castellanos", PassportExpiry: p(now.AddDate(3, 0, 0).Format(time.DateOnly))},
		{CompanionID: "cp3", FirstName: "Dominic", LastName: "Castellanos"},
	}, now)
	if !list[0].PassportSoon || list[1].PassportSoon || list[2].PassportSoon {
		t.Errorf("soon = %v %v %v", list[0].PassportSoon, list[1].PassportSoon, list[2].PassportSoon)
	}
}

func TestBuildNotesThreadsDocumentsActivity(t *testing.T) {
	notes := buildNotes([]noteRow{
		{NoteID: "n1", AuthorName: p("Gyasi Story"), CreatedAt: "2026-09-14T10:00:00Z", UpdatedAt: "2026-09-14T10:00:00Z"},
		{NoteID: "n2", AuthorName: p("Gyasi Story"), CreatedAt: "2026-09-14T10:00:00Z", UpdatedAt: "2026-09-20T10:00:00Z"},
		{NoteID: "n3", CreatedAt: "2026-09-14T10:00:00Z", UpdatedAt: "2026-09-14T10:00:00Z"},
	})
	if notes[0].Edited || !notes[1].Edited || notes[2].AuthorName != "Unknown" || notes[0].WhenLabel != "Sep 14, 2026" {
		t.Errorf("notes = %+v", notes)
	}

	threads := buildThreads([]conversationRow{
		{ConversationID: "cv1", TripTitle: p("Maldives, overwater"), LastMessageAt: "2026-09-26T12:00:00Z"},
		{ConversationID: "cv2", TripTitle: p("Maldives, overwater"), Subject: p("  "), LastMessageAt: "2026-09-26T12:00:00Z"},
		{ConversationID: "cv3", TripTitle: p("Maldives, overwater"), Subject: p("Upgrade"), LastMessageAt: "2026-09-26T12:00:00Z"},
		{ConversationID: "cv4", LastMessageAt: "2026-09-26T12:00:00Z"},
	})
	var subjects []string
	for _, th := range threads {
		subjects = append(subjects, th.Subject)
	}
	if !slices.Equal(subjects, []string{"Maldives, overwater", "Maldives, overwater", "Upgrade", "Conversation"}) {
		t.Errorf("subjects = %v", subjects)
	}

	var badges, sizes []string
	for _, d := range buildDocuments([]documentRow{
		{MimeType: "application/pdf", Filename: "passport.pdf", SizeBytes: "900"},
		{MimeType: "image/jpeg", Filename: "p.jpg", SizeBytes: "1153434"},
		{MimeType: "application/octet-stream", Filename: "x.bin", SizeBytes: "0"},
		{MimeType: "application/octet-stream", Filename: "y.PDF", SizeBytes: "not-a-number"},
	}) {
		badges, sizes = append(badges, d.Badge), append(sizes, d.SizeLabel)
	}
	if !slices.Equal(badges, []string{"PDF", "IMG", "DOC", "PDF"}) || !slices.Equal(sizes, []string{"900 B", "1.1 MB", "—", "—"}) {
		t.Errorf("badges %v sizes %v", badges, sizes)
	}
	if fileSize("4096") != "4 KB" {
		t.Errorf("4096 = %q", fileSize("4096"))
	}

	var descs, icons []string
	for _, e := range buildActivity([]activityRow{
		{EventType: "client.updated", Metadata: json.RawMessage(`{}`)},
		{EventType: "client.tag_added", Metadata: json.RawMessage(`{"tag":"vip"}`)},
		{EventType: "trip.status_changed", Metadata: json.RawMessage(`{"to":"in_progress"}`)},
		{EventType: "something.entirely_new", Metadata: json.RawMessage(`null`)},
		{EventType: "card_authorization.revoked"},
		{EventType: "wholly.unknown"},
	}) {
		descs, icons = append(descs, e.Description), append(icons, e.Icon)
	}
	if !slices.Equal(descs[:4], []string{"Client record updated", `Tagged "vip"`, "Trip moved to in progress", "Something entirely new"}) {
		t.Errorf("descriptions = %q", descs)
	}
	for _, i := range icons {
		if !slices.Contains([]string{"user", "card", "message", "shield", "check"}, i) {
			t.Errorf("icon %q is not one the row draws", i)
		}
	}
	if icons[4] != "card" || icons[2] != "check" {
		t.Errorf("icons = %v", icons)
	}
}
