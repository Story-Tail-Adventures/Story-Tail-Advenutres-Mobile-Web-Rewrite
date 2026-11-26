package people

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

// §3.9.7 / §3.3.11 Merge duplicate records, ported from web/lib/agent/mergeView.ts. Rulings:
// docs/Screen-Inventory.md §3.9, "Merge (PR 2), ruled now".
//
// ONE READ, agent_client_merge_view, which answers {needsMfa} and nothing else until the
// session is aal2 (checked in the database from the verified JWT). Every default, the pinned
// email and the sign-in plan come from the SQL (client_merge_preview), and the account-admin
// merge op recomputes them under its locks, so nothing here decides what the merge does. This
// file only turns values into words.

// MERGE_COPY (web/lib/agent/content.ts), word for word.
const (
	mergeTitle             = "Merge duplicate records"
	mergeSub               = "Pick the record to keep. Everything on the other one moves over, and the change is kept in their history. Best done on a computer."
	mergePickHeading       = "Which record is the duplicate?"
	mergeSearchLabel       = "Search your clients"
	mergeNoCandidates      = "Nothing looks like a duplicate. Try searching by name or email."
	mergeNoResults         = "No client matches that search."
	mergeReasonEmail       = "Same email"
	mergeReasonPhone       = "Same phone"
	mergeReasonName        = "Similar name"
	mergeReasonSearch      = "Matches your search"
	mergeChoose            = "Merge with this record"
	mergeKeeping           = "Keeping"
	mergeMergingIn         = "Merging in"
	mergeNoSignIn          = "Hasn't set up a sign-in"
	mergeBlank             = "Blank"
	mergeAllSame           = "Every detail is the same on both records."
	mergeBlockedArchived   = "Restore the record you're keeping before merging into it."
	mergeBlockedCompanions = "Together they'd have more than 12 companions. Archive a few first."
	mergeStale             = "One of these records changed since you opened this page. Reload it to see the latest."
	mergeFailed            = "That didn't go through. Try again in a moment."
)

func mergePickSub(name string) string {
	return "These could be the same person as " + name + ". Or search for the one you mean."
}

func mergeSummaryLine(trips int64, joined string) string {
	n := "1 trip"
	if trips != 1 {
		n = strconv.FormatInt(trips, 10) + " trips"
	}
	return n + " · joined " + joined
}

func mergeSignsIn(email string) string { return "Signs in as " + email }

func mergePickValueLabel(field, value string) string { return field + ": use " + value }

func mergeSameCount(n int) string {
	if n == 1 {
		return "1 more detail is the same on both."
	}
	return strconv.Itoa(n) + " more details are the same on both."
}

func mergeConfirmTitle(name string) string { return "Merge into " + name + "?" }

func mergeConfirmMoves(counts, from string) string {
	return "Moving over from " + from + "'s record: " + counts + "."
}

func mergeNothingMoves(from string) string { return from + "'s record has nothing else attached." }

func mergePlanMove(name string) string {
	return name + "'s sign-in moves over, so they sign in the same way as before."
}

func mergePlanMoveLocked(name string) string {
	return name + "'s sign-in moves over, but it's locked. Unlock it from Account admin once you've checked it's them."
}

func mergePlanLock(kept string) string {
	return "Both records have a sign-in. " + kept + "'s stays. The other one is locked, and anyone using it is signed out."
}

var mergeFieldLabels = map[string]string{
	"first_name":             "First name",
	"last_name":              "Last name",
	"preferred_name":         "Goes by",
	"email":                  "Email",
	"phone":                  "Phone",
	"date_of_birth":          "Date of birth",
	"mailing_address_id":     "Mailing address",
	"emergency_contact":      "Emergency contact",
	"important_dates":        "Important dates",
	"tags":                   "Tags",
	"notes":                  "Notes",
	"preferred_destinations": "Dream destinations",
	"travel_styles":          "Travel style",
	"budget_band":            "Budget",
	"dietary_restrictions":   "Dietary needs",
	"dietary_notes":          "Dietary notes",
	"accessibility_needs":    "Accessibility needs",
	"accessibility_notes":    "Accessibility notes",
	"loyalty_programs":       "Loyalty programs",
	"favorite_past_trips":    "Favorite past trips",
}

var mergeReasons = map[string]string{
	"email": mergeReasonEmail, "phone": mergeReasonPhone, "name": mergeReasonName, "search": mergeReasonSearch,
}

var mergeBlocks = map[string]string{
	"kept_archived": mergeBlockedArchived, "companion_cap": mergeBlockedCompanions,
}

