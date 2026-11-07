package trips

import (
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.4.3, Create New Trip: app/(agent)/agent/trips/new/page.tsx and actions.ts, with
// lib/agent/newTrip.ts and components/agent/NewTripForm.tsx.
//
// The whole active book is read once and handed to a <datalist> the browser filters; archived
// clients are not offered. ?client= pre-selects. The type tiles are radios drawn as cards,
// five of them matching trip_type ("Honeymoon" is not one). On success the advisor lands in
// the builder, with ?seeded= saying whether a chosen template's apply worked.
//
// The client field: Next posts only a hidden clientId that a script keeps in step with the
// typed name. Here the typed name is posted too (clientName), and the server resolves it
// when the hidden id is empty, so the form also works with JavaScript off. An exact,
// case-insensitive match to exactly ONE active client is required, so a name two clients
// share never picks one silently.

// NEW_TRIP_COPY, word for word.
const (
	copyClientRequired = "Pick a client first."
	copyClientMissing  = "That client is not on your book any more. Pick another."
	copyTitleRequired  = "Give the trip a name."
	copyNewTripFailed  = "That didn't save. Try again in a moment."
)

// tripType is one of TRIP_TYPES; the order is the form's.
type tripType struct{ value, slot, label string }

var tripTypes = []tripType{
	{"all_inclusive", "type-all-inclusive", "All-inclusive resort"},
	{"cruise", "type-cruise", "Cruise"},
	{"multi_destination", "type-multi-destination", "Multi-destination"},
	{"group", "type-group", "Group trip"},
	{"custom", "type-custom", "Custom"},
}

// defaultTripType: all-inclusive is the shape this business books most.
const defaultTripType = "all_inclusive"

// tripTypeLabel is the human label for a stored trip_type, or the raw value: trip_type has
// more members than the form offers, and a value outside the list is real data.
func tripTypeLabel(v string) string {
	for _, t := range tripTypes {
		if t.value == v {
			return t.label
		}
	}
	return v
}

// newTripValues is NewTripValues, plus the typed client name the no-JS path posts.
type newTripValues struct {
	clientID, clientName, tripType, title, travelerCount, templateID string
}

func emptyNewTrip(presetClient string) newTripValues {
	return newTripValues{clientID: presetClient, tripType: defaultTripType, travelerCount: "2"}
}

// newTripFromForm ports newTripFromFormData: everything trimmed, and a posted trip type that
// is not one of the five falls back to the default rather than being trusted.
func newTripFromForm(f url.Values) newTripValues {
	tt := f.Get("tripType")
	if !slices.ContainsFunc(tripTypes, func(t tripType) bool { return t.value == tt }) {
		tt = defaultTripType
	}
	return newTripValues{
		clientID:      strings.TrimSpace(f.Get("clientId")),
		clientName:    strings.TrimSpace(f.Get("clientName")),
		tripType:      tt,
		title:         strings.TrimSpace(f.Get("title")),
		travelerCount: strings.TrimSpace(f.Get("travelerCount")),
		templateID:    strings.TrimSpace(f.Get("templateId")),
	}
}

// newTripErrors are field-level, so each lands against the control that caused it.
type newTripErrors struct{ client, title string }

func (e newTripErrors) any() bool { return e.client != "" || e.title != "" }

// validateNewTrip ports validateNewTrip. The template id is NOT validated: a stale or foreign
// one is refused by the RPC's own ownership check.
func validateNewTrip(v newTripValues) newTripErrors {
	var e newTripErrors
	if v.clientID == "" {
		e.client = copyClientRequired
	}
	if v.title == "" {
		e.title = copyTitleRequired
	}
	return e
}

type pickClient struct{ id, name, email string }

type clientRosterRow struct {
	ClientID    string  `json:"client_id"`
	DisplayName string  `json:"display_name"`
	Email       *string `json:"email"`
}

type clientRosterArgs struct {
	Status []string  `json:"p_status"`
	Tags   *[]string `json:"p_tags"`
	Search *string   `json:"p_search"`
	Limit  int       `json:"p_limit"`
	Offset int       `json:"p_offset"`
}

// loadBook reads the whole active book (500 in one read: an advisor's book is tens). nil
// means the read failed.
func loadBook(r *http.Request, d handlers.Deps, v visit) []pickClient {
	if !v.canRead() {
		return nil
	}
	rows, err := agentread.Call[clientRosterRow](r.Context(), d.Supa, v.st, "agent_client_roster",
		clientRosterArgs{Status: []string{"active"}, Limit: 500}, d.Log)
	if err != nil {
		return nil
	}
	out := make([]pickClient, 0, len(rows))
	for _, row := range rows {
		out = append(out, pickClient{id: row.ClientID, name: row.DisplayName, email: deref(row.Email)})
	}
	return out
}

// resolveClient keeps the posted id when it is a client on the book whose name is the typed
// one; otherwise the typed name decides (matchClient). The client-side module does the same.
func resolveClient(book []pickClient, postedID, name string) string {
	want := strings.ToLower(strings.TrimSpace(name))
	for _, c := range book {
		if c.id == postedID && strings.ToLower(c.name) == want {
			return postedID
		}
	}
	return matchClient(book, name)
}

// matchClient resolves a typed name to exactly one client, or "".
func matchClient(book []pickClient, name string) string {
	want := strings.ToLower(strings.TrimSpace(name))
	if want == "" {
		return ""
	}
	id := ""
	for _, c := range book {
		if strings.ToLower(c.name) == want {
			if id != "" {
				return ""
			}
			id = c.id
		}
	}
	return id
}

// templateRow is AgentTemplateRow.
type templateRow struct {
	TemplateID     string  `json:"template_id"`
	Name           string  `json:"name"`
	Description    *string `json:"description"`
	TripType       string  `json:"trip_type"`
	ComponentCount int     `json:"component_count"`
	DayCount       int     `json:"day_count"`
	ValueCents     Cents   `json:"value_cents"`
	TimesUsed      int     `json:"times_used"`
}

// shapeLabel is templateCard's "6 bookings · 4 days", or just the bookings with no
// day-by-day ("· 0 days" would read as a defect).
func shapeLabel(components, days int) string {
	b := plural(components, "booking", "bookings")
	if days > 0 {
		return b + " · " + plural(days, "day", "days")
	}
	return b
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return strconv.Itoa(n) + " " + many
}

// loadTemplates reads the library. A failed read is an EMPTY library on this screen: the
// picker renders only when there is something in it.
func loadTemplates(r *http.Request, d handlers.Deps, v visit) ([]templateRow, bool) {
	if !v.canRead() {
		return nil, false
	}
	rows, err := agentread.Call[templateRow](r.Context(), d.Supa, v.st, "agent_templates", struct{}{}, d.Log)
	return rows, err == nil
}

var newTripSlots = func() []string {
	s := []string{"form-error", "form-error-text", "client-input", "client-id", "client-error",
		"title", "title-error", "travelers", "template-field"}
	for _, t := range tripTypes {
		s = append(s, t.slot)
	}
	return s
}()

var newTripSpecs = []page.Spec{spec("agent/trips/new.html", newTripSlots, map[string][]string{
	"client-opt": {"client-opt"},
	"tpl-opt":    {"tpl-opt"},
})}

// newTripForm is what the page shows: the values, the errors, the book and the library.
type newTripForm struct {
	values    newTripValues
	errs      newTripErrors
	formError string
	book      []pickClient
	templates []templateRow
}

func mountNewTrip(rt *gate.Router, d handlers.Deps) error {
	tmpl, err := d.Pages.Template("agent/trips/new.html")
	if err != nil {
		return err
	}

	render := func(w http.ResponseWriter, r *http.Request, v visit, f *newTripForm, status int) {
		doc := tmpl.New()
		st := stateBody
		if f == nil {
			st = stateRetry
		}
		if fillFrame(doc, r, v, st) {
			fillNewTrip(doc, f)
		}
		web.Render(w, d.Log, doc, status, web.Private)
	}

	// load reads the book and the library at once; nil when the book read failed.
	load := func(r *http.Request, v visit, values newTripValues) *newTripForm {
		var (
			book []pickClient
			tpls []templateRow
		)
		parallel(
			func() { book = loadBook(r, d, v) },
			func() { tpls, _ = loadTemplates(r, d, v) },
		)
		if book == nil {
			return nil
		}
		return &newTripForm{values: values, book: book, templates: tpls}
	}

	rt.Protected("GET /agent/trips/new", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		values := emptyNewTrip(strings.TrimSpace(r.URL.Query().Get("client")))
		f := load(r, v, values)
		if f != nil {
			for _, c := range f.book {
				if c.id == values.clientID {
					f.values.clientName = c.name
				}
			}
		}
		render(w, r, v, f, http.StatusOK)
	}))

	rt.Protected("POST /agent/trips/new", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		v, done := begin(w, r, d)
		if done {
			return
		}
		if v.noAccess {
			render(w, r, v, nil, http.StatusForbidden) // an admin has no desk here; nothing is sent
			return
		}
		values := newTripFromForm(form)

		var (
			f      *newTripForm // loaded once, when the page has to be drawn again or a name resolved
			loaded bool
		)
		reload := func() *newTripForm {
			if !loaded {
				f, loaded = load(r, v, values), true
			}
			return f
		}
		again := func(apply func(*newTripForm), status int) {
			nf := reload()
			if nf != nil {
				nf.values = values
				apply(nf)
			}
			render(w, r, v, nf, status)
		}

		// The typed name is what the advisor sees, so it wins over a hidden id it no longer
		// names: with JS off, a re-rendered form or ?client= keeps the earlier id in the hidden
		// field while the visible name is retyped. A name that resolves to no one (or to two)
		// posts no id, and the form says to pick a client.
		if values.clientName != "" {
			if nf := reload(); nf != nil {
				values.clientID = resolveClient(nf.book, values.clientID, values.clientName)
			}
		}
		if errs := validateNewTrip(values); errs.any() {
			again(func(nf *newTripForm) { nf.errs = errs }, http.StatusUnprocessableEntity)
			return
		}

		travelers := 1
		if n, ok := parseIntJS(values.travelerCount); ok {
			travelers = n
		}
		res := call(r.Context(), d, r, v, "agent-trip", map[string]any{
			"op": "create", "clientId": values.clientID, "tripType": values.tripType,
			"title": values.title, "travelerCount": travelers,
		})
		out := outcome(res, copyNewTripFailed)
		if out.SignIn {
			web.SeeOther(w, r, web.SignInURL(r))
			return
		}
		if !out.OK {
			again(func(nf *newTripForm) { nf.formError = out.Message }, out.Status)
			return
		}
		var created struct {
			Outcome *string `json:"outcome"`
			TripID  *string `json:"tripId"`
		}
		if err := json.Unmarshal(res.Data, &created); err != nil {
			d.Log.Warn("unexpected function reply", "function", "agent-trip", "err", err)
		}
		// no_client is a FIELD error: the client left the book between load and submit.
		if created.Outcome != nil && *created.Outcome == "no_client" {
			again(func(nf *newTripForm) { nf.errs.client = copyClientMissing }, http.StatusUnprocessableEntity)
			return
		}
		if created.TripID == nil || *created.TripID == "" {
			again(func(nf *newTripForm) { nf.formError = copyNewTripFailed }, http.StatusUnprocessableEntity)
			return
		}
		tripID := *created.TripID

		// §3.4.13's template, applied AFTER the trip exists. A failed apply does not fail the
		// create, but it must not be silent: the outcome rides in the URL for the builder.
		target := "/agent/trips/" + url.PathEscape(tripID) + "/builder"
		if values.templateID != "" {
			applied := call(r.Context(), d, r, v, "agent-template", map[string]any{
				"op": "apply", "templateId": values.templateID, "tripId": tripID,
			})
			seeded := "failed"
			if applied.OK {
				var a struct {
					ComponentsAdded *int64 `json:"componentsAdded"`
				}
				if err := json.Unmarshal(applied.Data, &a); err != nil {
					d.Log.Warn("unexpected function reply", "function", "agent-template", "err", err)
				}
				n := int64(0)
				if a.ComponentsAdded != nil {
					n = *a.ComponentsAdded
				}
				seeded = strconv.FormatInt(n, 10)
			}
			target += "?seeded=" + seeded
		}
		web.SeeOther(w, r, target)
	}))
	return nil
}

