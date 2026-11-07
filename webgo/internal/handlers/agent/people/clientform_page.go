package people

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// §3.3.3 New client (/agent/clients/new) and §3.3.4 Edit (/agent/clients/{clientId}/edit):
// the pages, createClientAction and updateClientAction.

// CLIENT_COPY strings the form chooses between.
const (
	copyNewClientTitle  = "New client"
	copyNewClientSub    = "Required: a name and an email. Everything else can be added later."
	copyEditClientTitle = "Edit"
	copyEditClientSub   = "Email and phone changes are what the portal and every update use."
	copyBackToRoster    = "All clients"
	copySaveFailed      = "That didn't save. Nothing's lost — give it another try."
	copySaveStale       = "This client changed since you opened it. Reload and try again."
	copyDuplicateEmail  = "You already have a client with that email."
	copyRemoveTagLabel  = "Remove tag"
)

// The form's text fields, in the order they appear: each has an in-, err- slot.
var formFields = []string{
	"firstName", "lastName", "preferredName", "email", "phone", "dateOfBirth",
	"addressLine1", "addressLine2", "addressCity", "addressRegion", "addressPostalCode", "addressCountry", "notes",
}

func clientFormSlots() []string {
	out := []string{
		"back", "back-label", "title", "subtitle", "form", "client-id", "expected-version",
		"form-error", "form-error-text", "duplicate", "duplicate-link",
		"hint-preferredname", "hint-notes", "label-addressregion", "label-addresspostalcode",
		"new-tag", "err-tags", "err-importantdates", "invite", "cancel", "save-trip",
	}
	for _, f := range formFields {
		out = append(out, "in-"+slotOf(f), "err-"+slotOf(f))
	}
	// The country select's options are written out in the page, one slot each, because an
	// <option> can be neither a repeat's slot nor hold one.
	for _, c := range countries {
		out = append(out, countrySlot(c.Code))
	}
	return out
}

// slotOf is a field's slot suffix: slot names are lower-case ("in-firstname").
func slotOf(field string) string { return strings.ToLower(field) }

func countrySlot(code string) string { return "country-" + strings.ToLower(code) }

var clientFormRepeats = map[string][]string{
	"tags":        {"tag-value", "tag-text", "tag-remove"},
	"suggestions": {"suggest", "suggest-text"},
	"dates":       {"date-label", "date-value", "date-recurring", "date-remove"},
}

var (
	clientNewSpec  = page.Spec{File: "agent/people/client-new.html", Layout: shell.Agent, Slots: clientFormSlots(), Repeats: clientFormRepeats}
	clientEditSpec = page.Spec{File: "agent/people/client-edit.html", Layout: shell.Agent, Slots: clientFormSlots(), Repeats: clientFormRepeats}
	notFoundSpec   = page.Spec{File: "agent/people/client-not-found.html", Layout: shell.Agent}
)

// formView is everything one rendering of the form needs.
type formView struct {
	Edit        bool
	ClientID    string
	Version     int64
	DisplayName string
	Values      clientValues
	Errors      fieldErrors
	FormError   string
	DuplicateID string
	Suggested   []string
}

