package people

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screens 3.9.7 / 3.3.11 Merge duplicate records: app/(agent)/agent/clients/[clientId]/merge
// (page.tsx, actions.ts) and components/agent/ClientMergeForm.tsx.
//
// THE RECORD IN THE URL IS THE ONE KEPT. ?with= names the one merging in, and "Keep this one
// instead" is simply the other record's own merge page, so the keep choice is never a hidden
// piece of state that could disagree with what the page shows.
//
// TWO STEPS ON ONE ROUTE. Without ?with= the page asks which record is the duplicate. With it,
// the field picker and the confirm step. The picker is a form of radio pairs; "Review the
// merge" posts intent=review (merge.js opens the dialog in place instead), and the dialog's
// "Merge records" posts intent=merge with the same radios.
//
// The whole page waits on aal2 (checked in the database), and the write also needs a second
// factor from the last 15 minutes, which account-admin checks.

var mergeSpec = page.Spec{
	File:   "agent/people/client-merge.html",
	Layout: shell.Agent,
	Slots: []string{
		"m-back", "m-back-name", "m-gate", "m-gate-body", "m-gate-link",
		"m-pick", "m-pick-sub", "m-search-form", "m-q", "m-empty", "m-cands",
		"m-notmergeable", "m-nm-another",
		"m-preview", "m-keep-version", "m-other-version",
		"r-name", "r-line", "r-signin", "r-swap", "k-name", "k-line", "k-signin", "k-another",
		"m-blocked", "m-blocked-text", "m-table", "m-same", "m-cancel", "m-review",
		"merge-dialog", "d-title", "d-moves", "d-result", "d-plan", "d-error", "d-cancel",
	},
	Repeats: map[string][]string{
		"cands": {"c-name", "c-reason", "c-archived", "c-choose"},
		"frows": {
			"f-label",
			"f-r-fixed", "f-r-fixed-text", "f-r-pin", "f-r-cell", "f-r-radio", "f-r-text",
			"f-k-fixed", "f-k-fixed-text", "f-k-pin", "f-k-cell", "f-k-radio", "f-k-text",
		},
		"dvals": {"dv-label", "dv-value"},
	},
}

