package people

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// §3.3.2 Client Detail: a port of web/lib/agent/clientDetail.ts (the overview and the six
// list loaders' view models) and lib/trips/status.ts (the one place a trip becomes a chip).

// tripStatusMessages is TRIP_STATUS_MESSAGES.
const (
	tripMsgInquiry         = "Inquiry"
	tripMsgProposalReady   = "Proposal ready"
	tripMsgBooked          = "Booked"
	tripMsgFinalPaymentDue = "Final payment due"
	tripMsgTravelingNow    = "Traveling now"
	tripMsgPastTrip        = "Past trip"
	tripMsgCancelled       = "Cancelled"
	dueSoonDays            = 14
)

// tripStatusPresentation ports tripStatusPresentation: the chip kind and its label. A booked
// trip with an unpaid milestone due within 14 days is "Final payment due". An unknown status
// reads as an inquiry rather than failing the page.
func tripStatusPresentation(status, nextUnpaidDueDate, today string) (chip, label string) {
	switch status {
	case "cancelled":
		return "cancelled", tripMsgCancelled
	case "completed":
		return "past", tripMsgPastTrip
	case "in_progress":
		return "traveling", tripMsgTravelingNow
	case "proposal":
		return "proposal", tripMsgProposalReady
	case "booked":
		if nextUnpaidDueDate != "" && isRealDate(nextUnpaidDueDate) && isRealDate(today) && daysFrom(today, nextUnpaidDueDate) <= dueSoonDays {
			return "due", tripMsgFinalPaymentDue
		}
		return "booked", tripMsgBooked
	}
	return "inquiry", tripMsgInquiry
}