// overviewRow is agent_client_overview(): the client's header, snapshot and edit values.
type overviewRow struct {
	ClientID          string          `json:"client_id"`
	DisplayName       string          `json:"display_name"`
	FirstName         string          `json:"first_name"`
	LastName          string          `json:"last_name"`
	PreferredName     *string         `json:"preferred_name"`
	Email             *string         `json:"email"`
	Phone             *string         `json:"phone"`
	DateOfBirth       *string         `json:"date_of_birth"`
	Status            string          `json:"status"`
	Tags              []string        `json:"tags"`
	ImportantDates    json.RawMessage `json:"important_dates"`
	EmergencyContact  json.RawMessage `json:"emergency_contact"`
	AddressLine1      *string         `json:"address_line1"`
	AddressLine2      *string         `json:"address_line2"`
	AddressCity       *string         `json:"address_city"`
	AddressRegion     *string         `json:"address_region"`
	AddressPostalCode *string         `json:"address_postal_code"`
	AddressCountry    *string         `json:"address_country"`
	Notes             *string         `json:"notes"`
	Version           int64           `json:"version"`
	CreatedAt         string          `json:"created_at"`
	ArchivedAt        *string         `json:"archived_at"`
	PreferredDests    []string        `json:"preferred_destinations"`
	TravelStyles      []string        `json:"travel_styles"`
	Dietary           []string        `json:"dietary_restrictions"`
	DietaryNotes      *string         `json:"dietary_notes"`
	Accessibility     []string        `json:"accessibility_needs"`
	AccessibilityNote *string         `json:"accessibility_notes"`
	LoyaltyPrograms   json.RawMessage `json:"loyalty_programs"`
	BudgetBand        *string         `json:"budget_band"`
	FavoritePastTrips *string         `json:"favorite_past_trips"`
	LifetimeCents     Cents           `json:"lifetime_value_cents"`
	LifetimeCurrency  *string         `json:"lifetime_currency"`
	CommissionCents   Cents           `json:"commission_cents"`
	TripCount         int64           `json:"trip_count"`
	ActiveTripCount   int64           `json:"active_trip_count"`
	NoteCount         int64           `json:"note_count"`
	DocumentCount     int64           `json:"document_count"`
	LastContactAt     *string         `json:"last_contact_at"`
	AsOfDate          string          `json:"as_of_date"`
}

// importantDatesOf ports importantDates(): jsonb with no declared schema, read defensively. An
// entry that is not an object is skipped; a label that is not a string reads "Date"; an entry
// with neither a date nor a real label is dropped.
func importantDatesOf(raw json.RawMessage) []importantDate {
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil {
		return nil
	}
	var out []importantDate
	for _, item := range items {
		var obj map[string]json.RawMessage
		if json.Unmarshal(item, &obj) != nil || obj == nil {
			continue
		}
		d := importantDate{Label: "Date"}
		var s string
		if json.Unmarshal(obj["label"], &s) == nil {
			d.Label = s
		}
		hasDate := json.Unmarshal(obj["date"], &s) == nil
		if hasDate {
			d.Date = s
		}
		var b bool
		if json.Unmarshal(obj["recurring"], &b) == nil {
			d.Recurring = b
		}
		if hasDate || d.Label != "Date" {
			out = append(out, d)
		}
	}
	return out
}

// valuesFromOverview is loadClientForEdit's mapping onto the form.
func valuesFromOverview(r overviewRow) clientValues {
	return clientValues{
		FirstName: r.FirstName, LastName: r.LastName, PreferredName: str(r.PreferredName),
		Email: str(r.Email), Phone: str(r.Phone), DateOfBirth: str(r.DateOfBirth), Notes: str(r.Notes),
		AddressLine1: str(r.AddressLine1), AddressLine2: str(r.AddressLine2), AddressCity: str(r.AddressCity),
		AddressRegion: str(r.AddressRegion), AddressPostalCode: str(r.AddressPostalCode),
		AddressCountry: strings.TrimSpace(str(r.AddressCountry)), Tags: r.Tags, ImportantDates: importantDatesOf(r.ImportantDates),
	}
}

type clientIDArgs struct {
	ClientID string `json:"p_client_id"`
}

// loadOverview reads one client. found is false for "not this advisor's client" (no row).
func (a *app) loadOverview(ctx context.Context, v visit, clientID string) (row overviewRow, found bool, err error) {
	rows, err := agentreadCall[overviewRow](ctx, a, v, "agent_client_overview", clientIDArgs{clientID})
	if err != nil || len(rows) == 0 {
		return row, false, err
	}
	return rows[0], true, nil
}

// suggestedTags is the advisor's tag facets, for the "+ tag" chips. A failed read offers none.
func (a *app) suggestedTags(ctx context.Context, v visit) []string {
	rows, err := agentreadCall[rosterSummaryRow](ctx, a, v, "agent_client_roster_summary", struct{}{})
	if err != nil || len(rows) == 0 {
		return nil
	}
	var out []string
	for _, f := range rows[0].TagFacets {
		out = append(out, f.Tag)
	}
	return out
}