// ── Rows, as the SQL builds them ──────────────────────────────────────────────────────────

type mergeCounts struct {
	Trips           int64 `json:"trips"`
	Conversations   int64 `json:"conversations"`
	Notes           int64 `json:"notes"`
	Companions      int64 `json:"companions"`
	Documents       int64 `json:"documents"`
	TravelDocuments int64 `json:"travelDocuments"`
	Commissions     int64 `json:"commissions"`
}

type mergeSignIn struct {
	AccountID string  `json:"accountId"`
	Email     *string `json:"email"`
	Locked    bool    `json:"locked"`
}

// mergeSummaryRow is client_merge_summary().
type mergeSummaryRow struct {
	ClientID  string       `json:"clientId"`
	FirstName string       `json:"firstName"`
	LastName  string       `json:"lastName"`
	Email     *string      `json:"email"`
	CreatedAt string       `json:"createdAt"`
	Archived  bool         `json:"archived"`
	Version   int64        `json:"version"`
	Address   *string      `json:"address"`
	Counts    mergeCounts  `json:"counts"`
	SignIn    *mergeSignIn `json:"signIn"`
}

// mergeFieldRow is one detail of client_merge_preview(). The two values are raw jsonb: the
// columns have every shape (text, arrays, objects), so formatMergeValue reads each one.
type mergeFieldRow struct {
	Field       string          `json:"field"`
	Source      string          `json:"source"`
	KeepValue   json.RawMessage `json:"keepValue"`
	RetireValue json.RawMessage `json:"retireValue"`
	Default     string          `json:"default"`
	Pinned      bool            `json:"pinned"`
	Same        bool            `json:"same"`
}

type mergeCandidateRow struct {
	ClientID  string  `json:"clientId"`
	FirstName string  `json:"firstName"`
	LastName  string  `json:"lastName"`
	Email     *string `json:"email"`
	Archived  bool    `json:"archived"`
	Trips     int64   `json:"trips"`
	CreatedAt string  `json:"createdAt"`
	Reason    string  `json:"reason"`
}

type mergePreviewRow struct {
	Keep        mergeSummaryRow `json:"keep"`
	Retire      mergeSummaryRow `json:"retire"`
	SignInPlan  string          `json:"signInPlan"`
	PinnedEmail *string         `json:"pinnedEmail"`
	Blocked     *string         `json:"blocked"`
	Fields      []mergeFieldRow `json:"fields"`
}

// mergeViewRow is agent_client_merge_view's one jsonb answer.
type mergeViewRow struct {
	NeedsMfa       bool                `json:"needsMfa"`
	AgentHasFactor bool                `json:"agentHasFactor"`
	Client         *mergeSummaryRow    `json:"client"`
	Candidates     []mergeCandidateRow `json:"candidates"`
	Preview        *mergePreviewRow    `json:"preview"`
}

// ── The view ─────────────────────────────────────────────────────────────────────────────

type mergeSide struct {
	ClientID  string
	Name      string
	FirstName string
	Version   int64
	Line      string
	SignIn    string
	Archived  bool
}

type mergeField struct {
	Field  string
	Label  string
	Keep   string
	Retire string
	Pick   string // "keep" or "retire": the SQL's default
	Pinned bool
}

type mergeCandidate struct {
	ClientID string
	Name     string
	Email    string
	Line     string
	Reason   string
	Archived bool
}

// mergeView is MergeView. Kind is "needs-mfa", "pick", "not-mergeable" or "preview"; Moves,
// Plan and Blocked are "" where Next has null.
type mergeView struct {
	Kind           string
	AgentHasFactor bool
	Client         mergeSide
	Candidates     []mergeCandidate
	Keep, Retire   mergeSide
	Fields         []mergeField
	SameCount      int
	Moves          string
	Plan           string
	Blocked        string
}

// joined is the month a record was made, "Mar 2024", read in UTC as Next does.
func joined(iso string) string {
	t, ok := parseInstant(iso)
	if !ok {
		return ""
	}
	return t.UTC().Format("Jan 2006")
}

func mergeSideOf(s mergeSummaryRow) mergeSide {
	signIn := mergeNoSignIn
	if s.SignIn != nil && s.SignIn.Email != nil && *s.SignIn.Email != "" {
		signIn = mergeSignsIn(*s.SignIn.Email)
	}
	return mergeSide{
		ClientID: s.ClientID, Name: jsTrim(s.FirstName + " " + s.LastName), FirstName: s.FirstName,
		Version: s.Version, Line: mergeSummaryLine(s.Counts.Trips, joined(s.CreatedAt)),
		SignIn: signIn, Archived: s.Archived,
	}
}

