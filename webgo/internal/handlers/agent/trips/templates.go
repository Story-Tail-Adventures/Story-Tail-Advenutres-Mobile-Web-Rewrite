package trips

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.4.13, the Trip Template Library: app/(agent)/agent/templates (page, actions) with
// TemplateGrid and lib/agent/templates.ts.
//
// A grid of patterns. Rename and Retire are dialogs, opened here by the URL (?rename=<id>,
// ?retire=<id>) so they work without JavaScript; Next held them in client state. Both write
// through agent-template (op update, op archive). A template has no version: two tabs
// renaming one pattern is last-write-wins, as in Next. Save and Apply live on the trip and
// the new-trip form (detail.go, newtrip.go).

const (
	copyTemplateSaveFailed    = "That did not save. Try again in a moment."
	copyTemplateArchiveFailed = "That did not save. Try again in a moment."
	copyTemplateNameRequired  = "A template needs a name."
)

// templateCard is TemplateCard: the row as the grid shows it.
type templateCard struct {
	id, name, description, tripTypeLabel, shapeLabel, valueLabel, usageLabel string
}

// toTemplateCard is templateCard(): a label for the trip type (the raw value when unknown),
// "6 bookings · 4 days", no price for an unpriced pattern, and a usage count only once used.
func toTemplateCard(r templateRow) templateCard {
	c := templateCard{id: r.TemplateID, name: r.Name, description: deref(r.Description),
		tripTypeLabel: tripTypeLabel(r.TripType), shapeLabel: shapeLabel(r.ComponentCount, r.DayCount)}
	if r.ValueCents != 0 {
		c.valueLabel = money(r.ValueCents)
	}
	if r.TimesUsed > 0 {
		c.usageLabel = strconv.Itoa(r.TimesUsed) + "× used"
	}
	return c
}

type templatesView struct {
	cards  []templateCard
	rename *templateDialog
	retire *templateDialog
}

// templateDialog is an open Rename or Retire. It is keyed by the id it acts on and carries
// its own text, NOT a row of the library: a refusal has to say so even when the row has gone,
// and agent_templates hides an archived one, so retiring twice (two tabs, or Back then Retire
// again) is the ordinary way to reach that. Next kept the dialog in client state, where this
// could not happen.
type templateDialog struct {
	id          string // the template it acts on
	label       string // what the library calls it, or what the form posted once it is gone
	name        string // Rename's Name field, as typed
	description string // Rename's description field, as typed
	message     string // a refusal's sentence
}

func (tv *templatesView) card(id string) *templateCard {
	for i := range tv.cards {
		if tv.cards[i].id == id {
			return &tv.cards[i]
		}
	}
	return nil
}

// dialogFor opens a dialog on id: named by the library while the row is there (another tab
// may have renamed it), and by what the form posted once it is not.
func (tv *templatesView) dialogFor(id, posted string) *templateDialog {
	dl := &templateDialog{id: id, label: posted}
	if c := tv.card(id); c != nil {
		dl.label = c.name
	}
	return dl
}

var templatesSlots = []string{
	"empty", "grid",
	"rename-dialog", "rename-sr", "rename-id", "rename-name", "rename-desc", "rename-error", "rename-error-text",
	"retire-dialog", "retire-sr", "retire-id", "retire-name-field", "retire-name", "retire-error", "retire-error-text",
}

var templatesSpecs = []page.Spec{spec("agent/trips/templates.html", templatesSlots, map[string][]string{
	"tpl": {"t-name", "t-shape", "t-value", "t-value-text", "t-desc", "t-used", "t-used-text",
		"t-rename", "t-rename-sr", "t-retire", "t-retire-sr"},
})}

type templatesRenderer struct {
	d    handlers.Deps
	tmpl *page.Template
}

func (h templatesRenderer) show(w http.ResponseWriter, r *http.Request, v visit, status int, adjust func(*templatesView)) {
	doc := h.tmpl.New()
	st := stateBody
	var tv *templatesView
	rows, ok := loadTemplates(r, h.d, v)
	if !ok {
		st = stateRetry
	} else {
		tv = &templatesView{}
		for _, row := range rows {
			tv.cards = append(tv.cards, toTemplateCard(row))
		}
		if r.Method == http.MethodGet {
			// One at a time, in the page's order: Next held one dialog in client state, so
			// ?rename=A&retire=B could not stack two of them.
			q := r.URL.Query()
			if c := tv.card(q.Get("rename")); q.Get("rename") != "" && c != nil {
				tv.rename = &templateDialog{id: c.id, label: c.name, name: c.name, description: c.description}
			} else if c := tv.card(q.Get("retire")); q.Get("retire") != "" && c != nil {
				tv.retire = &templateDialog{id: c.id, label: c.name}
			}
		}
		if adjust != nil {
			adjust(tv)
		}
	}
	if fillFrame(doc, r, v, st) {
		fillTemplates(doc, tv)
	}
	web.Render(w, h.d.Log, doc, status, web.Private)
}

