package people

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// §3.3.2 Client Detail (/agent/clients/{clientId}): the page, writeClientNote and
// setClientArchivedAction. The account admin tab is clientaccount.go.

// clientTabs is CLIENT_DETAIL_TABS, in order.
var clientTabs = []struct{ ID, Label string }{
	{"overview", "Overview"}, {"trips", "Trips"}, {"messages", "Messages"}, {"documents", "Documents"},
	{"notes", "Notes"}, {"activity", "Activity"}, {"account", "Account admin"},
}

// validClientTab ports validClientTab: an unknown tab is the overview.
func validClientTab(raw string) string {
	for _, t := range clientTabs {
		if t.ID == raw {
			return raw
		}
	}
	return "overview"
}

// CLIENT_COPY and ACCOUNT copy the detail page chooses between.
const (
	copyArchiveTitle    = "Archive"
	copyArchiveEyebrow  = "ARCHIVE CLIENT"
	copyArchiveBody     = "Hides them from the active roster. Past trips and the audit log remain. You can restore anytime."
	copyArchiveConfirm  = "Archive"
	copyRestoreTitle    = "Restore"
	copyRestoreEyebrow  = "RESTORE CLIENT"
	copyRestoreBody     = "Puts them back on the active roster. Nothing else about the record changes."
	copyRestoreConfirm  = "Restore"
	copyNoAddress       = "No address on file"
	copyPassportSoon    = "Expires within six months"
	copyNoteEditedMark  = "edited"
	copyNoteFailed      = "That didn't save. Try again in a moment."
	copyNoteEmpty       = "A note needs something in it."
	copyLeadOriginStart = "First reached out as a lead on "
)

var flashNoteSaved = web.NewFlash("agent.people.note-saved", "Saved")

const eventIcons = "user card message shield check"

func clientDetailSlots() []string {
	out := []string{
		"initials", "name", "archived-chip", "h-email", "h-phone", "h-address", "h-since",
		"h-message", "h-message-label", "h-call", "h-call-label", "h-newtrip", "h-archive", "h-archive-label",
		"h-archive-name", "h-merge", "archived-banner", "origin", "origin-link", "origin-date",
		"tab-failed", "tab-retry",
		"ov-edit", "ov-edit-name", "ov-phone", "ov-email", "ov-address", "ov-dob", "ov-dates", "ov-dates-text",
		"ov-budget", "ov-budget-text", "ov-note", "ov-emergency", "ov-emergency-text",
		"prefs-none", "prefs", "pref-notes", "pref-dietary", "pref-access", "pref-fav",
		"st-lifetime", "st-trips", "st-commission", "st-contact", "household-none", "household",
		"trips-empty", "trips-empty-new", "trips-list", "trips-active", "trips-past", "trips-cancelled", "trips-new",
		"threads-empty", "threads", "docs-empty", "docs",
		"note-form", "note-draft", "note-error", "notes-empty", "notes", "activity-empty", "activity",
		"archive-dialog", "archive-form", "archive-version", "archive-target", "archive-icon", "restore-icon",
		"archive-eyebrow", "archive-title", "archive-body", "archive-reason", "archive-reason-text",
		"archive-error", "archive-cancel", "archive-confirm",
	}
	for _, t := range clientTabs {
		// ctab-, not tab-: the agent layout's bottom bar already owns tab-messages.
		out = append(out, "ctab-"+t.ID, "ctab-"+t.ID+"-label", "pane-"+t.ID)
	}
	return append(out, accountSlots()...)
}

func eventSlots() []string {
	out := []string{"ev-desc", "ev-actor", "ev-when"}
	for _, i := range strings.Fields(eventIcons) {
		out = append(out, "ev-icon-"+i)
	}
	return out
}

