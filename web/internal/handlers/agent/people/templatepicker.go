package people

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
)

// Screen 3.10.3 Template Picker (A3103), ported from components/agent/TemplatePicker.tsx: the
// list on the left, the preview on the right, merged with the REAL client and trip of the
// thread it was opened from.
//
// NEXT'S IS A DIALOG HELD OPEN BY STATE; THIS ONE IS A FORM. Opening it, searching, picking a
// template and inserting are each a post that carries the draft, the note switch and the
// draft's id back and forth, so nothing typed is lost to a round trip and the picker needs no
// script at all. It draws over the pane rather than as a true modal, which is why it does not
// claim aria-modal: without a script the page behind it is still reachable.
//
// A FIELD WITH NO VALUE TURNS "INSERT AS-IS" OFF (Gyasi, 2026-10-14). The preview names what
// is missing in plain words; "Insert & edit" still works and leaves the raw {{token}} in the
// reply box, where Send refuses it until it is replaced.

// mergeContextRow is what agent_message_merge_context answers.
type mergeContextRow struct {
	ClientFirstName  *string  `json:"client_first_name"`
	AgentFirstName   *string  `json:"agent_first_name"`
	TripTitle        *string  `json:"trip_title"`
	TripDestinations []string `json:"trip_destinations"`
	TripStartDate    *string  `json:"trip_start_date"`
	TripEndDate      *string  `json:"trip_end_date"`
	PaymentLabel     *string  `json:"payment_label"`
	PaymentOwedCents *string  `json:"payment_owed_cents"`
	PaymentCurrency  *string  `json:"payment_currency"`
	PaymentDueDate   *string  `json:"payment_due_date"`
	PaymentLink      *string  `json:"payment_link"`
}

func (r mergeContextRow) context() mergeContext {
	return mergeContext{
		ClientFirstName:  str(r.ClientFirstName),
		AgentFirstName:   str(r.AgentFirstName),
		TripTitle:        str(r.TripTitle),
		TripDestinations: r.TripDestinations,
		TripStartDate:    str(r.TripStartDate),
		TripEndDate:      str(r.TripEndDate),
		PaymentLabel:     str(r.PaymentLabel),
		PaymentOwedCents: str(r.PaymentOwedCents),
		PaymentCurrency:  str(r.PaymentCurrency),
		PaymentDueDate:   str(r.PaymentDueDate),
		PaymentLink:      str(r.PaymentLink),
	}
}

type mergeContextArgs struct {
	ClientID    string  `json:"p_client_id"`
	TripID      *string `json:"p_trip_id"`
	MilestoneID *string `json:"p_milestone_id"`
}

// picker is one drawing of the dialog.
type picker struct {
	Templates []messageTemplate
	// Milestone is Trip Detail's "Remind the client" door, kept across every click so the
	// payment fields go on filling. Without it the second post merges nothing.
	Milestone string
	// Values are this thread's own merge values. An empty map is the safe failure: every
	// field reads as missing, so "Insert as-is" is off and Send refuses the raw tokens.
	Values          map[string]string
	Search          string
	SelectedID      string
	ClientFirstName string
}

// loadPicker reads what the picker needs beside the thread. A failed template read offers no
// picker rather than an empty one, as Next's null PickerData does.
func (a *app) loadPicker(r *http.Request, v visit, h threadHeader, milestoneID string) (*picker, error) {
	templates, err := a.loadTemplates(r, v, false)
	if err != nil {
		return nil, err
	}
	args := mergeContextArgs{ClientID: h.ClientID}
	if h.TripID != "" {
		args.TripID = &h.TripID
	}
	if milestoneID != "" {
		args.MilestoneID = &milestoneID
	}
	values := map[string]string{}
	// A merge read that fails or names nothing is not a failed page: the picker still opens,
	// with every field missing.
	if rows, err := agentreadCall[mergeContextRow](r.Context(), a, v, "agent_message_merge_context", args); err == nil && len(rows) > 0 {
		values = mergeValuesOf(rows[0].context())
	}
	return &picker{Templates: templates, Values: values, ClientFirstName: h.ClientFirstName, Milestone: milestoneID}, nil
}

// shown is the groups this search leaves, and the templates in them in the order the list
// draws them.
func (p picker) shown() ([]templateGroup, []messageTemplate) {
	var kept []messageTemplate
	for _, t := range p.Templates {
		if matchesSearch(t, p.Search) {
			kept = append(kept, t)
		}
	}
	groups := groupTemplates(kept)
	var ordered []messageTemplate
	for _, g := range groups {
		ordered = append(ordered, g.Templates...)
	}
	return groups, ordered
}

// selected keeps the preview on something visible: a search that hides the selection moves it
// to the first template still shown.
func (p picker) selected() (messageTemplate, bool) {
	_, ordered := p.shown()
	for _, t := range ordered {
		if t.ID == p.SelectedID {
			return t, true
		}
	}
	if len(ordered) > 0 {
		return ordered[0], true
	}
	return messageTemplate{}, false
}

