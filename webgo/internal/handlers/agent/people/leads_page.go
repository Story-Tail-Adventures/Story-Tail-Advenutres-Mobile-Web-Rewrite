package people

import (
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// §3.8 Leads: app/(agent)/agent/leads (page.tsx, [leadId]/page.tsx, new/page.tsx, actions.ts)
// and components/agent/{LeadActions,AddLeadForm}.tsx. Every rule is the agent-lead function's;
// these handlers turn its answer into a sentence.
//
// STALENESS COMES OFF THE TYPED CONFLICT FLAG (a 409), never a substring of the function's
// sentence, as Next's actions.ts does.

var (
	leadsSpec = page.Spec{
		File: "agent/people/leads.html", Layout: shell.Agent,
		Slots: []string{"empty", "empty-body", "list"},
		Repeats: map[string][]string{
			"filters": {"filter", "filter-label"},
			"leads":   {"l-link", "l-name", "l-preview", "l-meta", "l-status", "l-wait"},
		},
	}
	leadSpec = page.Spec{
		File: "agent/people/lead.html", Layout: shell.Agent,
		Slots: []string{
			"name", "status", "added", "message", "message-box", "message-text",
			"open-client", "reply", "mark-form", "invite", "close", "reopen-form", "delete", "reply-hint",
			"dlg-invite", "invite-form", "invite-first", "invite-last", "invite-email", "invite-error", "invite-error-text", "invite-cancel",
			"dlg-close", "close-form", "close-note", "close-error", "close-error-text", "close-cancel",
			"dlg-delete", "delete-form", "delete-error", "delete-error-text", "delete-cancel",
		},
		Repeats: map[string][]string{
			"details": {"d-label", "d-value"},
			"notes":   {"n-meta", "n-about", "n-body"},
			"reasons": {"r-input", "r-label"},
		},
	}
	leadNewSpec = page.Spec{
		File: "agent/people/lead-new.html", Layout: shell.Agent,
		Slots: []string{
			"form-error", "form-error-text", "form-error-client",
			"in-firstname", "in-lastname", "in-email", "in-phone", "in-note",
			"src-email", "src-phone", "src-referral", "src-social", "src-other",
		},
	}
	leadNotFoundSpec = page.Spec{File: "agent/people/lead-not-found.html", Layout: shell.Agent}
)

// classSetter is what Doc and Row share for Class.
type classSetter interface {
	Class(slot, class string, on bool)
}

// leadChipClass swaps the sample's status-lead for the lead's own kind. Literal names, so the
// class check sees each one.
func leadChipClass(c classSetter, slot, kind string) {
	c.Class(slot, "status-lead", false)
	switch kind {
	case "lead":
		c.Class(slot, "status-lead", true)
	case "inquiry":
		c.Class(slot, "status-inquiry", true)
	case "booked":
		c.Class(slot, "status-booked", true)
	case "past":
		c.Class(slot, "status-past", true)
	}
}

// ── 3.8.1 ────────────────────────────────────────────────────────────────────────────────

func (a *app) serveLeads(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	filter := leadFilterFrom(r.URL.Query())
	var rows []leadListRow
	var kpis []kpiRow
	rs := a.reads(r.Context(), v)
	read(rs, "agent_leads", nil, &rows)
	read(rs, "agent_kpis", nil, &kpis)
	if rs.wait() != nil || len(kpis) == 0 {
		a.renderFailed(w, r, v, true)
		return
	}
	l := buildLeadList(rows, filter, kpis[0].AsOfDate, v.me.TimeZone)

	doc := a.leads.New()
	a.chrome(w, r, doc, v)
	doc.Repeat("filters", len(leadFilters), func(i int, row *page.Row) {
		f := leadFilters[i]
		on := f == l.Filter
		row.URL("filter", "href", leadFilterHref(f))
		row.Class("filter", "chip-primary", on)
		row.Class("filter", "chip-outlined", !on)
		if on {
			row.Attr("filter", "aria-current", "page")
		}
		row.Text("filter-label", leadFilterLabels[f]+" · "+strconv.Itoa(l.Counts[i]))
	})
	if len(l.Items) == 0 {
		doc.Remove("list")
		doc.Keep("empty")
		if l.Filter == "open" {
			doc.Text("empty-body", leadEmptyOpen)
		} else {
			doc.Text("empty-body", leadEmptyOther)
		}
	} else {
		doc.Remove("empty")
		doc.Keep("list")
		doc.Repeat("leads", len(l.Items), func(i int, row *page.Row) {
			it := l.Items[i]
			row.URL("l-link", "href", "/agent/leads/"+url.PathEscape(it.ID))
			row.Text("l-name", it.Name)
			row.Text("l-preview", it.Preview)
			var meta []string
			for _, s := range []string{it.SourceLabel, leadMessages(it.NoteCount), it.DateLabel} {
				if s != "" {
					meta = append(meta, s)
				}
			}
			row.Text("l-meta", strings.Join(meta, " · "))
			row.Text("l-status", it.StatusLabel)
			leadChipClass(row, "l-status", it.StatusKind)
			if it.WaitLabel != "" {
				row.Text("l-wait", it.WaitLabel)
			} else {
				row.Remove("l-wait")
			}
		})
	}
	web.Render(w, a.d.Log, doc, http.StatusOK, web.Private)
}

// ── 3.8.2 ────────────────────────────────────────────────────────────────────────────────

type leadIDArgs struct {
	LeadID string `json:"p_lead_id"`
}

// loadLead reads one lead and its notes. found is false for no such lead or somebody else's
// (one answer for both), and for an id that is not a UUID.
func (a *app) loadLead(r *http.Request, v visit, leadID string) (leadDetail, bool, error) {
	if !uuidPattern.MatchString(leadID) {
		return leadDetail{}, false, nil
	}
	var leads []leadRow
	var msgs []leadMessageRow
	rs := a.reads(r.Context(), v)
	read(rs, "agent_lead", leadIDArgs{leadID}, &leads)
	read(rs, "agent_lead_messages", leadIDArgs{leadID}, &msgs)
	if err := rs.wait(); err != nil {
		return leadDetail{}, false, err
	}
	if len(leads) == 0 {
		return leadDetail{}, false, nil
	}
	return buildLeadDetail(leads[0], msgs, v.me.TimeZone), true, nil
}

// leadState is what one rendering adds to the lead: the message line over the buttons, and
// an open dialog with its error and what was typed.
type leadState struct {
	Added   bool
	Message string
	Success bool
	Dialog  string // "invite", "close" or "delete"
	Error   string
	Form    url.Values
}

func leadStateFrom(q url.Values) leadState {
	st := leadState{Added: q.Get("added") == "1"}
	switch c := q.Get("confirm"); c {
	case "invite", "close", "delete":
		st.Dialog = c
	}
	return st
}

func (a *app) serveLead(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	st := leadStateFrom(r.URL.Query())
	if rc, ok := takeReceipt(w, r, a.d.SecureCookies); ok && rc.Kind == "lead" {
		st.Success = true
		switch rc.Outcome {
		case "existing":
			st.Message = leadInviteExisting
		case "not-sent":
			st.Message = leadInviteNotSent
		}
	}
	a.renderLead(w, r, v, st, http.StatusOK)
}

func (a *app) renderLead(w http.ResponseWriter, r *http.Request, v visit, st leadState, status int) {
	leadID := r.PathValue("leadId")
	d, found, err := a.loadLead(r, v, leadID)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		doc := a.leadNotFound.New()
		a.chrome(w, r, doc, v)
		web.Render(w, a.d.Log, doc, http.StatusNotFound, web.Private)
		return
	}
	doc := a.lead.New()
	a.chrome(w, r, doc, v)
	fillLead(doc, d, st)
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillLead(doc *page.Doc, d leadDetail, st leadState) {
	lead := d.Lead
	self := "/agent/leads/" + url.PathEscape(lead.ID)
	doc.Text("name", d.Name)
	doc.Text("status", d.StatusLabel)
	leadChipClass(doc, "status", d.StatusKind)
	keepIf(doc, "added", st.Added)

	if st.Message != "" {
		doc.Keep("message")
		doc.Class("message-box", "alert-error", !st.Success)
		doc.Class("message-box", "alert-success", st.Success)
		doc.Keep("message-box")
		doc.Text("message-text", st.Message)
	} else {
		doc.Remove("message")
	}

	// Data-Model §11.1's state machine.
	converted := lead.Status == "converted" && str(lead.ClientID) != ""
	openish := lead.Status == "new" || lead.Status == "contacted"
	if converted {
		doc.URL("open-client", "href", "/agent/clients/"+url.PathEscape(str(lead.ClientID)))
		for _, s := range []string{"reply", "mark-form", "invite", "close", "reopen-form", "delete"} {
			doc.Remove(s)
		}
	} else {
		doc.Remove("open-client")
		if !doc.URL("reply", "href", d.ReplyHref) {
			doc.Remove("reply")
		}
		if lead.Status == "new" {
			doc.URL("mark-form", "action", self)
		} else {
			doc.Remove("mark-form")
		}
		doc.URL("invite", "href", self+"?confirm=invite")
		if openish {
			doc.URL("close", "href", self+"?confirm=close")
		} else {
			doc.Remove("close")
		}
		if lead.Status == "closed" {
			doc.URL("reopen-form", "action", self)
		} else {
			doc.Remove("reopen-form")
		}
		doc.URL("delete", "href", self+"?confirm=delete")
	}
	keepIf(doc, "reply-hint", lead.Status != "converted")

	doc.Repeat("details", len(d.Details), func(i int, row *page.Row) {
		row.Text("d-label", d.Details[i].Label)
		row.Text("d-value", d.Details[i].Value)
	})
	doc.Repeat("notes", len(d.Messages), func(i int, row *page.Row) {
		m := d.Messages[i]
		row.Text("n-meta", m.Meta)
		if m.About != "" {
			row.Text("n-about", leadAboutPrefix+m.About)
		} else {
			row.Remove("n-about")
		}
		row.Text("n-body", m.Body)
	})

	// The three dialogs. Only the open one carries an error; each posts back to this page. A
	// client (converted) has none: its one button is "Open client".
	if converted {
		for _, s := range []string{"dlg-invite", "dlg-close", "dlg-delete"} {
			doc.Remove(s)
		}
		return
	}
	form := st.Form
	if form == nil {
		form = url.Values{}
	}
	fillLeadDialog(doc, "invite", st, self)
	doc.URL("invite-form", "action", self)
	first, last, email := lead.FirstName, str(lead.LastName), lead.Email
	if st.Dialog == "invite" && st.Form != nil {
		first, last, email = form.Get("firstName"), form.Get("lastName"), form.Get("email")
	}
	doc.Attr("invite-first", "value", first)
	doc.Attr("invite-last", "value", last)
	doc.Attr("invite-email", "value", email)

	if openish {
		fillLeadDialog(doc, "close", st, self)
		doc.URL("close-form", "action", self)
		reason := "no_reply"
		if st.Dialog == "close" && slices.Contains(closeReasons, form.Get("reason")) {
			reason = form.Get("reason")
		}
		doc.Repeat("reasons", len(closeReasons), func(i int, row *page.Row) {
			row.Attr("r-input", "value", closeReasons[i])
			row.Bool("r-input", "checked", closeReasons[i] == reason)
			row.Text("r-label", closeReasonLabel[closeReasons[i]])
		})
		note := ""
		if st.Dialog == "close" {
			note = form.Get("note")
		}
		doc.Text("close-note", note)
	} else {
		doc.Remove("dlg-close")
	}

	fillLeadDialog(doc, "delete", st, self)
	doc.URL("delete-form", "action", self)
}

// fillLeadDialog opens a dialog the request names and shows its error.
func fillLeadDialog(doc *page.Doc, name string, st leadState, self string) {
	open := st.Dialog == name
	doc.Bool("dlg-"+name, "open", open)
	doc.Keep("dlg-" + name)
	if open && st.Error != "" {
		doc.Keep(name + "-error")
		doc.Text(name+"-error-text", st.Error)
	} else {
		doc.Remove(name + "-error")
	}
	doc.URL(name+"-cancel", "href", self)
}

// leadOpBody is agent-lead's mark_contacted / close / reopen / delete_spam / convert.
type leadOpBody struct {
	Op       string  `json:"op"`
	LeadID   string  `json:"leadId"`
	Reason   *string `json:"reason,omitempty"`
	Note     *string `json:"note,omitempty"`
	ClientID string  `json:"clientId,omitempty"`
}

// closeBody is the close op, which always sends note (null when blank), as Next does.
type closeBody struct {
	Op     string  `json:"op"`
	LeadID string  `json:"leadId"`
	Reason string  `json:"reason"`
	Note   *string `json:"note"`
}

type leadReply struct {
	Outcome          string  `json:"outcome"`
	LeadID           *string `json:"leadId"`
	ClientID         *string `json:"clientId"`
	ExistingClientID *string `json:"existingClientId"`
}

// postLead is leadOpAction and inviteLeadAction.
func (a *app) postLead(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	leadID := r.PathValue("leadId")
	if !uuidPattern.MatchString(leadID) {
		a.renderLead(w, r, v, leadState{}, http.StatusNotFound)
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	self := "/agent/leads/" + url.PathEscape(leadID)
	op := f.Get("op")
	dialog := map[string]string{"close": "close", "delete_spam": "delete", "invite": "invite"}[op]
	fail := func(msg string, status int) {
		st := leadState{Message: msg}
		if dialog != "" {
			st = leadState{Dialog: dialog, Error: msg, Form: f}
		}
		a.renderLead(w, r, v, st, status)
	}

	switch op {
	case "mark_contacted", "reopen", "delete_spam", "close":
	case "invite":
		a.inviteLead(w, r, v, leadID, f, fail)
		return
	default:
		web.Error(w, http.StatusBadRequest)
		return
	}

	var body any = leadOpBody{Op: op, LeadID: leadID}
	if op == "close" {
		cb := closeBody{Op: op, LeadID: leadID, Reason: f.Get("reason")}
		if n := jsTrim(f.Get("note")); n != "" {
			cb.Note = &n
		}
		body = cb
	}
	res := a.d.API.Call(r.Context(), "agent-lead", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: body})
	out := web.FromResult(res, leadFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
		return
	case out.Conflict:
		msg := leadStale
		if op == "reopen" && res.Detail != "" {
			msg = res.Detail // reopen's own 409 says which: another open lead for the same email
		}
		fail(msg, http.StatusConflict)
		return
	case !out.OK:
		status := http.StatusUnprocessableEntity
		if out.Status == http.StatusServiceUnavailable {
			status = out.Status
		}
		fail(leadMessageOf(res), status)
		return
	}
	if op == "delete_spam" {
		web.SeeOther(w, r, "/agent/leads")
		return
	}
	web.SeeOther(w, r, self)
}

// leadMessageOf is Next's `result.kind === "rejected" && result.detail ? detail : failed`.
func leadMessageOf(res api.Result) string {
	if res.Kind == api.Rejected && res.Detail != "" {
		return res.Detail
	}
	return leadFailed
}

type inviteBody struct {
	ClientID string `json:"clientId"`
	Op       string `json:"op"`
}

// inviteLead is 3.8.3: create the client (agent-client), send the §3.9 invite
// (account-admin), then link the lead (agent-lead convert), each through its own audited
// door. An email already on a client record creates and sends nothing: the lead is linked to
// that client (ruling 7).
func (a *app) inviteLead(w http.ResponseWriter, r *http.Request, v visit, leadID string, f url.Values, fail func(string, int)) {
	first, last := jsTrim(f.Get("firstName")), jsTrim(f.Get("lastName"))
	if first == "" || last == "" {
		fail(leadInviteLastName, http.StatusUnprocessableEntity)
		return
	}
	// The lead's phone, as Next passes props.phone: read it, never trust a posted one.
	d, found, err := a.loadLead(r, v, leadID)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		a.renderLead(w, r, v, leadState{}, http.StatusNotFound)
		return
	}
	var phone *string
	if p := str(d.Lead.Phone); p != "" {
		if n, ok := normalizePhone(p); ok {
			phone = &n
		}
	}
	created := a.d.API.Call(r.Context(), "agent-client", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: clientCreateBody{
		Op: "create",
		Client: clientPayload{
			FirstName: first, LastName: last, Email: jsTrim(f.Get("email")), Phone: phone,
			Tags: []string{}, ImportantDates: []importantDate{},
		},
	}})
	if out := web.FromResult(created, leadFailed); out.SignIn {
		web.SeeOther(w, r, web.SignInURL(r))
		return
	} else if !out.OK {
		fail(leadMessageOf(created), http.StatusUnprocessableEntity)
		return
	}
	var rep leadReply
	_ = json.Unmarshal(created.Data, &rep)
	clientID, existing := "", false
	switch {
	case rep.Outcome == "duplicate_email" && str(rep.ExistingClientID) != "":
		clientID, existing = str(rep.ExistingClientID), true
	case str(rep.ClientID) != "":
		clientID = str(rep.ClientID)
	}
	if clientID == "" {
		fail(leadFailed, http.StatusUnprocessableEntity)
		return
	}

	sent := existing
	if !existing {
		inv := a.d.API.Call(r.Context(), "account-admin", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: inviteBody{ClientID: clientID, Op: "invite"}})
		var ir leadReply
		_ = json.Unmarshal(inv.Data, &ir)
		sent = inv.OK && ir.Outcome == "sent"
	}

	linked := a.d.API.Call(r.Context(), "agent-lead", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: leadOpBody{Op: "convert", LeadID: leadID, ClientID: clientID}})
	if !linked.OK && !linked.Conflict {
		fail(leadFailed, http.StatusUnprocessableEntity)
		return
	}
	switch {
	case existing:
		setReceipt(w, receipt{Kind: "lead", Outcome: "existing"}, a.d.SecureCookies)
	case !sent:
		setReceipt(w, receipt{Kind: "lead", Outcome: "not-sent"}, a.d.SecureCookies)
	}
	web.SeeOther(w, r, "/agent/leads/"+url.PathEscape(leadID))
}