var clientDetailSpec = page.Spec{
	File:   "agent/people/client.html",
	Layout: shell.Agent,
	Slots:  clientDetailSlots(),
	Repeats: mergeRepeats(map[string][]string{
		"htags":      {"htag"},
		"prefs":      {"pref"},
		"companions": {"cp-initials", "cp-name", "cp-passport"},
		"trips":      {"tr-link", "tr-title", "tr-sub", "tr-value", "tr-comm", "tr-chip"},
		"threads":    {"th-link", "th-subject", "th-preview", "th-when", "th-unread", "th-unread-n"},
		"docs":       {"doc-badge", "doc-name", "doc-sub", "doc-sensitive"},
		"notes": {"n-when", "n-meta", "n-tools", "n-edit", "n-delete", "n-body", "n-editform", "n-edit-id",
			"n-edit-text", "n-edit-cancel", "n-confirm", "n-confirm-id", "n-confirm-cancel"},
		"events": eventSlots(),
	}, accountRepeats()),
}

func mergeRepeats(a, b map[string][]string) map[string][]string {
	for k, v := range b {
		a[k] = v
	}
	return a
}

// detailState is what the URL or a failed post asks the page to show beyond the data.
type detailState struct {
	Tab          string
	ArchiveOpen  bool
	ArchiveError string
	ArchiveDraft string
	NoteError    string
	NoteDraft    string
	EditNote     string // a note id: its edit form is open
	EditDraft    string
	ConfirmNote  string // a note id: its "Delete this note?" row is open
	Account      accountState
}

func detailStateFrom(q url.Values) detailState {
	s := detailState{Tab: validClientTab(q.Get("tab")), ArchiveOpen: q.Get("confirm") == "archive",
		EditNote: q.Get("edit"), ConfirmNote: q.Get("confirm")}
	if s.ConfirmNote == "archive" {
		s.ConfirmNote = ""
	}
	if s.Tab == "account" {
		s.Account.Confirm = q.Get("confirm")
	}
	return s
}

// detailData is everything one render reads.
type detailData struct {
	Row        overviewRow
	Overview   clientOverview
	Origin     *leadOrigin
	TabFailed  bool
	Companions []companion
	Trips      []clientTrip
	Threads    []clientThread
	Documents  []clientDocument
	Notes      []clientNote
	Events     []clientEvent
	Account    *accountView
}

type leadOrigin struct{ LeadID, DateLabel string }

type leadOriginRow struct {
	LeadID    string `json:"lead_id"`
	CreatedAt string `json:"created_at"`
}

// loadDetail runs the overview, the lead origin and the current tab's read at once. found is
// false when there is no such client for this advisor; err is a failed overview read. A
// failed tab read is TabFailed (RetryState in the tab), and a failed origin read shows none.
func (a *app) loadDetail(ctx context.Context, v visit, clientID, tab string) (dd detailData, found bool, err error) {
	args := clientIDArgs{clientID}
	var (
		overview   []overviewRow
		origin     []leadOriginRow
		companions []companionRow
		trips      []clientTripRowDB
		threads    []conversationRow
		docs       []documentRow
		notes      []noteRow
		events     []activityRow
		account    accountRow
	)
	core := a.reads(ctx, v)
	read(core, "agent_client_overview", args, &overview)
	other := a.reads(ctx, v)
	read(other, "agent_client_lead_origin", args, &origin)
	tabReads := a.reads(ctx, v)
	switch tab {
	case "overview":
		read(tabReads, "agent_client_companions", args, &companions)
	case "trips":
		read(tabReads, "agent_client_trips", args, &trips)
	case "messages":
		read(tabReads, "agent_client_conversations", args, &threads)
	case "documents":
		read(tabReads, "agent_client_documents", args, &docs)
	case "notes":
		read(tabReads, "agent_client_notes", args, &notes)
	case "activity":
		read(tabReads, "agent_client_activity", struct {
			ClientID string `json:"p_client_id"`
			Limit    int    `json:"p_limit"`
		}{clientID, 50}, &events)
	case "account":
		tabReads.wg.Go(func() {
			if err := readOne(ctx, a, v, "agent_client_account_admin", args, &account); err != nil {
				tabReads.mu.Lock()
				tabReads.err = err
				tabReads.mu.Unlock()
			}
		})
	}
	if err := core.wait(); err != nil {
		_ = other.wait()
		_ = tabReads.wait()
		return dd, false, err
	}
	originErr := other.wait()
	tabErr := tabReads.wait()
	if len(overview) == 0 {
		return dd, false, nil
	}
	dd.Row = overview[0]
	dd.Overview = buildOverview(dd.Row)
	if originErr == nil && len(origin) > 0 {
		dd.Origin = &leadOrigin{LeadID: origin[0].LeadID, DateLabel: monthDay(localDate(origin[0].CreatedAt, v.me.TimeZone))}
	}
	if tabErr != nil {
		dd.TabFailed = true
		return dd, true, nil
	}
	switch tab {
	case "overview":
		dd.Companions = buildCompanions(companions, time.Now())
	case "trips":
		dd.Trips = buildClientTrips(trips)
	case "messages":
		dd.Threads = buildThreads(threads)
	case "documents":
		dd.Documents = buildDocuments(docs)
	case "notes":
		dd.Notes = buildNotes(notes)
	case "activity":
		dd.Events = buildActivity(events)
	case "account":
		if account.missing() {
			return dd, false, nil // the client is not this advisor's (no row)
		}
		av := toAccountView(account, time.Now())
		dd.Account = &av
	}
	return dd, true, nil
}

