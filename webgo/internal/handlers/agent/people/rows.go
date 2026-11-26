package people

// The rows the worklist and the calendar read, from web/lib/agent/api.ts. Every nullable
// column is a pointer here whatever the generated types claimed (api.ts's header: RETURNS
// TABLE hides nullability), and every money column is Cents (a digit-string, int64).

// kpiRow is one agent_kpis() row. No row at all means the caller is not an agent.
type kpiRow struct {
	AgentID                 string   `json:"agent_id"`
	AsOfDate                string   `json:"as_of_date"`
	Currency                *string  `json:"currency"`
	PipelineValueCents      Cents    `json:"pipeline_value_cents"`
	BookedMonthCents        Cents    `json:"booked_month_cents"`
	CommissionExpectedCents Cents    `json:"commission_expected_cents"`
	CommissionWeightedCents Cents    `json:"commission_weighted_cents"`
	CommissionConfidencePct *int64   `json:"commission_confidence_pct"`
	InquiryToBookDays       *float64 `json:"inquiry_to_book_days"` // numeric, round(days, 1); not money
	InquiryToBookSample     int64    `json:"inquiry_to_book_sample"`
	ActiveClientCount       int64    `json:"active_client_count"`
	ActiveTripCount         int64    `json:"active_trip_count"`
	NewInquiryCount         int64    `json:"new_inquiry_count"`
	UnreadMessageCount      int64    `json:"unread_message_count"`
}

// tripRow is one agent_trip_board() row. The board filters archived trips and deliberately
// not cancelled ones, so every slice that means "who is travelling" says so itself.
type tripRow struct {
	TripID            string   `json:"trip_id"`
	ClientID          string   `json:"client_id"`
	ClientDisplayName string   `json:"client_display_name"`
	Title             string   `json:"title"`
	TripType          string   `json:"trip_type"`
	Status            string   `json:"status"`
	StatusChangedAt   string   `json:"status_changed_at"`
	StartDate         *string  `json:"start_date"`
	EndDate           *string  `json:"end_date"`
	Destinations      []string `json:"destinations"`
	TravelerCount     int64    `json:"traveler_count"`
	TotalValueCents   Cents    `json:"total_value_cents"`
	Currency          string   `json:"currency"`
	Version           int64    `json:"version"`
	ProposalSentAt    *string  `json:"proposal_sent_at"`
	ProposalViewedAt  *string  `json:"proposal_viewed_at"`
}

// paymentRow is one agent_payments_due() row.
type paymentRow struct {
	MilestoneID       string  `json:"milestone_id"`
	TripID            string  `json:"trip_id"`
	TripTitle         string  `json:"trip_title"`
	ClientID          string  `json:"client_id"`
	ClientDisplayName string  `json:"client_display_name"`
	Kind              string  `json:"kind"`
	Label             string  `json:"label"`
	AmountCents       Cents   `json:"amount_cents"`
	PaidCents         Cents   `json:"paid_cents"`
	Currency          string  `json:"currency"`
	DueDate           *string `json:"due_date"`
	Status            string  `json:"status"`
	DaysUntil         *int64  `json:"days_until"`
}

// inboxRow is one agent_inbox() row.
type inboxRow struct {
	ConversationID     string  `json:"conversation_id"`
	ClientID           string  `json:"client_id"`
	ClientDisplayName  string  `json:"client_display_name"`
	TripID             *string `json:"trip_id"`
	TripTitle          *string `json:"trip_title"`
	Subject            *string `json:"subject"`
	LastMessageAt      string  `json:"last_message_at"`
	LastMessagePreview *string `json:"last_message_preview"`
	AgentUnreadCount   int64   `json:"agent_unread_count"`
}

// leadListRow is one agent_leads() row (§3.8).
type leadListRow struct {
	ID               string  `json:"id"`
	FirstName        string  `json:"first_name"`
	LastName         *string `json:"last_name"`
	Email            string  `json:"email"`
	Source           string  `json:"source"`
	Status           string  `json:"status"`
	AlreadyClient    bool    `json:"already_client"`
	ClientID         *string `json:"client_id"`
	MessageCount     int64   `json:"message_count"`
	LatestPreview    *string `json:"latest_preview"`
	FirstMessageAt   string  `json:"first_message_at"`
	LastMessageAt    string  `json:"last_message_at"`
	FirstContactedAt *string `json:"first_contacted_at"`
	ConvertedAt      *string `json:"converted_at"`
	ClosedAt         *string `json:"closed_at"`
}

// str reads a nullable text column as "" for null.
func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