func mountTemplates(rt *gate.Router, d handlers.Deps) error {
	tmpl, err := d.Pages.Template("agent/trips/templates.html")
	if err != nil {
		return err
	}
	h := templatesRenderer{d: d, tmpl: tmpl}

	rt.Protected("GET /agent/templates", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		h.show(w, r, v, http.StatusOK, nil)
	}))

	post := func(pattern string, fn func(w http.ResponseWriter, r *http.Request, v visit, id string, f url.Values)) {
		// The sign-in round trip lands on the library.
		rt.Protected("GET "+pattern[len("POST "):], http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			web.SeeOther(w, r, "/agent/templates")
		}))
		rt.Protected(pattern, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			f, ok := web.Form(w, r)
			if !ok {
				return
			}
			v, done := begin(w, r, d)
			if done {
				return
			}
			v.here = "/agent/templates"
			id := f.Get("templateId")
			switch {
			case v.noAccess:
				h.show(w, r, v, http.StatusForbidden, nil) // an admin: nothing is sent
			case !v.canRead():
				h.show(w, r, v, http.StatusServiceUnavailable, nil)
			case !uuid.IsUUID(id):
				web.SeeOther(w, r, "/agent/templates")
			default:
				fn(w, r, v, id, f)
			}
		}))
	}

	// renameTemplateAction: op update, the name trimmed, a description only when it has text.
	post("POST /agent/templates/rename", func(w http.ResponseWriter, r *http.Request, v visit, id string, f url.Values) {
		name, desc := trimJS(f.Get("name")), f.Get("description")
		again := func(status int, msg string) {
			h.show(w, r, v, status, func(tv *templatesView) {
				dl := tv.dialogFor(id, name)
				dl.name, dl.description, dl.message = f.Get("name"), desc, msg
				tv.rename = dl
			})
		}
		if name == "" { // Next's Save is disabled until there is a name
			again(http.StatusUnprocessableEntity, copyTemplateNameRequired)
			return
		}
		body := map[string]any{"op": "update", "templateId": id, "name": name}
		if text := trimJS(desc); text != "" {
			body["description"] = text
		}
		out := outcome(call(r.Context(), d, r, v, "agent-template", body), copyTemplateSaveFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			web.SeeOther(w, r, "/agent/templates")
		default:
			again(out.Status, out.Message)
		}
	})

	// archiveTemplateAction: op archive. Retire, not delete: trips built from it keep it.
	post("POST /agent/templates/retire", func(w http.ResponseWriter, r *http.Request, v visit, id string, f url.Values) {
		out := outcome(call(r.Context(), d, r, v, "agent-template", map[string]any{"op": "archive", "templateId": id}), copyTemplateArchiveFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			web.SeeOther(w, r, "/agent/templates")
		default:
			// The form posts the name too, so a refusal can still name the template after
			// the row has left the library (archiving it is what takes it out).
			h.show(w, r, v, out.Status, func(tv *templatesView) {
				dl := tv.dialogFor(id, trimJS(f.Get("name")))
				dl.message = out.Message
				tv.retire = dl
			})
		}
	})
	return nil
}

func fillTemplates(d *page.Doc, tv *templatesView) {
	if len(tv.cards) == 0 {
		d.Keep("empty")
		d.Remove("grid")
	} else {
		d.Remove("empty")
		d.Keep("grid")
		d.Repeat("tpl", len(tv.cards), func(i int, row *page.Row) {
			c := tv.cards[i]
			row.Text("t-name", c.name)
			row.Text("t-shape", c.tripTypeLabel+" · "+c.shapeLabel)
			if c.valueLabel == "" {
				row.Remove("t-value")
			} else {
				row.Keep("t-value")
				row.Text("t-value-text", c.valueLabel)
			}
			optionalRow(row, "t-desc", c.description)
			if c.usageLabel == "" {
				row.Remove("t-used")
			} else {
				row.Keep("t-used")
				row.Text("t-used-text", c.usageLabel)
			}
			row.URL("t-rename", "href", "/agent/templates?rename="+url.QueryEscape(c.id))
			row.Text("t-rename-sr", " "+c.name)
			row.URL("t-retire", "href", "/agent/templates?retire="+url.QueryEscape(c.id))
			row.Text("t-retire-sr", " "+c.name)
		})
	}

	if dl := tv.rename; dl != nil {
		d.Keep("rename-dialog")
		d.Text("rename-sr", "Rename "+dl.label)
		d.Attr("rename-id", "value", dl.id)
		d.Attr("rename-name", "value", dl.name)
		d.Attr("rename-desc", "value", dl.description)
		formError(d, "rename-error", "rename-error-text", dl.message)
	} else {
		d.Remove("rename-dialog")
	}
	if dl := tv.retire; dl != nil {
		d.Keep("retire-dialog")
		d.Text("retire-sr", "Retire "+dl.label)
		d.Attr("retire-id", "value", dl.id)
		d.Attr("retire-name-field", "value", dl.label)
		d.Text("retire-name", dl.label)
		formError(d, "retire-error", "retire-error-text", dl.message)
	} else {
		d.Remove("retire-dialog")
	}
}