func (a *app) serveClientDetail(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	st := detailStateFrom(r.URL.Query())
	if rc, ok := takeReceipt(w, r, a.d.SecureCookies); ok && rc.Kind == "account" && st.Tab == "account" {
		st.Account.Status = &accountStatus{OK: true, Outcome: rc.Outcome}
	}
	a.renderClientDetail(w, r, v, st, http.StatusOK)
}

func (a *app) renderClientDetail(w http.ResponseWriter, r *http.Request, v visit, st detailState, status int) {
	clientID := r.PathValue("clientId")
	dd, found, err := a.loadDetail(r.Context(), v, clientID, st.Tab)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		a.renderNotFound(w, r, v)
		return
	}
	doc := a.clientDetail.New()
	a.chrome(w, r, doc, v)
	fillClientDetail(doc, dd, st, r.URL.Path)
	web.Render(w, a.d.Log, doc, status, web.Private)
}

// detailHref is the client page at a tab (overview is the bare path).
func detailHref(clientID, tab string) string {
	h := "/agent/clients/" + url.PathEscape(clientID)
	if tab != "" && tab != "overview" {
		h += "?tab=" + url.QueryEscape(tab)
	}
	return h
}

var telStrip = regexp.MustCompile(`[^+\d]`)

func fillClientDetail(doc *page.Doc, dd detailData, st detailState, path string) {
	c := dd.Overview
	id := c.ClientID

	// ── Header ───────────────────────────────────────────────────────────────────────────
	doc.Text("initials", c.Initials)
	doc.Text("name", c.DisplayName)
	keepIf(doc, "archived-chip", c.Archived)
	doc.Repeat("htags", len(c.Tags), func(i int, row *page.Row) { row.Text("htag", c.Tags[i]) })
	textOrRemove(doc, "h-email", c.Email)
	textOrRemove(doc, "h-phone", c.Phone)
	textOrRemove(doc, "h-address", c.AddressLine)
	doc.Text("h-since", "Since "+c.SinceLabel)
	doc.URL("h-message", "href", "/agent/messages/new?client="+url.QueryEscape(id))
	doc.Text("h-message-label", "Message "+c.DisplayName)
	if c.Phone != "" {
		doc.URL("h-call", "href", "tel:"+telStrip.ReplaceAllString(c.Phone, ""))
		doc.Text("h-call-label", "Call "+c.DisplayName)
	} else {
		doc.Remove("h-call")
	}
	doc.URL("h-newtrip", "href", "/agent/trips/new?client="+url.QueryEscape(id))
	doc.URL("h-archive", "href", "/agent/clients/"+url.PathEscape(id)+"?confirm=archive")
	if c.Archived {
		doc.Text("h-archive-label", copyRestoreTitle)
	} else {
		doc.Text("h-archive-label", copyArchiveTitle)
	}
	doc.Text("h-archive-name", " "+c.DisplayName)
	doc.URL("h-merge", "href", "/agent/clients/"+url.PathEscape(id)+"/merge")
	keepIf(doc, "archived-banner", c.Archived)
	if dd.Origin != nil {
		doc.Keep("origin")
		doc.URL("origin-link", "href", "/agent/leads/"+url.PathEscape(dd.Origin.LeadID))
		doc.Text("origin-date", dd.Origin.DateLabel)
	} else {
		doc.Remove("origin")
	}

	// ── Tabs ─────────────────────────────────────────────────────────────────────────────
	for _, t := range clientTabs {
		slot := "ctab-" + t.ID
		doc.URL(slot, "href", detailHref(id, t.ID))
		label := t.Label
		switch t.ID {
		case "trips":
			label = fmt.Sprintf("%s · %d", t.Label, c.TripCount)
		case "documents":
			label = fmt.Sprintf("%s · %d", t.Label, c.DocumentCount)
		case "notes":
			label = fmt.Sprintf("%s · %d", t.Label, c.NoteCount)
		}
		doc.Text(slot+"-label", label)
		if t.ID == st.Tab {
			doc.Class(slot, "chip-outlined", false)
			doc.Class(slot, "chip-secondary", true)
			doc.Attr(slot, "aria-current", "page")
		}
		if t.ID != st.Tab || dd.TabFailed {
			doc.Remove("pane-" + t.ID)
		} else {
			doc.Keep("pane-" + t.ID)
		}
	}
	if dd.TabFailed {
		doc.Keep("tab-failed")
		doc.URL("tab-retry", "href", detailHref(id, st.Tab))
	} else {
		doc.Remove("tab-failed")
	}
	fillOverviewTab(doc, dd, st)
	fillTripsTab(doc, dd, st)
	fillThreadsTab(doc, dd, st)
	fillDocumentsTab(doc, dd, st)
	fillNotesTab(doc, dd, st)
	fillActivityTab(doc, dd, st)
	fillAccountTab(doc, dd, st)
	fillArchiveDialog(doc, dd, st)
}