// movesLine is the confirm step's counts in the ruling's words: "3 trips, 2 conversations,
// 5 notes", or "" when nothing is attached. Commissions are not listed, as in Next.
func movesLine(c mergeCounts) string {
	var parts []string
	add := func(n int64, one, many string) {
		switch {
		case n == 1:
			parts = append(parts, "1 "+one)
		case n != 0:
			parts = append(parts, strconv.FormatInt(n, 10)+" "+many)
		}
	}
	add(c.Trips, "trip", "trips")
	add(c.Conversations, "conversation", "conversations")
	add(c.Notes, "note", "notes")
	add(c.Companions, "companion", "companions")
	add(c.Documents, "document", "documents")
	add(c.TravelDocuments, "travel document", "travel documents")
	return strings.Join(parts, ", ")
}

func toMergeView(row mergeViewRow, withOther bool) mergeView {
	if row.NeedsMfa || row.Client == nil {
		return mergeView{Kind: "needs-mfa", AgentHasFactor: row.AgentHasFactor}
	}
	client := mergeSideOf(*row.Client)

	if !withOther {
		cands := make([]mergeCandidate, 0, len(row.Candidates))
		for _, c := range row.Candidates {
			reason, ok := mergeReasons[c.Reason]
			if !ok {
				reason = mergeReasonName
			}
			email := ""
			if c.Email != nil {
				email = *c.Email
			}
			cands = append(cands, mergeCandidate{
				ClientID: c.ClientID, Name: jsTrim(c.FirstName + " " + c.LastName), Email: email,
				Line: mergeSummaryLine(c.Trips, joined(c.CreatedAt)), Reason: reason, Archived: c.Archived,
			})
		}
		return mergeView{Kind: "pick", Client: client, Candidates: cands}
	}

	p := row.Preview
	if p == nil {
		return mergeView{Kind: "not-mergeable", Client: client}
	}
	keep, retire := mergeSideOf(p.Keep), mergeSideOf(p.Retire)
	v := mergeView{Kind: "preview", Client: client, Keep: keep, Retire: retire, Moves: movesLine(p.Retire.Counts)}
	for _, f := range p.Fields {
		if f.Same {
			v.SameCount++
			continue
		}
		label, ok := mergeFieldLabels[f.Field]
		if !ok {
			label = f.Field
		}
		v.Fields = append(v.Fields, mergeField{
			Field: f.Field, Label: label,
			Keep:   formatMergeValue(f.Field, f.KeepValue, p.Keep.Address),
			Retire: formatMergeValue(f.Field, f.RetireValue, p.Retire.Address),
			Pick:   f.Default, Pinned: f.Pinned,
		})
	}
	switch p.SignInPlan {
	case "move":
		if p.Retire.SignIn != nil && p.Retire.SignIn.Locked {
			v.Plan = mergePlanMoveLocked(retire.FirstName)
		} else {
			v.Plan = mergePlanMove(retire.FirstName)
		}
	case "lock_retired":
		v.Plan = mergePlanLock(keep.FirstName)
	}
	if p.Blocked != nil {
		v.Blocked = mergeBlocks[*p.Blocked]
	}
	return v
}

// mergedValue is one line of the confirm step's "record you'll have".
type mergedValue struct{ Label, Value string }

// pickOf is the value a detail ends up with: a pinned one never moves, and a detail the
// advisor did not touch keeps the SQL's default.
func pickOf(f mergeField, picks map[string]string) string {
	if f.Pinned {
		return f.Pick
	}
	if p, ok := picks[f.Field]; ok {
		return p
	}
	return f.Pick
}

// mergedValues is each shown detail as it will end up.
func mergedValues(fields []mergeField, picks map[string]string) []mergedValue {
	out := make([]mergedValue, 0, len(fields))
	for _, f := range fields {
		value := f.Keep
		if pickOf(f, picks) == "retire" {
			value = f.Retire
		}
		out = append(out, mergedValue{Label: f.Label, Value: value})
	}
	return out
}

// changedChoices is only the flips: anything not named takes the SQL's default, which it
// recomputes itself.
func changedChoices(fields []mergeField, picks map[string]string) map[string]string {
	out := map[string]string{}
	for _, f := range fields {
		if p, ok := picks[f.Field]; ok && !f.Pinned && p != "" && p != f.Pick {
			out[f.Field] = p
		}
	}
	return out
}

// ── formatMergeValue ─────────────────────────────────────────────────────────────────────

