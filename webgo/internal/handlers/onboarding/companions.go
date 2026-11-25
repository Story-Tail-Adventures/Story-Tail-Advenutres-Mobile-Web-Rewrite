package onboarding

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.12 Travel Companions (web/app/(onboarding)/onboarding/companions).

var companionsSpec = page.Spec{
	File:   "onboarding/companions.html",
	Layout: shell.Onboarding,
	Slots:  companionsSlots(),
	Repeats: mergeRepeats(chromeRepeats, map[string][]string{
		"companions": {
			"companion-initial", "companion-name", "companion-meta",
			"companion-edit", "companion-remove-id", "companion-remove",
		},
	}),
}

// companionCountryPrefix is this form's country picker, 249 static options as 2.1.10's are.
const companionCountryPrefix = "ccountry-"

func companionsSlots() []string {
	out := append(chromeSlots(),
		"list-error", "list-error-text", "empty", "list", "full-note", "add",
		"form", "form-id", "form-title", "form-error", "form-error-text",
		"first-name", "first-name-error", "last-name", "last-name-error",
		"relationship", "relationship-error", "dob", "dob-error",
		"expiry", "expiry-error", "country", "country-error", "cancel",
		"unfinished", "continue", "companions-actions",
	)
	return append(out, countrySlots(companionCountryPrefix)...)
}

// The copy this screen builds in Go (COMPANIONS_TEXT); the rest is in the page file.
const (
	companionsErrorSave   = "That didn't save. Give it another go — nothing was lost."
	companionsErrorRemove = "We couldn't remove them just now. Try again in a moment."
	companionsErrorLoad   = "We couldn't load your travelers just now — anyone you've already " +
		"added is still there. Reload in a moment, or carry on and come back to this."
	companionsFormAddTitle = "Add a traveler"
	companionsPassportNone = "No passport details yet"
)

// maxCompanions is MAX_COMPANIONS: twelve is plenty for one household, and the screen says
// so rather than refusing the thirteenth with nothing to explain it.
const maxCompanions = 12

var companionsStep = stepIndex("companions")

// companionRow is one saved companion.
type companionRow struct {
	ID              string  `json:"id"`
	FirstName       string  `json:"first_name"`
	LastName        string  `json:"last_name"`
	Relationship    *string `json:"relationship"`
	DateOfBirth     *string `json:"date_of_birth"`
	PassportExpiry  *string `json:"passport_expiry"`
	PassportCountry *string `json:"passport_country"`
}

func (c companionRow) name() string { return c.FirstName + " " + c.LastName }

func (c companionRow) form() validate.CompanionForm {
	return validate.CompanionForm{
		FirstName:       c.FirstName,
		LastName:        c.LastName,
		Relationship:    trimmed(c.Relationship),
		DateOfBirth:     trimmed(c.DateOfBirth),
		PassportExpiry:  trimmed(c.PassportExpiry),
		PassportCountry: trimmed(c.PassportCountry),
	}
}

// companionsView is everything one render of this screen needs.
type companionsView struct {
	rows       []companionRow
	readFailed bool
	// editing is the id being edited, "new" for the add form, or "" for no form at all.
	editing string
	form    validate.CompanionForm
	errs    validate.Errors
	formErr string
	listErr string
}