// keepIf keeps a slot when on, and takes it out otherwise.
func keepIf(doc *page.Doc, slot string, on bool) {
	if on {
		doc.Keep(slot)
	} else {
		doc.Remove(slot)
	}
}

func fillOverviewTab(doc *page.Doc, dd detailData, st detailState) {
	c := dd.Overview
	if st.Tab != "overview" || dd.TabFailed {
		return // the pane is out of the page, its rows with it
	}
	doc.URL("ov-edit", "href", "/agent/clients/"+url.PathEscape(c.ClientID)+"/edit")
	doc.Text("ov-edit-name", " "+c.DisplayName)
	doc.Text("ov-phone", orDash(c.Phone))
	doc.Text("ov-email", strOr(c.Email, copyNoEmail))
	doc.Text("ov-address", strOr(c.AddressLine, copyNoAddress))
	doc.Text("ov-dob", orDash(c.DateOfBirthLabel))
	if len(c.ImportantDates) > 0 {
		var parts []string
		for _, d := range c.ImportantDates {
			if d.Date != "" {
				parts = append(parts, d.Label+" · "+d.Date[min(5, len(d.Date)):])
			} else {
				parts = append(parts, d.Label)
			}
		}
		doc.Keep("ov-dates")
		doc.Text("ov-dates-text", strings.Join(parts, " · "))
	} else {
		doc.Remove("ov-dates")
	}
	if c.BudgetBand != "" {
		doc.Keep("ov-budget")
		doc.Text("ov-budget-text", c.BudgetBand)
	} else {
		doc.Remove("ov-budget")
	}
	textOrRemove(doc, "ov-note", c.SnapshotNote)
	if e := c.Emergency; e != nil {
		var parts []string
		for _, p := range []string{e.Name, e.Relationship, e.Phone} {
			if p != "" {
				parts = append(parts, p)
			}
		}
		doc.Keep("ov-emergency")
		doc.Text("ov-emergency-text", strings.Join(parts, " · "))
	} else {
		doc.Remove("ov-emergency")
	}

	if len(c.Prefs) == 0 && c.DietaryNote == "" && c.AccessibilityNote == "" {
		doc.Keep("prefs-none")
		doc.Remove("prefs")
	} else {
		doc.Remove("prefs-none")
		doc.Keep("prefs")
		doc.Repeat("prefs", len(c.Prefs), func(i int, row *page.Row) { row.Text("pref", c.Prefs[i]) })
		if c.DietaryNote != "" || c.AccessibilityNote != "" {
			doc.Keep("pref-notes")
			textOrRemove(doc, "pref-dietary", c.DietaryNote)
			textOrRemove(doc, "pref-access", c.AccessibilityNote)
		} else {
			doc.Remove("pref-notes")
		}
		textOrRemove(doc, "pref-fav", c.FavouritePastTrips)
	}

	doc.Text("st-lifetime", strOr(c.LifetimeLabel, copyNoLifetime))
	if c.ActiveTripCount > 0 {
		doc.Text("st-trips", fmt.Sprintf("%d · %d active", c.TripCount, c.ActiveTripCount))
	} else {
		doc.Text("st-trips", strconv.FormatInt(c.TripCount, 10))
	}
	doc.Text("st-commission", strOr(c.CommissionLabel, copyNoLifetime))
	doc.Text("st-contact", orDash(c.LastContactLabel))

	keepIf(doc, "household-none", len(dd.Companions) == 0)
	keepIf(doc, "household", len(dd.Companions) > 0)
	if len(dd.Companions) == 0 {
		return
	}
	doc.Repeat("companions", len(dd.Companions), func(i int, row *page.Row) {
		cp := dd.Companions[i]
		row.Text("cp-initials", cp.Initials)
		name := cp.Name
		if cp.Relationship != "" {
			name += " · " + cp.Relationship
		}
		row.Text("cp-name", name)
		if cp.PassportLabel == "" {
			row.Remove("cp-passport")
			return
		}
		label := "Passport " + cp.PassportLabel
		if cp.PassportSoon {
			label += " · " + copyPassportSoon
			row.Class("cp-passport", "text-secondary", false)
			row.Class("cp-passport", "text-warning", true)
		}
		row.Text("cp-passport", label)
	})
}