var uuidPattern = regexp.MustCompile(`^(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// mergeArgs is agent_client_merge_view's arguments; the two optional ones go as null.
type mergeArgs struct {
	ClientID string  `json:"p_client_id"`
	OtherID  *string `json:"p_other_id"`
	Search   *string `json:"p_search"`
}

// mergeQuery is the page's URL: the kept record, the other one (?with=) and the search (?q=).
type mergeQuery struct {
	ClientID string
	With     string
	Search   string
}

// single is a query value Next would read: one string. A repeated key is an array there,
// which the page treats as absent.
func single(q url.Values, key string) (string, bool) {
	if vs := q[key]; len(vs) == 1 {
		return vs[0], true
	}
	return "", false
}

// mergeQueryFrom reads the page's URL, and reports false for one Next answers with "No such
// client": a malformed id in the path or in ?with=.
func mergeQueryFrom(r *http.Request) (mergeQuery, bool) {
	q := r.URL.Query()
	m := mergeQuery{ClientID: r.PathValue("clientId")}
	if !uuidPattern.MatchString(m.ClientID) {
		return m, false
	}
	if w, ok := single(q, "with"); ok {
		if !uuidPattern.MatchString(w) {
			return m, false
		}
		m.With = w
	}
	if s, ok := single(q, "q"); ok {
		m.Search = sliceUTF16(jsTrim(s), 100)
	}
	return m, true
}

// sliceUTF16 is JavaScript's s.slice(0, n): the first n UTF-16 units, never splitting a
// surrogate pair into half a character (Go strings cannot hold the lone half anyway).
func sliceUTF16(s string, n int) string {
	units := 0
	for i, r := range s {
		w := 1
		if r >= 0x10000 {
			w = 2
		}
		if units+w > n {
			return s[:i]
		}
		units += w
	}
	return s
}

// here is the page's own address without the search, which the MFA gate returns to.
func (m mergeQuery) here() string {
	h := mergePath(m.ClientID)
	if m.With != "" {
		h += "?with=" + url.QueryEscape(m.With)
	}
	return h
}

func mergePath(clientID string) string {
	return "/agent/clients/" + url.PathEscape(clientID) + "/merge"
}

func (a *app) loadMerge(r *http.Request, v visit, m mergeQuery) (mergeView, bool, error) {
	args := mergeArgs{ClientID: m.ClientID}
	if m.With != "" {
		args.OtherID = &m.With
	}
	if m.Search != "" {
		args.Search = &m.Search
	}
	var row *mergeViewRow
	if err := readOne(r.Context(), a, v, "agent_client_merge_view", args, &row); err != nil {
		return mergeView{}, false, err
	}
	if row == nil {
		return mergeView{}, false, nil
	}
	return toMergeView(*row, m.With != ""), true, nil
}

// mergeState is what one rendering adds to the view: the advisor's picks, and the confirm
// dialog with its error.
type mergeState struct {
	Picks  map[string]string
	Open   bool
	Error  string
	Search string
}

func (a *app) serveMerge(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	m, ok := mergeQueryFrom(r)
	if !ok {
		a.renderNotFound(w, r, v)
		return
	}
	a.renderMerge(w, r, v, m, mergeState{Search: m.Search}, http.StatusOK)
}

func (a *app) renderMerge(w http.ResponseWriter, r *http.Request, v visit, m mergeQuery, st mergeState, status int) {
	mv, found, err := a.loadMerge(r, v, m)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		a.renderNotFound(w, r, v)
		return
	}
	a.renderMergeView(w, r, v, m, mv, st, status)
}

func (a *app) renderMergeView(w http.ResponseWriter, r *http.Request, v visit, m mergeQuery, mv mergeView, st mergeState, status int) {
	doc := a.merge.New()
	a.chrome(w, r, doc, v)
	fillMerge(doc, m, mv, st)
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillMerge(doc *page.Doc, m mergeQuery, mv mergeView, st mergeState) {
	// The back link names the kept record; the gate shows none (it may not be theirs to name).
	switch mv.Kind {
	case "needs-mfa":
		doc.Remove("m-back")
	case "preview":
		doc.URL("m-back", "href", "/agent/clients/"+url.PathEscape(mv.Keep.ClientID))
		doc.Text("m-back-name", mv.Keep.Name)
	default:
		doc.URL("m-back", "href", "/agent/clients/"+url.PathEscape(mv.Client.ClientID))
		doc.Text("m-back-name", mv.Client.Name)
	}

	keepIf(doc, "m-gate", mv.Kind == "needs-mfa")
	keepIf(doc, "m-pick", mv.Kind == "pick")
	keepIf(doc, "m-notmergeable", mv.Kind == "not-mergeable")
	keepIf(doc, "m-preview", mv.Kind == "preview")

	switch mv.Kind {
	case "needs-mfa":
		next := url.QueryEscape(m.here())
		if mv.AgentHasFactor {
			doc.Text("m-gate-body", accGateBodyVerify)
			doc.URL("m-gate-link", "href", "/login/mfa?next="+next)
			doc.Text("m-gate-link", accGateVerify)
		} else {
			doc.Text("m-gate-body", accGateBodyNoFactor)
			doc.URL("m-gate-link", "href", "/mfa/setup?next="+next)
			doc.Text("m-gate-link", accGateSetUp)
		}
	case "pick":
		fillMergePick(doc, m, mv, st)
	case "not-mergeable":
		doc.URL("m-nm-another", "href", mergePath(m.ClientID))
	case "preview":
		fillMergePreview(doc, m, mv, st)
	}
}

func fillMergePick(doc *page.Doc, m mergeQuery, mv mergeView, st mergeState) {
	doc.Text("m-pick-sub", mergePickSub(mv.Client.Name))
	doc.URL("m-search-form", "action", mergePath(m.ClientID))
	doc.Attr("m-q", "value", st.Search)
	if len(mv.Candidates) == 0 {
		doc.Remove("m-cands")
		if st.Search != "" {
			doc.Text("m-empty", mergeNoResults)
		} else {
			doc.Text("m-empty", mergeNoCandidates)
		}
		return
	}
	doc.Remove("m-empty")
	doc.Keep("m-cands")
	doc.Repeat("cands", len(mv.Candidates), func(i int, row *page.Row) {
		c := mv.Candidates[i]
		name := c.Name
		if c.Email != "" {
			name += " · " + c.Email
		}
		row.Text("c-name", name)
		row.Text("c-reason", c.Reason+" · "+c.Line)
		keepIf2(row, "c-archived", c.Archived)
		row.URL("c-choose", "href", mergePath(m.ClientID)+"?with="+url.QueryEscape(c.ClientID))
		row.Attr("c-choose", "aria-label", mergeChoose+": "+c.Name)
	})
}

func fillMergePreview(doc *page.Doc, m mergeQuery, mv mergeView, st mergeState) {
	doc.URL("m-preview", "action", m.here())
	doc.Attr("m-keep-version", "value", strconv.FormatInt(mv.Keep.Version, 10))
	doc.Attr("m-other-version", "value", strconv.FormatInt(mv.Retire.Version, 10))

	doc.Text("r-name", mv.Retire.Name)
	doc.Text("r-line", mv.Retire.Line)
	doc.Text("r-signin", mv.Retire.SignIn)
	doc.URL("r-swap", "href", mergePath(mv.Retire.ClientID)+"?with="+url.QueryEscape(mv.Keep.ClientID))
	doc.Text("k-name", mv.Keep.Name)
	doc.Text("k-line", mv.Keep.Line)
	doc.Text("k-signin", mv.Keep.SignIn)
	doc.URL("k-another", "href", mergePath(mv.Keep.ClientID))

	if mv.Blocked != "" {
		doc.Keep("m-blocked")
		doc.Text("m-blocked-text", mv.Blocked)
	} else {
		doc.Remove("m-blocked")
	}

	if len(mv.Fields) > 0 {
		doc.Keep("m-table")
		doc.Repeat("frows", len(mv.Fields), func(i int, row *page.Row) {
			f := mv.Fields[i]
			pick := pickOf(f, st.Picks)
			row.Text("f-label", f.Label)
			fillMergeCell(row, "f-r-", f, f.Retire, "retire", pick)
			fillMergeCell(row, "f-k-", f, f.Keep, "keep", pick)
		})
	} else {
		doc.Remove("m-table")
	}
	switch {
	case len(mv.Fields) == 0:
		doc.Text("m-same", mergeAllSame)
	case mv.SameCount > 0:
		doc.Text("m-same", mergeSameCount(mv.SameCount))
	default:
		doc.Text("m-same", "")
	}

	doc.URL("m-cancel", "href", "/agent/clients/"+url.PathEscape(mv.Keep.ClientID))
	doc.Bool("m-review", "disabled", mv.Blocked != "")
	doc.Keep("m-review")

	// The confirm step. It is always in the page (merge.js opens it); the server opens it
	// itself for a review without JS and for an answer that stays in it.
	title := mergeConfirmTitle(mv.Keep.Name)
	doc.Attr("merge-dialog", "aria-label", title)
	doc.Bool("merge-dialog", "open", st.Open)
	doc.Keep("merge-dialog")
	doc.Text("d-title", title)
	if mv.Moves != "" {
		doc.Text("d-moves", mergeConfirmMoves(mv.Moves, mv.Retire.Name))
	} else {
		doc.Text("d-moves", mergeNothingMoves(mv.Retire.Name))
	}
	if len(mv.Fields) > 0 {
		doc.Keep("d-result")
		vals := mergedValues(mv.Fields, st.Picks)
		doc.Repeat("dvals", len(vals), func(i int, row *page.Row) {
			row.Text("dv-label", vals[i].Label)
			row.Attr("dv-value", "data-merge-value", mv.Fields[i].Field)
			row.Text("dv-value", vals[i].Value)
		})
	} else {
		doc.Remove("d-result")
	}
	if mv.Plan != "" {
		doc.Text("d-plan", mv.Plan)
	} else {
		doc.Remove("d-plan")
	}
	if st.Error != "" {
		doc.Text("d-error", st.Error)
	} else {
		doc.Remove("d-error")
	}
	doc.URL("d-cancel", "href", m.here())
}

// fillMergeCell fills one side of a detail: fixed text (with the chip on the kept side of a
// pinned email), or a radio and its value.
func fillMergeCell(row *page.Row, prefix string, f mergeField, value, which, pick string) {
	chosen := pick == which
	if f.Pinned {
		row.Remove(prefix + "cell")
		row.Class(prefix+"fixed", "ppl-merge-chosen", chosen)
		row.Keep(prefix + "fixed")
		row.Text(prefix+"fixed-text", value)
		keepIf2(row, prefix+"pin", chosen)
		return
	}
	row.Remove(prefix + "fixed")
	row.Keep(prefix + "cell")
	row.Attr(prefix+"radio", "name", "pick-"+f.Field)
	row.Attr(prefix+"radio", "value", which)
	row.Attr(prefix+"radio", "aria-label", mergePickValueLabel(f.Label, value))
	row.Bool(prefix+"radio", "checked", chosen)
	row.Text(prefix+"text", value)
}

// mergeBody is account-admin's merge op.
type mergeBody struct {
	Op            string            `json:"op"`
	ClientID      string            `json:"clientId"`
	OtherClientID string            `json:"otherClientId"`
	KeepVersion   int64             `json:"keepVersion"`
	OtherVersion  int64             `json:"otherVersion"`
	Choices       map[string]string `json:"choices"`
}

// picksFrom reads the radios: pick-<field> is "keep" or "retire", for a detail the page drew.
func picksFrom(f url.Values, fields []mergeField) map[string]string {
	picks := map[string]string{}
	for _, fd := range fields {
		if p := f.Get("pick-" + fd.Field); p == "keep" || p == "retire" {
			picks[fd.Field] = p
		}
	}
	return picks
}

var choiceKey = regexp.MustCompile(`^[a-z_]{1,40}$`)

// postMerge is mergeClientsAction, plus the review step a page without JS needs.
func (a *app) postMerge(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	m, ok := mergeQueryFrom(r)
	if !ok || m.With == "" {
		a.renderNotFound(w, r, v)
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	mv, found, err := a.loadMerge(r, v, m)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		a.renderNotFound(w, r, v)
		return
	}
	if mv.Kind != "preview" {
		// The gate, or a pair that can no longer be merged: the page says which.
		a.renderMergeView(w, r, v, m, mv, mergeState{}, http.StatusConflict)
		return
	}
	picks := picksFrom(f, mv.Fields)
	again := func(msg string, status int) {
		a.renderMergeView(w, r, v, m, mv, mergeState{Picks: picks, Open: true, Error: msg}, status)
	}

	if f.Get("intent") != "merge" {
		again("", http.StatusOK)
		return
	}
	if mv.Blocked != "" {
		// Review is disabled on a blocked pair; a post anyway gets the page with its alert.
		a.renderMergeView(w, r, v, m, mv, mergeState{Picks: picks}, http.StatusUnprocessableEntity)
		return
	}

	// A server action is a public POST: Next checks the shape before it reaches the function.
	keepVersion, err1 := strconv.ParseInt(strings.TrimSpace(f.Get("keepVersion")), 10, 64)
	otherVersion, err2 := strconv.ParseInt(strings.TrimSpace(f.Get("otherVersion")), 10, 64)
	choices := changedChoices(mv.Fields, picks)
	for k := range choices {
		if !choiceKey.MatchString(k) {
			err1 = strconv.ErrSyntax
		}
	}
	if err1 != nil || err2 != nil {
		again(mergeFailed, http.StatusUnprocessableEntity)
		return
	}

	res := a.d.API.Call(r.Context(), "account-admin", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: mergeBody{
		Op: "merge", ClientID: m.ClientID, OtherClientID: m.With,
		KeepVersion: keepVersion, OtherVersion: otherVersion, Choices: choices,
	}})
	out := web.FromResult(res, mergeFailed)
	switch {
	case out.SignIn:
		again(accMfaStale, http.StatusUnprocessableEntity) // see mfaRefusal
		return
	case !out.OK && res.Kind == api.Rejected && res.Detail != "":
		msg := res.Detail
		if mfaStale.MatchString(res.Detail) {
			// The fresh-MFA refusal is technical, so it gets the account tab's plain version.
			msg = accMfaStale
		}
		again(msg, http.StatusUnprocessableEntity)
		return
	case !out.OK:
		status := http.StatusUnprocessableEntity
		if out.Status == http.StatusServiceUnavailable {
			status = http.StatusServiceUnavailable
		}
		again(mergeFailed, status)
		return
	}
	var rep accountReply
	_ = json.Unmarshal(res.Data, &rep)
	switch rep.Outcome {
	case "merged":
		web.SeeOther(w, r, "/agent/clients/"+url.PathEscape(m.ClientID))
	case "stale":
		// One of the records changed: draw them as they are now, picks back to the defaults.
		// Next refreshes too, but its remount also drops the sentence; here it stays.
		fresh, found, err := a.loadMerge(r, v, m)
		switch {
		case err != nil:
			a.renderFailed(w, r, v, true)
		case !found:
			a.renderNotFound(w, r, v)
		case fresh.Kind != "preview":
			a.renderMergeView(w, r, v, m, fresh, mergeState{}, http.StatusConflict)
		default:
			a.renderMergeView(w, r, v, m, fresh, mergeState{Open: true, Error: mergeStale}, http.StatusConflict)
		}
	case "refused":
		again(cmpOr(str(rep.Reason), mergeFailed), http.StatusUnprocessableEntity)
	default:
		again(mergeFailed, http.StatusUnprocessableEntity)
	}
}