func (a *app) serveNewClient(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	a.renderClientForm(w, r, v, formView{Suggested: a.suggestedTags(r.Context(), v)}, http.StatusOK)
}

func (a *app) serveEditClient(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	clientID := r.PathValue("clientId")
	row, found, err := a.loadOverview(r.Context(), v, clientID)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		a.renderNotFound(w, r, v)
		return
	}
	a.renderClientForm(w, r, v, formView{
		Edit: true, ClientID: row.ClientID, Version: row.Version, DisplayName: row.DisplayName,
		Values: valuesFromOverview(row), Suggested: a.suggestedTags(r.Context(), v),
	}, http.StatusOK)
}

func (a *app) renderNotFound(w http.ResponseWriter, r *http.Request, v visit) {
	doc := a.notFound.New()
	a.chrome(w, r, doc, v)
	web.Render(w, a.d.Log, doc, http.StatusNotFound, web.Private)
}

// formStep applies a step that changes the form without saving it, and reports whether the
// post was one: a "+ tag", a tag's close, "Add" (the New tag box), "Add a date", or a date's
// "Remove". The form re-renders with the change; nothing is sent anywhere.
func formStep(f url.Values) (clientValues, bool) {
	v := clientValuesRaw(f)
	switch {
	case f.Has("removeTag"):
		drop := strings.ToLower(strings.TrimSpace(f.Get("removeTag")))
		v.Tags = slices.DeleteFunc(v.Tags, func(t string) bool { return t == drop })
	case f.Has("addTag"):
		if t := strings.ToLower(strings.TrimSpace(f.Get("addTag"))); t != "" && !slices.Contains(v.Tags, t) {
			v.Tags = append(v.Tags, t)
		}
	case f.Get("intent") == "add-tag":
		if t := strings.ToLower(strings.TrimSpace(f.Get("newTag"))); t != "" && !slices.Contains(v.Tags, t) {
			v.Tags = append(v.Tags, t)
		}
	case f.Get("intent") == "add-date":
		v.ImportantDates = append(v.ImportantDates, importantDate{})
	case f.Has("removeDate"):
		if i, err := strconv.Atoi(f.Get("removeDate")); err == nil && i >= 0 && i < len(v.ImportantDates) {
			v.ImportantDates = slices.Delete(v.ImportantDates, i, i+1)
		}
	default:
		return v, false
	}
	return v, true
}

// agent-client's create and update bodies.
type clientCreateBody struct {
	Op     string        `json:"op"`
	Client clientPayload `json:"client"`
}

type clientUpdateBody struct {
	Op              string        `json:"op"`
	ClientID        string        `json:"clientId"`
	ExpectedVersion int64         `json:"expectedVersion"`
	Client          clientPayload `json:"client"`
}

// The function's reply to create and update.
type clientReply struct {
	Outcome          string `json:"outcome"`
	ClientID         string `json:"clientId"`
	ExistingClientID string `json:"existingClientId"`
}

func (a *app) postNewClient(w http.ResponseWriter, r *http.Request)  { a.postClientForm(w, r, false) }
func (a *app) postEditClient(w http.ResponseWriter, r *http.Request) { a.postClientForm(w, r, true) }