func strOr(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}

func fillTripsTab(doc *page.Doc, dd detailData, st detailState) {
	if st.Tab != "trips" || dd.TabFailed {
		return
	}
	id := dd.Overview.ClientID
	newTrip := "/agent/trips/new?client=" + url.QueryEscape(id)
	if len(dd.Trips) == 0 {
		doc.Keep("trips-empty")
		doc.URL("trips-empty-new", "href", newTrip)
		doc.Remove("trips-list")
		return
	}
	doc.Remove("trips-empty")
	doc.Keep("trips-list")
	counts := map[string]int{}
	for _, t := range dd.Trips {
		counts[t.Bucket]++
	}
	doc.Text("trips-active", fmt.Sprintf("Active · %d", counts["active"]))
	doc.Text("trips-past", fmt.Sprintf("Past · %d", counts["past"]))
	doc.Text("trips-cancelled", fmt.Sprintf("Cancelled · %d", counts["cancelled"]))
	doc.URL("trips-new", "href", newTrip)
	doc.Repeat("trips", len(dd.Trips), func(i int, row *page.Row) {
		t := dd.Trips[i]
		row.URL("tr-link", "href", tripHref(t.TripID))
		row.Text("tr-title", t.Title)
		var sub []string
		if t.DatesLabel != "" {
			sub = append(sub, t.DatesLabel)
		}
		if len(t.Destinations) > 0 && t.Destinations[0] != "" {
			sub = append(sub, t.Destinations[0])
		}
		row.Text("tr-sub", orDash(strings.Join(sub, " · ")))
		row.Text("tr-value", t.ValueLabel)
		row.Text("tr-comm", "Comm "+t.CommissionLabel)
		row.Text("tr-chip", t.StatusLabel)
		statusChipClass(row, "tr-chip", t.Chip)
	})
}

