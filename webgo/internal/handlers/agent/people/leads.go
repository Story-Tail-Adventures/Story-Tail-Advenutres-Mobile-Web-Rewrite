package people

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// §3.8 Leads (revived 2026-10-21, BRD §6.5, Data-Model §11), ported from
// web/lib/agent/leadsCopy.ts and leads.ts.
//
// A LEAD IS NOT AN INQUIRY. An inquiry is a trip a client asked for; a lead is somebody without
// an account who wrote to Gyasi (or whom he added by hand). The two never share a list, a
// label or a count.

// LEAD_COPY (web/lib/agent/leadsCopy.ts), the strings Go chooses between, word for word. The
// rest is in the page files.
const (
	leadFilterOpen      = "Open"
	leadFilterConverted = "Became clients"
	leadFilterClosed    = "Closed"
	leadFilterAll       = "All"
	leadEmptyOpen       = "No one is waiting on you here. New notes from the website land in this list."
	leadEmptyOther      = "Nothing here yet."
	leadAlreadyClient   = "Already a client"
	leadEmailLabel      = "Email"
	leadPhoneLabel      = "Phone"
	leadSourceLabel     = "Came from"
	leadFirstNoteLabel  = "First note"
	leadContactedLabel  = "Contacted"
	leadConvertedLabel  = "Became a client"
	leadClosedLabel     = "Closed"
	leadCampaignLabel   = "Campaign"
	leadAddedByYou      = "Added by you"
	leadAboutPrefix     = "About: "
	leadStale           = "That lead changed since this page loaded. Reload to see where it stands."
	leadFailed          = "That didn't save. Try again in a moment."
	leadInviteLastName  = "A client record needs a last name."
	leadInviteExisting  = "That email is already on a client record, so the lead is now linked to it."
	leadInviteNotSent   = "Their client record is ready, but the invitation didn't send. You can send it from their Account tab."
	leadClientExists    = "That email is already on a client record."
	leadAddedToExisting = "That email already has an open lead, so the note was added to it."
	leadInviteTitle     = "Invite to an account"
	leadCloseTitle      = "Close this lead"
	leadDeleteTitle     = "Delete as spam?"
)

// leadMessages is LEAD_COPY.messages: "1 note", "3 notes".
func leadMessages(n int64) string {
	if n == 1 {
		return "1 note"
	}
	return strconv.FormatInt(n, 10) + " notes"
}

func leadFromPage(page string) string { return "Sent from the " + page }

var leadStatusLabel = map[string]string{"new": "New", "contacted": "Contacted", "converted": "Client", "closed": "Closed"}

// leadStatusKind is the chip colour, from the existing status palette; `lead` is its own.
var leadStatusKind = map[string]string{"new": "lead", "contacted": "inquiry", "converted": "booked", "closed": "past"}

var leadSourceLabels = map[string]string{
	"website": "Website form", "email": "Email", "phone": "Phone", "referral": "Referral", "social": "Social", "other": "Other",
}

// manualSources is 3.8.5's choices: every source but the form's own, in Next's order.
var manualSources = []string{"email", "phone", "referral", "social", "other"}

var closeReasonLabel = map[string]string{
	"not_a_fit": "Not a fit", "no_reply": "No reply", "went_elsewhere": "Went elsewhere", "other": "Other",
}

// closeReasons is 3.8.4's choices, in Next's order.
var closeReasons = []string{"not_a_fit", "no_reply", "went_elsewhere", "other"}

// leadPageLabels is where the form was opened, as the lead page says it.
var leadPageLabels = map[string]string{
	"landing": "home page", "how-it-works": "How it works page", "about": "About Gyasi page", "topic": "topic page",
	"results": "search results", "detail": "trip page", "join": "sign-up page", "app": "Android app",
}

// leadPageLabel is pageLabel: "" for no page or one Next does not know.
func leadPageLabel(page string) string { return leadPageLabels[page] }

// leadFilters, in the chips' order. The index is the filter's slot in leadList.Counts.
var leadFilters = []string{"open", "converted", "closed", "all"}

var leadFilterLabels = map[string]string{
	"open": leadFilterOpen, "converted": leadFilterConverted, "closed": leadFilterClosed, "all": leadFilterAll,
}