// openOn is the selection the picker opens with: the first in the order the list shows them,
// or the first in startOn's group (Trip Detail's "Remind the client" starts on Payment
// reminder).
func (p picker) openOn(startOn string) string {
	_, ordered := p.shown()
	if startOn != "" {
		for _, t := range ordered {
			if t.Category == startOn {
				return t.ID
			}
		}
	}
	if len(ordered) > 0 {
		return ordered[0].ID
	}
	return ""
}

// pickerStartOn is Next's PickerData.startOn: a milestone door opens the picker on Payment
// reminder, but only once the milestone actually filled a payment field. Without one, the
// picker opens where it always does.
func pickerStartOn(milestoneID string, values map[string]string) string {
	if milestoneID != "" && values["payment.label"] != "" {
		return "payment_reminder"
	}
	return ""
}

// fillPicker draws the dialog. self is the thread's URL, which every button posts back to.
func fillPicker(doc *page.Doc, p picker, st msgState, self string) {
	doc.URL("pk-form", "action", self)
	doc.Attr("pk-body", "value", st.Body)
	doc.Attr("pk-note", "value", boolValue(st.Note))
	doc.Attr("pk-id", "value", st.MessageID)
	doc.Attr("pk-remind", "value", p.Milestone)
	doc.Attr("pk-draftfor", "value", draftFingerprint(st.Body, st.Note))
	doc.Attr("pk-search", "value", p.Search)
	// The selection the other buttons post back. It is what the preview is showing, not what
	// arrived, so a search that moved the preview moves this too.
	if chosen, ok := p.selected(); ok {
		doc.Attr("pk-sel", "value", chosen.ID)
	} else {
		doc.Attr("pk-sel", "value", "")
	}

	empty := len(p.Templates) == 0
	keepIf(doc, "pk-empty", empty)
	keepIf(doc, "pk-body-grid", !empty)
	keepIf(doc, "pk-search-field", !empty)
	if empty {
		doc.Keep("pk-empty-new")
		// Nothing to insert, so neither button can do anything. Removing the grid takes the
		// list and its repeat with it, so nothing here fills them.
		doc.Remove("pk-insert")
		doc.Remove("pk-insert-asis")
		return
	}

	groups, _ := p.shown()
	keepIf(doc, "pk-no-match", len(groups) == 0)
	keepIf(doc, "pk-list", len(groups) > 0)

	chosen, ok := p.selected()
	keepIf(doc, "pk-preview", ok)
	keepIf(doc, "pk-pick-one", !ok)
	blocked := false
	if ok {
		out := renderTemplate(chosen.Body, p.Values)
		blocked = len(out.Missing) > 0
		doc.Text("pk-preview-for", templatePreviewFor(p.ClientFirstName))
		doc.Text("pk-preview-text", out.Text)
		keepIf(doc, "pk-missing", blocked)
		if blocked {
			doc.Text("pk-missing-text", templateMissing(out.Missing))
		}
	}
	// "Insert as-is" is off while anything is missing; "Insert & edit" still works and leaves
	// the raw token in the reply box.
	doc.Bool("pk-insert", "disabled", !ok)
	doc.Keep("pk-insert")
	doc.Bool("pk-insert-asis", "disabled", !ok || blocked)
	doc.Keep("pk-insert-asis")

	// A search that matches nothing removes the list, and with it this repeat.
	if len(groups) == 0 {
		return
	}
	type row struct {
		label string
		t     messageTemplate
	}
	var rows []row
	for _, g := range groups {
		rows = append(rows, row{label: g.Label})
		for _, t := range g.Templates {
			rows = append(rows, row{t: t})
		}
	}
	doc.Repeat("pk", len(rows), func(i int, r *page.Row) {
		it := rows[i]
		keepIf2(r, "pk-group", it.label != "")
		keepIf2(r, "pk-item", it.label == "")
		if it.label != "" {
			r.Text("pk-group", it.label)
			return
		}
		// Its own op, so one click says both what to do and which template.
		r.Attr("pk-item", "value", "pick:"+it.t.ID)
		r.Keep("pk-item")
		r.Text("pk-item-name", it.t.Name)
		on := ok && it.t.ID == chosen.ID
		r.Class("pk-item", "ppl-pk-on", on)
		if on {
			r.Attr("pk-item", "aria-current", "true")
		}
	})
}

func boolValue(on bool) string {
	if on {
		return "true"
	}
	return "false"
}

// pickerFromForm reads the picker's own state back out of a post. The selection rides on the
// op of the list button that was clicked ("pick:<id>"), because a button posts one name and
// one value, and a hidden field would be read before it.
func pickerFromForm(f url.Values) (search, selected string) {
	op := f.Get("op")
	id := f.Get("tpl")
	if rest, ok := strings.CutPrefix(op, "pick:"); ok {
		id = rest
	}
	return strings.TrimSpace(f.Get("tq")), uuidOrEmpty(id)
}

// pickerOp is the op with a list button's template id taken off it.
func pickerOp(op string) string {
	if strings.HasPrefix(op, "pick:") {
		return "pick"
	}
	return op
}