// statusChipClass swaps the sample's status-booked for the chip's own kind. Literal names, so
// the class check sees each one.
func statusChipClass(row *page.Row, slot, kind string) {
	row.Class(slot, "status-booked", false)
	switch kind {
	case "inquiry":
		row.Class(slot, "status-inquiry", true)
	case "proposal":
		row.Class(slot, "status-proposal", true)
	case "booked":
		row.Class(slot, "status-booked", true)
	case "due":
		row.Class(slot, "status-due", true)
	case "traveling":
		row.Class(slot, "status-traveling", true)
	case "past":
		row.Class(slot, "status-past", true)
	case "cancelled":
		row.Class(slot, "status-cancelled", true)
	case "lead":
		row.Class(slot, "status-lead", true)
	}
}

func fillThreadsTab(doc *page.Doc, dd detailData, st detailState) {
	if st.Tab != "messages" || dd.TabFailed {
		return
	}
	keepIf(doc, "threads-empty", len(dd.Threads) == 0)
	keepIf(doc, "threads", len(dd.Threads) > 0)
	if len(dd.Threads) == 0 {
		return
	}
	doc.Repeat("threads", len(dd.Threads), func(i int, row *page.Row) {
		t := dd.Threads[i]
		row.URL("th-link", "href", threadHref(t.ConversationID))
		row.Text("th-subject", t.Subject)
		if t.HasPreview {
			row.Text("th-preview", t.Preview)
		} else {
			row.Text("th-preview", fmt.Sprintf("%d messages", t.MessageCount))
		}
		row.Text("th-when", t.WhenLabel)
		if t.Unread > 0 {
			row.Keep("th-unread")
			row.Text("th-unread-n", strconv.FormatInt(t.Unread, 10))
		} else {
			row.Remove("th-unread")
		}
	})
}

func fillDocumentsTab(doc *page.Doc, dd detailData, st detailState) {
	if st.Tab != "documents" || dd.TabFailed {
		return
	}
	keepIf(doc, "docs-empty", len(dd.Documents) == 0)
	keepIf(doc, "docs", len(dd.Documents) > 0)
	if len(dd.Documents) == 0 {
		return
	}
	doc.Repeat("docs", len(dd.Documents), func(i int, row *page.Row) {
		d := dd.Documents[i]
		row.Text("doc-badge", d.Badge)
		row.Class("doc-badge", "ppl-badge-pdf", false)
		switch d.Badge {
		case "PDF":
			row.Class("doc-badge", "ppl-badge-pdf", true)
		case "IMG":
			row.Class("doc-badge", "ppl-badge-img", true)
		default:
			row.Class("doc-badge", "ppl-badge-doc", true)
		}
		row.Text("doc-name", d.Filename)
		var sub []string
		if d.TripTitle != "" {
			sub = append(sub, d.TripTitle)
		}
		row.Text("doc-sub", strings.Join(append(sub, d.SizeLabel), " · "))
		keepIf2(row, "doc-sensitive", d.Sensitive)
	})
}

func keepIf2(row *page.Row, slot string, on bool) {
	if on {
		row.Keep(slot)
	} else {
		row.Remove(slot)
	}
}