func fillNewTrip(d *page.Doc, f *newTripForm) {
	if f.formError == "" {
		d.Remove("form-error")
	} else {
		d.Keep("form-error")
		d.Text("form-error-text", f.formError)
	}
	for _, t := range tripTypes {
		d.Attr(t.slot, "value", t.value)
		d.Bool(t.slot, "checked", f.values.tripType == t.value)
	}

	d.Attr("client-input", "value", f.values.clientName)
	d.Attr("client-id", "value", f.values.clientID)
	if f.errs.client == "" {
		d.Remove("client-error")
	} else {
		d.Text("client-error", f.errs.client)
		d.Attr("client-input", "aria-describedby", "trip-client-error")
		d.Attr("client-input", "aria-invalid", "true")
	}
	d.Repeat("client-opt", len(f.book), func(i int, row *page.Row) {
		c := f.book[i]
		row.Attr("client-opt", "value", c.name)
		row.Attr("client-opt", "data-client-id", c.id)
		row.Text("client-opt", c.email)
	})

	d.Attr("title", "value", f.values.title)
	if f.errs.title == "" {
		d.Remove("title-error")
	} else {
		d.Text("title-error", f.errs.title)
		d.Attr("title", "aria-describedby", "trip-title-error")
		d.Attr("title", "aria-invalid", "true")
	}
	d.Attr("travelers", "value", f.values.travelerCount)

	// The template picker renders only when there is something to pick.
	if len(f.templates) == 0 {
		d.Remove("template-field") // and the sample option inside it
		return
	}
	d.Keep("template-field")
	d.Repeat("tpl-opt", len(f.templates), func(i int, row *page.Row) {
		t := f.templates[i]
		row.Attr("tpl-opt", "value", t.TemplateID)
		row.Text("tpl-opt", t.Name+" — "+shapeLabel(t.ComponentCount, t.DayCount))
		row.Bool("tpl-opt", "selected", t.TemplateID == f.values.templateID)
	})
}