func (a *app) postClientForm(w http.ResponseWriter, r *http.Request, edit bool) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	fv := formView{Edit: edit}
	if edit {
		// The client and the version the form was opened at come from the path and the
		// body; the display name for the header is read again (it is not trusted from the form).
		fv.ClientID = r.PathValue("clientId")
		ver, err := strconv.ParseInt(f.Get("expectedVersion"), 10, 64)
		if err != nil || f.Get("clientId") != fv.ClientID {
			fv.Values, fv.FormError = clientValuesFrom(f), copySaveFailed
			a.renderEditForm(w, r, v, fv, http.StatusUnprocessableEntity)
			return
		}
		fv.Version = ver
	}

	if step, isStep := formStep(f); isStep {
		fv.Values = step
		a.renderEditForm(w, r, v, fv, http.StatusOK)
		return
	}

	values := clientValuesFrom(f)
	fv.Values = values
	clean, errs := validateClient(values, time.Now())
	if len(errs) > 0 {
		fv.Errors = errs
		a.renderEditForm(w, r, v, fv, http.StatusUnprocessableEntity)
		return
	}

	var body any = clientCreateBody{Op: "create", Client: toClientPayload(clean)}
	if edit {
		body = clientUpdateBody{Op: "update", ClientID: fv.ClientID, ExpectedVersion: fv.Version, Client: toClientPayload(clean)}
	}
	res := a.d.API.Call(r.Context(), "agent-client", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: body})
	out := web.FromResult(res, copySaveFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
		return
	case out.Conflict:
		fv.FormError = copySaveStale
		a.renderEditForm(w, r, v, fv, http.StatusConflict)
		return
	case !out.OK:
		fv.FormError = out.Message
		if out.Status == http.StatusServiceUnavailable {
			fv.FormError = copySaveFailed
		}
		a.renderEditForm(w, r, v, fv, out.Status)
		return
	}
	var rep clientReply
	_ = json.Unmarshal(res.Data, &rep)
	if rep.Outcome == "duplicate_email" {
		fv.Errors = fieldErrors{"email": copyDuplicateEmail}
		if !edit {
			fv.DuplicateID = rep.ExistingClientID
		}
		a.renderEditForm(w, r, v, fv, http.StatusUnprocessableEntity)
		return
	}
	if edit {
		web.SeeOther(w, r, "/agent/clients/"+url.PathEscape(fv.ClientID))
		return
	}
	if rep.ClientID == "" {
		fv.FormError = copySaveFailed
		a.renderEditForm(w, r, v, fv, http.StatusBadGateway)
		return
	}
	if f.Get("then") == "trip" {
		web.SeeOther(w, r, "/agent/trips/new?client="+url.QueryEscape(rep.ClientID))
		return
	}
	web.SeeOther(w, r, "/agent/clients/"+url.PathEscape(rep.ClientID))
}

// renderEditForm re-renders a posted form: the header's name and the suggestions are read
// again. For an edit whose client is gone, the not-found page.
func (a *app) renderEditForm(w http.ResponseWriter, r *http.Request, v visit, fv formView, status int) {
	fv.Suggested = a.suggestedTags(r.Context(), v)
	if fv.Edit {
		row, found, err := a.loadOverview(r.Context(), v, fv.ClientID)
		switch {
		case err != nil:
			a.renderFailed(w, r, v, true)
			return
		case !found:
			a.renderNotFound(w, r, v)
			return
		}
		fv.DisplayName = row.DisplayName
	}
	a.renderClientForm(w, r, v, fv, status)
}