func fillNotesTab(doc *page.Doc, dd detailData, st detailState) {
	if st.Tab != "notes" || dd.TabFailed {
		return
	}
	id := dd.Overview.ClientID
	action := "/agent/clients/" + url.PathEscape(id) + "/notes"
	notesHref := detailHref(id, "notes")
	doc.URL("note-form", "action", action)
	doc.Text("note-draft", st.NoteDraft)
	textOrRemove(doc, "note-error", st.NoteError)
	keepIf(doc, "notes-empty", len(dd.Notes) == 0)
	keepIf(doc, "notes", len(dd.Notes) > 0)
	if len(dd.Notes) == 0 {
		return
	}
	doc.Repeat("notes", len(dd.Notes), func(i int, row *page.Row) {
		n := dd.Notes[i]
		row.Text("n-when", n.WhenLabel)
		meta := "· " + n.AuthorName
		if n.Edited {
			meta += " · " + copyNoteEditedMark
		}
		row.Text("n-meta", meta)
		editing := n.Mine && st.EditNote == n.NoteID
		confirming := n.Mine && st.ConfirmNote == n.NoteID && !editing
		if n.Mine && !editing && !confirming {
			row.Keep("n-tools")
			row.URL("n-edit", "href", notesHref+"&edit="+url.QueryEscape(n.NoteID))
			row.URL("n-delete", "href", notesHref+"&confirm="+url.QueryEscape(n.NoteID))
		} else {
			row.Remove("n-tools")
		}
		if editing {
			row.Remove("n-body")
			row.URL("n-editform", "action", action)
			row.Attr("n-edit-id", "value", n.NoteID)
			draft := n.Body
			if st.EditDraft != "" {
				draft = st.EditDraft
			}
			row.Text("n-edit-text", draft)
			row.Attr("n-edit-text", "aria-label", "Edit note from "+n.WhenLabel)
			row.URL("n-edit-cancel", "href", notesHref)
		} else {
			row.Text("n-body", n.Body)
			row.Remove("n-editform")
		}
		if confirming {
			row.URL("n-confirm", "action", action)
			row.Attr("n-confirm-id", "value", n.NoteID)
			row.URL("n-confirm-cancel", "href", notesHref)
		} else {
			row.Remove("n-confirm")
		}
	})
}

func fillActivityTab(doc *page.Doc, dd detailData, st detailState) {
	if st.Tab != "activity" || dd.TabFailed {
		return
	}
	keepIf(doc, "activity-empty", len(dd.Events) == 0)
	keepIf(doc, "activity", len(dd.Events) > 0)
	if len(dd.Events) == 0 {
		return
	}
	doc.Repeat("events", len(dd.Events), func(i int, row *page.Row) {
		e := dd.Events[i]
		for _, icon := range strings.Fields(eventIcons) {
			keepIf2(row, "ev-icon-"+icon, icon == e.Icon)
		}
		row.Text("ev-desc", e.Description)
		if e.ActorName != "" {
			row.Text("ev-actor", " · "+e.ActorName)
		} else {
			row.Remove("ev-actor")
		}
		row.Text("ev-when", e.WhenLabel)
	})
}

func fillArchiveDialog(doc *page.Doc, dd detailData, st detailState) {
	c := dd.Overview
	restoring := c.Archived
	doc.Keep("archive-dialog")
	doc.Bool("archive-dialog", "open", st.ArchiveOpen)
	doc.URL("archive-form", "action", "/agent/clients/"+url.PathEscape(c.ClientID)+"/archive")
	doc.Attr("archive-version", "value", strconv.FormatInt(c.Version, 10))
	doc.Attr("archive-target", "value", strconv.FormatBool(!c.Archived))
	keepIf(doc, "archive-icon", !restoring)
	keepIf(doc, "restore-icon", restoring)
	title, eyebrow, body, confirm := copyArchiveTitle, copyArchiveEyebrow, copyArchiveBody, copyArchiveConfirm
	if restoring {
		title, eyebrow, body, confirm = copyRestoreTitle, copyRestoreEyebrow, copyRestoreBody, copyRestoreConfirm
	}
	doc.Attr("archive-dialog", "aria-label", title)
	doc.Text("archive-eyebrow", eyebrow)
	doc.Text("archive-title", title+" "+c.DisplayName+"?")
	doc.Text("archive-body", body)
	if restoring {
		doc.Remove("archive-reason")
	} else {
		doc.Keep("archive-reason")
		doc.Text("archive-reason-text", st.ArchiveDraft)
	}
	textOrRemove(doc, "archive-error", st.ArchiveError)
	doc.URL("archive-cancel", "href", detailHref(c.ClientID, st.Tab))
	doc.Text("archive-confirm", confirm)
}