// monthYearLong is clientDetail.ts's monthYear: "Mar 2024".
func monthYearLong(iso string) string {
	parts := strings.Split(iso, "-")
	if len(parts) < 2 {
		return ""
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 1 || m > 12 || parts[0] == "" {
		return ""
	}
	return shortMonths[m-1] + " " + parts[0]
}

// monthDayYear is "Apr 17, 1988"; "" for no date.
func monthDayYear(iso string) string {
	parts := strings.Split(iso, "-")
	if len(parts) < 3 {
		return ""
	}
	m, err := strconv.Atoi(parts[1])
	d, err2 := strconv.Atoi(parts[2])
	if err != nil || err2 != nil || m < 1 || m > 12 || parts[0] == "" {
		return ""
	}
	return fmt.Sprintf("%s %d, %s", shortMonths[m-1], d, parts[0])
}

// dateRange is "Aug 12 – 19, 2026", "Aug 28 – Sep 3, 2026" or "Dec 28, 2026 – Jan 3, 2027".
func dateRange(start, end string) string {
	switch {
	case start == "" && end == "":
		return ""
	case start == "":
		return monthDayYear(end)
	case end == "":
		return monthDayYear(start)
	}
	s, e := strings.Split(start, "-"), strings.Split(end, "-")
	if len(s) < 3 || len(e) < 3 {
		return ""
	}
	sm, _ := strconv.Atoi(s[1])
	em, _ := strconv.Atoi(e[1])
	sd, _ := strconv.Atoi(s[2])
	ed, _ := strconv.Atoi(e[2])
	if sm < 1 || sm > 12 || em < 1 || em > 12 {
		return ""
	}
	switch {
	case s[0] == e[0] && s[1] == e[1]:
		return fmt.Sprintf("%s %d – %d, %s", shortMonths[sm-1], sd, ed, s[0])
	case s[0] == e[0]:
		return fmt.Sprintf("%s %d – %s %d, %s", shortMonths[sm-1], sd, shortMonths[em-1], ed, s[0])
	}
	return monthDayYear(start) + " – " + monthDayYear(end)
}

// addressLine is "1400 Lakeview Terrace, Chicago, IL 60640", or "" when there is none.
func addressLine(r overviewRow) string {
	var parts []string
	for _, p := range []*string{r.AddressLine1, r.AddressLine2, r.AddressCity, r.AddressRegion} {
		if t := jsTrim(str(p)); t != "" {
			parts = append(parts, t)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	if pc := str(r.AddressPostalCode); pc != "" {
		return strings.Join(parts, ", ") + " " + pc
	}
	return strings.Join(parts, ", ")
}

type loyaltyProgram struct{ Program, Tier string }

// loyaltyOf ports loyalty(): the programme and tier, never the membership number.
func loyaltyOf(raw json.RawMessage) []loyaltyProgram {
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil {
		return nil
	}
	var out []loyaltyProgram
	for _, item := range items {
		var obj map[string]json.RawMessage
		if json.Unmarshal(item, &obj) != nil || obj == nil {
			continue
		}
		var p loyaltyProgram
		_ = json.Unmarshal(obj["program"], &p.Program)
		_ = json.Unmarshal(obj["tier"], &p.Tier)
		if p.Program != "" {
			out = append(out, p)
		}
	}
	return out
}

type emergencyContact struct{ Name, Phone, Relationship string }

func emergencyOf(raw json.RawMessage) *emergencyContact {
	var obj map[string]json.RawMessage
	if json.Unmarshal(raw, &obj) != nil || obj == nil {
		return nil
	}
	// typeof name === "string": a null name is no contact at all.
	name, ok := jsonString(obj["name"])
	if !ok {
		return nil
	}
	c := emergencyContact{Name: name}
	c.Phone, _ = jsonString(obj["phone"])
	c.Relationship, _ = jsonString(obj["relationship"])
	return &c
}

// clientOverview is ClientOverview.
type clientOverview struct {
	ClientID, DisplayName, Initials string
	Email, Phone                    string // "" when null
	Archived                        bool
	Tags                            []string
	SinceLabel, AddressLine         string
	DateOfBirthLabel                string
	ImportantDates                  []importantDate
	Emergency                       *emergencyContact
	SnapshotNote                    string
	Version                         int64
	Prefs                           []string // destinations, styles, dietary, accessibility, loyalty
	DietaryNote, AccessibilityNote  string
	BudgetBand, FavouritePastTrips  string
	LifetimeLabel, CommissionLabel  string
	TripCount, ActiveTripCount      int64
	NoteCount, DocumentCount        int64
	LastContactLabel                string
}

func buildOverview(r overviewRow) clientOverview {
	o := clientOverview{
		ClientID: r.ClientID, DisplayName: r.DisplayName, Initials: initialsOf(r.FirstName, r.LastName),
		Email: str(r.Email), Phone: str(r.Phone), Archived: r.ArchivedAt != nil, Tags: r.Tags,
		AddressLine: addressLine(r), DateOfBirthLabel: monthDayYear(str(r.DateOfBirth)),
		ImportantDates: importantDatesOf(r.ImportantDates), Emergency: emergencyOf(r.EmergencyContact),
		SnapshotNote: str(r.Notes), Version: r.Version,
		DietaryNote: str(r.DietaryNotes), AccessibilityNote: str(r.AccessibilityNote),
		BudgetBand: str(r.BudgetBand), FavouritePastTrips: str(r.FavoritePastTrips),
		TripCount: r.TripCount, ActiveTripCount: r.ActiveTripCount, NoteCount: r.NoteCount, DocumentCount: r.DocumentCount,
	}
	if len(r.CreatedAt) >= 10 {
		o.SinceLabel = monthYearLong(r.CreatedAt[:10])
	}
	o.Prefs = append(o.Prefs, r.PreferredDests...)
	o.Prefs = append(o.Prefs, r.TravelStyles...)
	o.Prefs = append(o.Prefs, r.Dietary...)
	o.Prefs = append(o.Prefs, r.Accessibility...)
	for _, p := range loyaltyOf(r.LoyaltyPrograms) {
		if p.Tier != "" {
			o.Prefs = append(o.Prefs, p.Program+" · "+p.Tier)
		} else {
			o.Prefs = append(o.Prefs, p.Program)
		}
	}
	if r.LifetimeCurrency != nil && r.LifetimeCents != 0 {
		o.LifetimeLabel = money(r.LifetimeCents)
	}
	if r.LifetimeCurrency != nil && r.CommissionCents != 0 {
		o.CommissionLabel = money(r.CommissionCents)
	}
	if r.LastContactAt != nil && len(*r.LastContactAt) >= 10 {
		o.LastContactLabel = relativeDay(r.AsOfDate, (*r.LastContactAt)[:10])
	}
	return o
}

type companionRow struct {
	CompanionID    string  `json:"companion_id"`
	FirstName      string  `json:"first_name"`
	LastName       string  `json:"last_name"`
	Relationship   *string `json:"relationship"`
	PassportExpiry *string `json:"passport_expiry"`
	Invited        bool    `json:"invited"`
}

type companion struct {
	Name, Initials, Relationship string
	PassportLabel                string
	PassportSoon                 bool
}

// buildCompanions flags a passport expiring within six months of now (UTC date).
func buildCompanions(rows []companionRow, now time.Time) []companion {
	cutoff := now.UTC().AddDate(0, 6, 0).Format(time.DateOnly)
	var out []companion
	for _, r := range rows {
		c := companion{Name: strings.TrimSpace(r.FirstName + " " + r.LastName), Initials: initialsOf(r.FirstName, r.LastName),
			Relationship: str(r.Relationship), PassportLabel: monthDayYear(str(r.PassportExpiry))}
		c.PassportSoon = r.PassportExpiry != nil && *r.PassportExpiry <= cutoff
		out = append(out, c)
	}
	return out
}

type clientTripRowDB struct {
	TripID          string   `json:"trip_id"`
	Title           string   `json:"title"`
	Status          string   `json:"status"`
	StartDate       *string  `json:"start_date"`
	EndDate         *string  `json:"end_date"`
	Destinations    []string `json:"destinations"`
	TotalValueCents Cents    `json:"total_value_cents"`
	CommissionCents Cents    `json:"total_commission_cents"`
	Currency        string   `json:"currency"`
	AsOfDate        string   `json:"as_of_date"`
}

type clientTrip struct {
	TripID, Title, Chip, StatusLabel, DatesLabel string
	Destinations                                 []string
	ValueLabel, CommissionLabel, Bucket          string
}

// buildClientTrips buckets by end_date, not status: a stale "booked" in the past is Past.
func buildClientTrips(rows []clientTripRowDB) []clientTrip {
	var out []clientTrip
	for _, r := range rows {
		chip, label := tripStatusPresentation(r.Status, "", r.AsOfDate)
		t := clientTrip{TripID: r.TripID, Title: r.Title, Chip: chip, StatusLabel: label,
			DatesLabel: dateRange(str(r.StartDate), str(r.EndDate)), Destinations: r.Destinations,
			ValueLabel: money(r.TotalValueCents), CommissionLabel: money(r.CommissionCents), Bucket: "active"}
		switch {
		case r.Status == "cancelled":
			t.Bucket = "cancelled"
		case r.EndDate != nil && *r.EndDate < r.AsOfDate:
			t.Bucket = "past"
		}
		out = append(out, t)
	}
	return out
}

type conversationRow struct {
	ConversationID     string  `json:"conversation_id"`
	TripTitle          *string `json:"trip_title"`
	Subject            *string `json:"subject"`
	LastMessageAt      string  `json:"last_message_at"`
	LastMessagePreview *string `json:"last_message_preview"`
	AgentUnreadCount   int64   `json:"agent_unread_count"`
	MessageCount       int64   `json:"message_count"`
}

type clientThread struct {
	ConversationID, Subject, Preview, WhenLabel string
	HasPreview                                  bool
	Unread, MessageCount                        int64
}

func buildThreads(rows []conversationRow) []clientThread {
	var out []clientThread
	for _, r := range rows {
		subject := jsTrim(str(r.Subject))
		if subject == "" {
			subject = str(r.TripTitle)
		}
		if subject == "" {
			subject = "Conversation"
		}
		t := clientThread{ConversationID: r.ConversationID, Subject: subject, Unread: r.AgentUnreadCount, MessageCount: r.MessageCount}
		if r.LastMessagePreview != nil {
			t.Preview, t.HasPreview = *r.LastMessagePreview, true
		}
		if len(r.LastMessageAt) >= 10 {
			t.WhenLabel = monthDayYear(r.LastMessageAt[:10])
		}
		out = append(out, t)
	}
	return out
}

type documentRow struct {
	DocumentID  string  `json:"document_id"`
	Kind        string  `json:"kind"`
	Filename    string  `json:"filename"`
	MimeType    string  `json:"mime_type"`
	SizeBytes   string  `json:"size_bytes"`
	IsSensitive bool    `json:"is_sensitive"`
	TripTitle   *string `json:"trip_title"`
}

type clientDocument struct {
	Filename, Badge, TripTitle, SizeLabel string
	Sensitive                             bool
}

// badgeFor picks PDF, IMG or DOC from the mime type, falling back to the extension.
func badgeFor(mime, filename string) string {
	switch {
	case mime == "application/pdf" || strings.HasSuffix(strings.ToLower(filename), ".pdf"):
		return "PDF"
	case strings.HasPrefix(mime, "image/"):
		return "IMG"
	}
	return "DOC"
}

// fileSize formats a size and refuses to invent one ("—").
func fileSize(raw string) string {
	n, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n <= 0 {
		return "—"
	}
	switch {
	case n < 1024:
		return jsNumber(n) + " B"
	case n < 1024*1024:
		return fmt.Sprintf("%d KB", int64(math.Floor(n/1024+0.5)))
	}
	return toFixed1(n/(1024*1024)) + " MB"
}

// toFixed1 is Number.prototype.toFixed(1): the nearest tenth of the exact value, and on an
// exact tie (1.25 MB is 1310720 bytes) the larger one, where FormatFloat picks the even one.
func toFixed1(x float64) string {
	t := x * 10
	if f := math.Floor(t); t-f == 0.5 {
		return strconv.FormatFloat((f+1)/10, 'f', 1, 64)
	}
	return strconv.FormatFloat(x, 'f', 1, 64)
}

func buildDocuments(rows []documentRow) []clientDocument {
	var out []clientDocument
	for _, r := range rows {
		out = append(out, clientDocument{Filename: r.Filename, Badge: badgeFor(r.MimeType, r.Filename),
			TripTitle: str(r.TripTitle), SizeLabel: fileSize(r.SizeBytes), Sensitive: r.IsSensitive})
	}
	return out
}

type noteRow struct {
	NoteID     string  `json:"note_id"`
	Body       string  `json:"body"`
	AuthorName *string `json:"author_name"`
	AuthorIsMe bool    `json:"author_is_me"`
	CreatedAt  string  `json:"created_at"`
	UpdatedAt  string  `json:"updated_at"`
}

type clientNote struct {
	NoteID, Body, AuthorName, WhenLabel string
	Mine, Edited                        bool
}

func buildNotes(rows []noteRow) []clientNote {
	var out []clientNote
	for _, r := range rows {
		n := clientNote{NoteID: r.NoteID, Body: r.Body, AuthorName: str(r.AuthorName), Mine: r.AuthorIsMe, Edited: r.UpdatedAt != r.CreatedAt}
		if n.AuthorName == "" && r.AuthorName == nil {
			n.AuthorName = "Unknown"
		}
		if len(r.CreatedAt) >= 10 {
			n.WhenLabel = monthDayYear(r.CreatedAt[:10])
		}
		out = append(out, n)
	}
	return out
}

type activityRow struct {
	EventID   string          `json:"event_id"`
	EventType string          `json:"event_type"`
	ActorName *string         `json:"actor_name"`
	Metadata  json.RawMessage `json:"metadata"`
	CreatedAt string          `json:"created_at"`
}

type clientEvent struct {
	Description, ActorName, WhenLabel, Icon string
}

var slugJoints = regexp.MustCompile(`[._]`)

// describeEvent turns an audit slug into a sentence, and never drops an unknown one.
func describeEvent(eventType string, metadata json.RawMessage) string {
	var meta map[string]json.RawMessage
	_ = json.Unmarshal(metadata, &meta)
	// typeof metadata?.key === "string": a null is no value.
	metaString := func(key string) (string, bool) { return jsonString(meta[key]) }
	switch eventType {
	case "client.updated":
		return "Client record updated"
	case "client.tag_added":
		if tag, ok := metaString("tag"); ok {
			return `Tagged "` + tag + `"`
		}
		return "Tag added"
	case "client.note_created":
		return "Internal note added"
	case "client.note_changed":
		return "Internal note edited"
	case "client.note_archived":
		return "Internal note removed"
	case "trip.status_changed":
		if to, ok := metaString("to"); ok {
			return "Trip moved to " + strings.ReplaceAll(to, "_", " ")
		}
		return "Trip status changed"
	case "trip.notes_changed":
		return "Trip notes edited"
	}
	s := slugJoints.ReplaceAllString(eventType, " ")
	// /^\w/: an ASCII word character, upper-cased.
	if s != "" {
		r := rune(s[0])
		if r < 0x80 && (unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_') {
			s = strings.ToUpper(s[:1]) + s[1:]
		}
	}
	return s
}

// iconFor picks one of the five icons the row draws.
func iconFor(eventType string) string {
	switch {
	case strings.HasPrefix(eventType, "card") || strings.Contains(eventType, "payment"):
		return "card"
	case strings.Contains(eventType, "authorization"):
		return "shield"
	case strings.Contains(eventType, "message") || strings.Contains(eventType, "note"):
		return "message"
	case strings.HasPrefix(eventType, "trip"):
		return "check"
	}
	return "user"
}

func buildActivity(rows []activityRow) []clientEvent {
	var out []clientEvent
	for _, r := range rows {
		e := clientEvent{Description: describeEvent(r.EventType, r.Metadata), ActorName: str(r.ActorName), Icon: iconFor(r.EventType)}
		if len(r.CreatedAt) >= 10 {
			e.WhenLabel = monthDayYear(r.CreatedAt[:10])
		}
		out = append(out, e)
	}
	return out
}