func (a *area) mountCompanions(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(companionsSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, status int, v companionsView) {
		d := tmpl.New()
		fillChrome(d, companionsStep, true)
		d.Keep("companions-actions")

		// One alert above the list: whatever just failed, or the read that did not come back.
		// A read failure is reported rather than swallowed, because an empty list and a lost
		// read look identical to somebody who has added three people.
		switch {
		case v.listErr != "":
			d.Keep("list-error")
			d.Text("list-error-text", v.listErr)
		case v.readFailed:
			d.Keep("list-error")
			d.Text("list-error-text", companionsErrorLoad)
		default:
			d.Remove("list-error")
		}

		full := len(v.rows) >= maxCompanions
		// Removing the <ul> takes its repeat with it, so the rows are only filled when
		// there is a list to fill: Repeat after Remove is "already filled or removed".
		if len(v.rows) == 0 {
			d.Keep("empty")
			d.Remove("list")
			d.Remove("full-note")
			d.Remove("add")
			a.fillCompanionForm(d, v)
			a.render(w, r, d, status)
			return
		}
		d.Remove("empty")
		d.Keep("list")
		d.Repeat("companions", len(v.rows), func(i int, row *page.Row) {
			c := v.rows[i]
			row.Text("companion-initial", initial(c.FirstName))
			row.Text("companion-name", c.name())
			meta, warn := companionMeta(c, a.now())
			row.Text("companion-meta", meta)
			row.Class("companion-meta", "text-warning", warn)
			row.Class("companion-meta", "text-secondary", !warn)
			row.URL("companion-edit", "href", "/onboarding/companions?edit="+url.QueryEscape(c.ID))
			row.Attr("companion-remove-id", "value", c.ID)
			row.Keep("companion-remove-id")
			row.Keep("companion-remove")
			row.Attr("companion-remove", "aria-label", "Remove "+c.name()+" from your travelers")
		})

		if full {
			d.Keep("full-note")
		} else {
			d.Remove("full-note")
		}
		// The add button is gone while the form is open (there is one already) and when the
		// list is full or empty (the empty state carries its own).
		if v.editing == "" && len(v.rows) > 0 && !full {
			d.Keep("add")
		} else {
			d.Remove("add")
		}

		a.fillCompanionForm(d, v)
		a.render(w, r, d, status)
	}

	rt.Protected("GET /onboarding/companions", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		rows, read := a.currentCompanions(r, st)
		v := companionsView{rows: rows, readFailed: !read}
		q := r.URL.Query()
		switch {
		case q.Has("add"):
			v.editing = "new"
		case q.Get("edit") != "":
			id := q.Get("edit")
			c, found := findCompanion(rows, id)
			if !found {
				// The row is gone (removed in another tab, or a stale link): show the list
				// rather than a form posting a dead id.
				web.SeeOther(w, r, "/onboarding/companions")
				return
			}
			v.editing, v.form = id, c.form()
		}
		show(w, r, http.StatusOK, v)
	}))

	rt.Protected("POST /onboarding/companions", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		slug, route := nextStep(companionsStep)

		switch form.Get("action") {
		case actionSkip:
			a.advance(w, r, st, slug, route)
			return

		case actionContinue:
			// Nothing on the screen is unsaved by now — every companion was written as it
			// was added — so this only moves the cursor on.
			if a.off {
				web.SeeOther(w, r, route)
				return
			}
			out := web.FromResult(a.call(r.Context(), st, "onboarding-companions",
				companionAction{Action: "none", Advance: true}), "")
			if out.SignIn {
				web.SeeOther(w, r, web.SignInURL(r))
				return
			}
			web.SeeOther(w, r, route)
			return

		case actionRemove:
			id := form.Get("id")
			rows, read := a.currentCompanions(r, st)
			if id == "" || a.off {
				show(w, r, http.StatusUnprocessableEntity,
					companionsView{rows: rows, readFailed: !read, listErr: companionsErrorRemove})
				return
			}
			out := web.FromResult(a.call(r.Context(), st, "onboarding-companions",
				companionAction{Action: "remove", ID: id}), companionsErrorRemove)
			switch {
			case out.SignIn:
				web.SeeOther(w, r, web.SignInURL(r))
			case !out.OK:
				show(w, r, out.Status, companionsView{rows: rows, readFailed: !read, listErr: companionsErrorRemove})
			default:
				web.SeeOther(w, r, "/onboarding/companions")
			}
			return
		}

		// Save: add or edit.
		editing := form.Get("id")
		f := validate.CompanionForm{
			FirstName:       form.Get("firstName"),
			LastName:        form.Get("lastName"),
			Relationship:    form.Get("relationship"),
			DateOfBirth:     form.Get("dateOfBirth"),
			PassportExpiry:  form.Get("passportExpiry"),
			PassportCountry: form.Get("passportCountry"),
		}
		payload, errs := validate.ParseCompanion(f, a.now())
		rows, read := a.currentCompanions(r, st)
		v := companionsView{rows: rows, readFailed: !read, editing: editingSlot(editing), form: f, errs: errs}
		if !errs.Empty() {
			show(w, r, http.StatusUnprocessableEntity, v)
			return
		}
		if a.off {
			v.formErr = companionsErrorSave
			show(w, r, http.StatusServiceUnavailable, v)
			return
		}

		body := companionAction{Action: "add", CompanionPayload: payload}
		if editing != "" {
			body.Action, body.ID = "edit", editing
		} else {
			// A client-minted UUID v7 makes the retry after a dropped connection safe: the
			// second attempt carries the same id, so it cannot add the same person twice.
			body.ID = uuid.New()
		}
		out := web.FromResult(a.call(r.Context(), st, "onboarding-companions", body), companionsErrorSave)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			v.formErr = out.Message
			show(w, r, out.Status, v)
		default:
			// Back to the list, with the form closed: a 303 to the bare path, so a reload
			// does not re-post the traveler.
			web.SeeOther(w, r, "/onboarding/companions")
		}
	}))
	return nil
}