func (a *app) renderClientForm(w http.ResponseWriter, r *http.Request, v visit, fv formView, status int) {
	tmpl := a.clientNew
	if fv.Edit {
		tmpl = a.clientEdit
	}
	doc := tmpl.New()
	a.chrome(w, r, doc, v)
	fillClientForm(doc, fv)
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillClientForm(doc *page.Doc, fv formView) {
	vals := fv.Values
	clientHref := "/agent/clients/" + url.PathEscape(fv.ClientID)
	if fv.Edit {
		doc.URL("back", "href", clientHref)
		doc.Text("back-label", fv.DisplayName)
		doc.Text("title", copyEditClientTitle+" · "+fv.DisplayName)
		doc.Text("subtitle", copyEditClientSub)
		doc.URL("form", "action", clientHref+"/edit")
		doc.Attr("client-id", "value", fv.ClientID)
		doc.Attr("expected-version", "value", strconv.FormatInt(fv.Version, 10))
		doc.Remove("invite")
		doc.URL("cancel", "href", clientHref)
		doc.Remove("save-trip")
	} else {
		doc.URL("back", "href", "/agent/clients")
		doc.Text("back-label", copyBackToRoster)
		doc.Text("title", copyNewClientTitle)
		doc.Text("subtitle", copyNewClientSub)
		doc.URL("form", "action", "/agent/clients/new")
		doc.Remove("client-id")
		doc.Remove("expected-version")
		doc.Keep("invite")
		doc.URL("cancel", "href", "/agent/clients")
		doc.Keep("save-trip")
	}
	if fv.FormError != "" {
		doc.Keep("form-error")
		doc.Text("form-error-text", fv.FormError)
	} else {
		doc.Remove("form-error")
	}
	if fv.DuplicateID != "" {
		doc.Keep("duplicate")
		doc.URL("duplicate-link", "href", "/agent/clients/"+url.PathEscape(fv.DuplicateID))
	} else {
		doc.Remove("duplicate")
	}

	value := map[string]string{
		"firstName": vals.FirstName, "lastName": vals.LastName, "preferredName": vals.PreferredName,
		"email": vals.Email, "phone": vals.Phone, "dateOfBirth": vals.DateOfBirth,
		"addressLine1": vals.AddressLine1, "addressLine2": vals.AddressLine2, "addressCity": vals.AddressCity,
		"addressRegion": vals.AddressRegion, "addressPostalCode": vals.AddressPostalCode, "notes": vals.Notes,
	}
	hints := map[string]bool{"preferredName": true, "notes": true}
	for _, f := range formFields {
		in, msg := "in-"+slotOf(f), fv.Errors[f]
		switch f {
		case "notes":
			doc.Text(in, value[f])
		case "addressCountry":
			doc.Keep(in)
		default:
			doc.Attr(in, "value", value[f])
		}
		if msg != "" {
			doc.Text("err-"+slotOf(f), msg)
			doc.Attr(in, "aria-invalid", "true")
			doc.Attr(in, "aria-describedby", f+"-error")
			if hints[f] {
				doc.Remove("hint-" + slotOf(f))
			}
			continue
		}
		doc.Remove("err-" + slotOf(f))
		if hints[f] {
			doc.Keep("hint-" + slotOf(f))
			doc.Attr(in, "aria-describedby", f+"-hint")
		}
	}

	country := vals.AddressCountry
	if country == "" {
		country = "US"
	}
	for _, c := range countries {
		doc.Keep(countrySlot(c.Code))
		doc.Bool(countrySlot(c.Code), "selected", c.Code == country)
	}
	if usesUSAddressLabels(country) {
		doc.Text("label-addressregion", "State")
		doc.Text("label-addresspostalcode", "ZIP code")
	} else {
		doc.Text("label-addressregion", "Region")
		doc.Text("label-addresspostalcode", "Postal code")
	}

	doc.Repeat("tags", len(vals.Tags), func(i int, row *page.Row) {
		t := vals.Tags[i]
		row.Attr("tag-value", "value", t)
		row.Text("tag-text", t)
		row.Keep("tag-remove")
		row.Attr("tag-remove", "value", t)
		row.Attr("tag-remove", "aria-label", copyRemoveTagLabel+" "+t)
	})
	// Every suggestion is drawn; the ones already picked are hidden, so the script can show
	// one again when its tag is removed (Next filtered them out on every render).
	doc.Repeat("suggestions", len(fv.Suggested), func(i int, row *page.Row) {
		t := fv.Suggested[i]
		row.Keep("suggest")
		row.Attr("suggest", "value", t)
		row.Bool("suggest", "hidden", slices.Contains(vals.Tags, t))
		row.Text("suggest-text", "+ "+t)
	})
	doc.Attr("new-tag", "value", "")
	textOrRemove(doc, "err-tags", fv.Errors["tags"])

	doc.Repeat("dates", len(vals.ImportantDates), func(i int, row *page.Row) {
		d := vals.ImportantDates[i]
		idx := strconv.Itoa(i)
		row.Attr("date-label", "value", d.Label)
		row.Attr("date-value", "value", d.Date)
		row.Attr("date-recurring", "value", idx)
		row.Bool("date-recurring", "checked", d.Recurring)
		row.Keep("date-remove")
		row.Attr("date-remove", "value", idx)
	})
	textOrRemove(doc, "err-importantdates", fv.Errors["importantDates"])
}