// leadFilterFrom is the page's ?status=, "open" for anything else (isLeadFilter).
func leadFilterFrom(q url.Values) string {
	s := q.Get("status")
	for _, f := range leadFilters {
		if s == f {
			return f
		}
	}
	return "open"
}

// leadFilterHref is the chip's link: the bare list is Open.
func leadFilterHref(filter string) string {
	if filter == "open" {
		return "/agent/leads"
	}
	return "/agent/leads?status=" + url.QueryEscape(filter)
}

func matchesLeadFilter(status, filter string) bool {
	switch filter {
	case "all":
		return true
	case "open":
		return status == "new" || status == "contacted"
	}
	return status == filter
}

// ── Reply ────────────────────────────────────────────────────────────────────────────────

var leadControl = regexp.MustCompile("[\r\n\x00-\x1f\x7f]+")

// encodeURIComponent is JavaScript's: every byte of the UTF-8 form is %XX except
// A-Z a-z 0-9 - _ . ! ~ * ' ( ). url.QueryEscape differs (spaces, and ! ' ( ) *).
func encodeURIComponent(s string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case 'a' <= c && c <= 'z', 'A' <= c && c <= 'Z', '0' <= c && c <= '9', strings.IndexByte("-_.!~*'()", c) >= 0:
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&15])
		}
	}
	return b.String()
}

// replyHref is 3.8.2's Reply: a mailto: to the lead, opening the advisor's own email app. The
// platform sends and keeps nothing (ruling 6). Every part is encoded and stripped of line
// breaks, so a name can never become a mail header.
func replyHref(email, firstName string) string {
	to := jsTrim(leadControl.ReplaceAllString(email, ""))
	subject := encodeURIComponent("Your note to Story-Tail Adventures")
	body := encodeURIComponent("Hi " + jsTrim(leadControl.ReplaceAllString(firstName, " ")) + ",\n\n")
	return "mailto:" + strings.ReplaceAll(encodeURIComponent(to), "%40", "@") + "?subject=" + subject + "&body=" + body
}

// ── 3.8.1 the list ───────────────────────────────────────────────────────────────────────

type leadListItem struct {
	ID          string
	Name        string
	Preview     string
	SourceLabel string
	StatusLabel string
	StatusKind  string
	NoteCount   int64
	WaitLabel   string // New only: "Waiting 2 days"
	DateLabel   string // the latest note's date in the advisor's zone, "Oct 21"
}

type leadList struct {
	Filter string
	Items  []leadListItem
	Counts [4]int // by leadFilters' order
}

func toLeadListItem(row leadListRow, todayISO, zone string) leadListItem {
	item := leadListItem{
		ID: row.ID, Name: leadName(row.FirstName, str(row.LastName)), Preview: str(row.LatestPreview),
		SourceLabel: leadSourceLabels[row.Source], StatusLabel: leadStatusLabel[row.Status],
		StatusKind: leadStatusKind[row.Status], NoteCount: row.MessageCount,
		DateLabel: monthDay(localDate(row.LastMessageAt, zone)),
	}
	if row.AlreadyClient {
		item.StatusLabel = leadAlreadyClient
	}
	if row.Status == "new" {
		item.WaitLabel = waitingLabel(todayISO, row.FirstMessageAt, zone)
	}
	return item
}

func buildLeadList(rows []leadListRow, filter, todayISO, zone string) leadList {
	l := leadList{Filter: filter, Items: []leadListItem{}}
	for _, r := range rows {
		for i, f := range leadFilters {
			if matchesLeadFilter(r.Status, f) {
				l.Counts[i]++
			}
		}
		if matchesLeadFilter(r.Status, filter) {
			l.Items = append(l.Items, toLeadListItem(r, todayISO, zone))
		}
	}
	return l
}

// ── 3.8.2 one lead ───────────────────────────────────────────────────────────────────────