// ── 3.8.5 ────────────────────────────────────────────────────────────────────────────────

func (a *app) serveNewLead(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	a.renderNewLead(w, r, v, url.Values{}, "", "", http.StatusOK)
}

func (a *app) renderNewLead(w http.ResponseWriter, r *http.Request, v visit, values url.Values, formError, clientID string, status int) {
	doc := a.leadNew.New()
	a.chrome(w, r, doc, v)
	if formError != "" {
		doc.Keep("form-error")
		doc.Text("form-error-text", formError)
		if clientID != "" && uuidPattern.MatchString(clientID) {
			doc.URL("form-error-client", "href", "/agent/clients/"+url.PathEscape(clientID))
		} else {
			doc.Remove("form-error-client")
		}
	} else {
		doc.Remove("form-error")
	}
	doc.Attr("in-firstname", "value", values.Get("firstName"))
	doc.Attr("in-lastname", "value", values.Get("lastName"))
	doc.Attr("in-email", "value", values.Get("email"))
	doc.Attr("in-phone", "value", values.Get("phone"))
	doc.Text("in-note", values.Get("note"))
	source := values.Get("source")
	if source == "" {
		source = "phone"
	}
	for _, s := range manualSources {
		doc.Bool("src-"+s, "selected", s == source)
		doc.Keep("src-" + s)
	}
	web.Render(w, a.d.Log, doc, status, web.Private)
}