// ── Posts ─────────────────────────────────────────────────────────────────────────────

type noteBody struct {
	ClientID string  `json:"clientId"`
	Op       string  `json:"op"`
	NoteID   *string `json:"noteId,omitempty"`
	Body     *string `json:"body,omitempty"`
}

// postClientNote is writeClientNote: create, update or archive one of the advisor's notes.
func (a *app) postClientNote(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	clientID := r.PathValue("clientId")
	op, noteID, body := f.Get("op"), strings.TrimSpace(f.Get("noteId")), f.Get("body")
	st := detailState{Tab: "notes"}
	fail := func(msg string, status int) {
		st.NoteError = msg
		if op == "update" {
			st.EditNote, st.EditDraft = noteID, body
		} else if op == "create" {
			st.NoteDraft = body
		}
		a.renderClientDetail(w, r, v, st, status)
	}
	switch op {
	case "create", "update", "archive":
	default:
		web.Error(w, http.StatusBadRequest)
		return
	}
	if op != "create" && noteID == "" {
		web.Error(w, http.StatusBadRequest)
		return
	}
	if op != "archive" && jsTrim(body) == "" {
		fail(copyNoteEmpty, http.StatusUnprocessableEntity)
		return
	}
	nb := noteBody{ClientID: clientID, Op: op}
	if noteID != "" {
		nb.NoteID = &noteID
	}
	if op != "archive" {
		nb.Body = &body
	}
	res := a.d.API.Call(r.Context(), "agent-client-notes", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: nb})
	out := web.FromResult(res, copyNoteFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
	case !out.OK:
		msg := out.Message
		if out.Status == http.StatusServiceUnavailable {
			msg = copyNoteFailed
		}
		fail(msg, out.Status)
	default:
		web.SetFlash(w, flashNoteSaved, a.d.SecureCookies)
		web.SeeOther(w, r, detailHref(clientID, "notes"))
	}
}

type archiveBody struct {
	Op              string  `json:"op"`
	ClientID        string  `json:"clientId"`
	ExpectedVersion int64   `json:"expectedVersion"`
	Archived        bool    `json:"archived"`
	Reason          *string `json:"reason,omitempty"`
}

// postClientArchive is setClientArchivedAction: archive or restore, at the version the
// dialog was opened at.
func (a *app) postClientArchive(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	clientID := r.PathValue("clientId")
	ver, err := strconv.ParseInt(f.Get("expectedVersion"), 10, 64)
	archived, err2 := strconv.ParseBool(f.Get("archived"))
	if err != nil || err2 != nil {
		web.Error(w, http.StatusBadRequest)
		return
	}
	body := archiveBody{Op: "archive", ClientID: clientID, ExpectedVersion: ver, Archived: archived}
	if reason := jsTrim(f.Get("reason")); archived && reason != "" {
		body.Reason = &reason
	}
	res := a.d.API.Call(r.Context(), "agent-client", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: body})
	out := web.FromResult(res, copySaveFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
	case !out.OK:
		msg := out.Message
		switch {
		case out.Conflict:
			msg = copySaveStale
		case out.Status == http.StatusServiceUnavailable:
			msg = copySaveFailed
		}
		a.renderClientDetail(w, r, v, detailState{Tab: "overview", ArchiveOpen: true, ArchiveError: msg, ArchiveDraft: f.Get("reason")}, out.Status)
	default:
		web.SeeOther(w, r, detailHref(clientID, ""))
	}
}