// jsonKind is a raw value's JSON type, from its first byte: n(ull), b(ool), s(tring),
// a(rray), o(bject) or #(number). An absent value reads as null.
func jsonKind(raw json.RawMessage) byte {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 {
		return 'n'
	}
	switch t[0] {
	case 'n':
		return 'n'
	case 't', 'f':
		return 'b'
	case '"':
		return 's'
	case '[':
		return 'a'
	case '{':
		return 'o'
	}
	return '#'
}

// jsonString reads raw as a string, if it is one.
func jsonString(raw json.RawMessage) (string, bool) {
	if jsonKind(raw) != 's' {
		return "", false
	}
	var s string
	if json.Unmarshal(raw, &s) != nil {
		return "", false
	}
	return s, true
}

// jsonTruthy is JavaScript's truthiness for a JSON value.
func jsonTruthy(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	switch jsonKind(raw) {
	case 'n':
		return false
	case 'b':
		return t[0] == 't'
	case 's':
		s, _ := jsonString(raw)
		return s != ""
	case '#':
		f, err := strconv.ParseFloat(string(t), 64)
		return err == nil && f != 0
	}
	return true
}

func jsonObject(raw json.RawMessage) (map[string]json.RawMessage, bool) {
	if jsonKind(raw) != 'o' {
		return nil, false
	}
	var m map[string]json.RawMessage
	if json.Unmarshal(raw, &m) != nil {
		return nil, false
	}
	return m, true
}

func jsonArray(raw json.RawMessage) ([]json.RawMessage, bool) {
	if jsonKind(raw) != 'a' {
		return nil, false
	}
	var a []json.RawMessage
	if json.Unmarshal(raw, &a) != nil {
		return nil, false
	}
	return a, true
}

// stringsOf keeps the members of m named in keys that are non-empty strings, in that order.
func stringsOf(m map[string]json.RawMessage, keys ...string) []string {
	var out []string
	for _, k := range keys {
		if s, ok := jsonString(m[k]); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

func blankIfNone(parts []string) string {
	if len(parts) == 0 {
		return mergeBlank
	}
	return strings.Join(parts, ", ")
}

// formatMergeValue is one value as the picker shows it. jsonb columns have no schema in
// Postgres, so every shape is read defensively. A loyalty NUMBER is never shown, as on the
// Overview tab: it is an account credential, and the program name is what the advisor is
// choosing between.
func formatMergeValue(field string, raw json.RawMessage, address *string) string {
	if field == "mailing_address_id" {
		if jsonTruthy(raw) && address != nil && *address != "" {
			return *address
		}
		return mergeBlank
	}
	kind := jsonKind(raw)
	if kind == 'n' {
		return mergeBlank
	}
	if field == "date_of_birth" && kind == 's' {
		s, _ := jsonString(raw)
		if t, err := time.Parse("2006-01-02", s); err == nil {
			return t.Format("Jan 2, 2006")
		}
		return s
	}
	switch field {
	case "emergency_contact":
		m, ok := jsonObject(raw)
		if !ok {
			return mergeBlank
		}
		if _, ok := jsonString(m["name"]); !ok {
			return mergeBlank
		}
		return strings.Join(stringsOf(m, "name", "relationship", "phone"), " · ")
	case "important_dates":
		items, ok := jsonArray(raw)
		if !ok {
			return mergeBlank
		}
		var out []string
		for _, it := range items {
			if m, ok := jsonObject(it); ok {
				if s := strings.Join(stringsOf(m, "label", "date"), " "); s != "" {
					out = append(out, s)
				}
			}
		}
		return blankIfNone(out)
	case "loyalty_programs":
		items, ok := jsonArray(raw)
		if !ok {
			return mergeBlank
		}
		var out []string
		for _, it := range items {
			if m, ok := jsonObject(it); ok {
				out = append(out, stringsOf(m, "program")...)
			}
		}
		return blankIfNone(out)
	}
	switch kind {
	case 'a':
		items, _ := jsonArray(raw)
		var out []string
		for _, it := range items {
			if s, ok := jsonString(it); ok && jsTrim(s) != "" {
				out = append(out, s)
			}
		}
		return blankIfNone(out)
	case 's':
		s, _ := jsonString(raw)
		if jsTrim(s) == "" {
			return mergeBlank
		}
		return s
	case 'b':
		return string(bytes.TrimSpace(raw))
	case '#':
		if f, err := strconv.ParseFloat(string(bytes.TrimSpace(raw)), 64); err == nil {
			return jsNumber(f)
		}
	}
	// An object in a column with no known shape: nothing readable to show.
	return mergeBlank
}