// leadCreateBody is agent-lead's create, every field as typed: the function checks them.
type leadCreateBody struct {
	Op        string `json:"op"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Source    string `json:"source"`
	Message   string `json:"message"`
}

// postNewLead is addLeadAction: lands on the lead's page; an email on a client record offers
// that client.
func (a *app) postNewLead(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	values := url.Values{}
	for _, k := range []string{"firstName", "lastName", "email", "phone", "source", "note"} {
		values.Set(k, f.Get(k))
	}
	res := a.d.API.Call(r.Context(), "agent-lead", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: leadCreateBody{
		Op: "create", FirstName: values.Get("firstName"), LastName: values.Get("lastName"), Email: values.Get("email"),
		Phone: values.Get("phone"), Source: values.Get("source"), Message: values.Get("note"),
	}})
	out := web.FromResult(res, leadFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
		return
	case !out.OK:
		status := http.StatusUnprocessableEntity
		if out.Status == http.StatusServiceUnavailable {
			status = out.Status
		}
		a.renderNewLead(w, r, v, values, leadMessageOf(res), "", status)
		return
	}
	var rep leadReply
	_ = json.Unmarshal(res.Data, &rep)
	if rep.Outcome == "client_exists" {
		a.renderNewLead(w, r, v, values, leadClientExists, str(rep.ClientID), http.StatusConflict)
		return
	}
	id := str(rep.LeadID)
	if !uuidPattern.MatchString(id) {
		a.renderNewLead(w, r, v, values, leadFailed, "", http.StatusUnprocessableEntity)
		return
	}
	target := "/agent/leads/" + url.PathEscape(id)
	if rep.Outcome == "added" {
		target += "?added=1"
	}
	web.SeeOther(w, r, target)
}