// fillCompanionForm fills the add/edit form, or takes it out of the page. The form is a URL
// (?add or ?edit=<id>) rather than in-place state, so the back button works and a reload
// does not lose what is in it.
func (a *area) fillCompanionForm(d *page.Doc, v companionsView) {
	if v.editing == "" {
		d.Remove("form")
		d.Remove("unfinished")
		d.Keep("continue")
		return
	}
	d.Keep("form")
	d.Attr("form-id", "value", editingID(v.editing))
	title := companionsFormAddTitle
	if c, ok := findCompanion(v.rows, v.editing); ok {
		title = "Edit " + c.name()
	}
	d.Text("form-title", title)
	if v.formErr == "" {
		d.Remove("form-error")
	} else {
		d.Keep("form-error")
		d.Text("form-error-text", v.formErr)
	}
	fillInput(d, "first-name", v.form.FirstName, v.errs.First("firstName"), false)
	fillInput(d, "last-name", v.form.LastName, v.errs.First("lastName"), false)
	fillInput(d, "relationship", v.form.Relationship, v.errs.First("relationship"), false)
	fillInput(d, "dob", v.form.DateOfBirth, v.errs.First("dateOfBirth"), false)
	d.Attr("dob", "max", validate.TodayISO(a.now()))
	fillInput(d, "expiry", v.form.PassportExpiry, v.errs.First("passportExpiry"), false)
	fillSelect(d, "country", companionCountryPrefix, v.form.PassportCountry, v.errs.First("passportCountry"))
	d.Keep("cancel")
	// Leaving the step with a form open would discard what is in it, so Continue is held
	// back rather than silently throwing the draft away — and told why.
	d.Keep("unfinished")
	d.Keep("continue")
	d.Bool("continue", "disabled", true)
}

// The actions this screen posts beside save and skip.
const (
	actionContinue = "continue"
	actionRemove   = "remove"
)

// companionAction is onboarding-companions' body: what to do, and the companion to do it to.
type companionAction struct {
	Action string `json:"action"`
	ID     string `json:"id,omitempty"`
	validate.CompanionPayload
	Advance bool `json:"advance,omitempty"`
}

// editingID is the hidden id a form posts back: empty for a new companion.
func editingID(editing string) string {
	if editing == "new" {
		return ""
	}
	return editing
}

// editingSlot is the reverse: an empty posted id means the add form.
func editingSlot(id string) string {
	if id == "" {
		return "new"
	}
	return id
}

func findCompanion(rows []companionRow, id string) (companionRow, bool) {
	for _, c := range rows {
		if c.ID == id {
			return c, true
		}
	}
	return companionRow{}, false
}

func (a *area) currentCompanions(r *http.Request, st session.State) ([]companionRow, bool) {
	if a.off {
		return nil, true
	}
	rows, err := supa.Select[companionRow](r.Context(), a.Supa, st.AccessToken, "companion",
		supa.Q().Select("id,first_name,last_name,relationship,date_of_birth,passport_expiry,passport_country").
			Is("archived_at", "null").Order("created_at", true))
	if err != nil {
		a.Log.Warn("onboarding: companions read failed", "err", err)
		return nil, false
	}
	return rows, true
}

// initial is the avatar's letter. Decoration: the name is right beside it, so announcing a
// letter would be noise.
func initial(first string) string {
	for _, r := range first {
		return strings.ToUpper(string(r))
	}
	return ""
}

// companionMeta is the line under a companion's name, and whether it should read as a
// warning: "Spouse · Born 3 September 1989 · Passport expires Sept 2031". A passport inside
// the six-month window many countries insist on says so instead.
func companionMeta(c companionRow, now time.Time) (string, bool) {
	var parts []string
	if rel := trimmed(c.Relationship); rel != "" {
		parts = append(parts, rel)
	}
	if dob := trimmed(c.DateOfBirth); dob != "" {
		parts = append(parts, "Born "+longDate(dob))
	}
	expiry := trimmed(c.PassportExpiry)
	warn := false
	switch {
	case expiry == "":
		parts = append(parts, companionsPassportNone)
	case validate.ExpiresWithinSixMonths(expiry, now):
		warn = true
		parts = append(parts, "Passport expires "+monthYear(expiry)+" — many countries want six months' validity")
	default:
		parts = append(parts, "Passport expires "+monthYear(expiry))
	}
	return strings.Join(parts, " · "), warn
}