// leadRow is agent_lead().
type leadRow struct {
	ID               string  `json:"id"`
	FirstName        string  `json:"first_name"`
	LastName         *string `json:"last_name"`
	Email            string  `json:"email"`
	Phone            *string `json:"phone"`
	Source           string  `json:"source"`
	Status           string  `json:"status"`
	AlreadyClient    bool    `json:"already_client"`
	ClientID         *string `json:"client_id"`
	UTMSource        *string `json:"utm_source"`
	UTMMedium        *string `json:"utm_medium"`
	UTMCampaign      *string `json:"utm_campaign"`
	FirstContactedAt *string `json:"first_contacted_at"`
	ConvertedAt      *string `json:"converted_at"`
	ClosedAt         *string `json:"closed_at"`
	CloseReason      *string `json:"close_reason"`
	CloseNote        *string `json:"close_note"`
	CreatedAt        string  `json:"created_at"`
	LastMessageAt    string  `json:"last_message_at"`
}

// leadMessageRow is agent_lead_messages().
type leadMessageRow struct {
	ID             string  `json:"id"`
	Body           string  `json:"body"`
	EnteredByAgent bool    `json:"entered_by_agent"`
	Page           *string `json:"page"`
	AboutKind      *string `json:"about_kind"`
	AboutSlug      *string `json:"about_slug"`
	AboutLabel     *string `json:"about_label"`
	CreatedAt      string  `json:"created_at"`
}

type labelValue struct{ Label, Value string }

type leadNote struct {
	ID    string
	Meta  string // "Oct 21 · Sent from the trip page"
	About string
	Body  string
}

type leadDetail struct {
	Lead        leadRow
	Name        string
	StatusLabel string
	StatusKind  string
	SourceLabel string
	ReplyHref   string
	Details     []labelValue
	Messages    []leadNote
}

func buildLeadDetail(lead leadRow, msgs []leadMessageRow, zone string) leadDetail {
	day := func(ts *string) string {
		if ts == nil {
			return ""
		}
		return monthDay(localDate(*ts, zone))
	}
	d := leadDetail{
		Lead: lead, Name: leadName(lead.FirstName, str(lead.LastName)),
		StatusLabel: leadStatusLabel[lead.Status], StatusKind: leadStatusKind[lead.Status],
		SourceLabel: leadSourceLabels[lead.Source], ReplyHref: replyHref(lead.Email, lead.FirstName),
	}
	if lead.AlreadyClient {
		d.StatusLabel = leadAlreadyClient
	}

	var campaign []string
	for _, p := range []*string{lead.UTMSource, lead.UTMMedium, lead.UTMCampaign} {
		if s := str(p); s != "" {
			campaign = append(campaign, s)
		}
	}
	closed := ""
	if r := str(lead.CloseReason); r != "" {
		if label := closeReasonLabel[r]; label != "" {
			closed = label
			if n := str(lead.CloseNote); n != "" {
				closed += ": " + n
			}
		}
	}
	created := lead.CreatedAt
	rows := []labelValue{
		{leadEmailLabel, lead.Email},
		{leadPhoneLabel, str(lead.Phone)},
		{leadSourceLabel, d.SourceLabel},
		{leadCampaignLabel, strings.Join(campaign, " · ")},
		{leadFirstNoteLabel, day(&created)},
		{leadContactedLabel, day(lead.FirstContactedAt)},
		{leadConvertedLabel, day(lead.ConvertedAt)},
		{leadClosedLabel, day(lead.ClosedAt)},
		{leadClosedLabel, closed},
	}
	// Next keeps a row when it has a value and is the first of its label that has one, so a
	// closed DATE hides the close reason (both are "Closed").
	seen := map[string]bool{}
	for _, r := range rows {
		if r.Value == "" || seen[r.Label] {
			continue
		}
		seen[r.Label] = true
		d.Details = append(d.Details, r)
	}

	for _, m := range msgs {
		from := leadAddedByYou
		if !m.EnteredByAgent {
			from = ""
			if p := leadPageLabel(str(m.Page)); p != "" {
				from = leadFromPage(p)
			}
		}
		var meta []string
		for _, s := range []string{day(&m.CreatedAt), from} {
			if s != "" {
				meta = append(meta, s)
			}
		}
		d.Messages = append(d.Messages, leadNote{ID: m.ID, Meta: strings.Join(meta, " · "), About: str(m.AboutLabel), Body: m.Body})
	}
	return d
}
