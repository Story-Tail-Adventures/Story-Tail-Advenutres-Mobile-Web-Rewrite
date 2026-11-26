package trips

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.4.4, Trip Builder Workspace, with §3.4.5 to §3.4.12's sheets: the builder page and
// builder/actions.ts (saveComponentAction, removeComponentAction, moveComponentAction), with
// lib/agent/tripBuilder.ts (the supplier picker) and components/agent/TripBuilder*.tsx and
// TripComponentSheet.tsx.
//
// The sheet lives in the URL (?add=<kind>, ?edit=<id>), so the back button closes it and the
// whole page renders on the server. Saving posts to agent-trip's component_upsert; a 409 is
// "this trip changed in another tab". Removing and moving post too, and come straight back.

func builderPath(tripID string) string { return tripPath(tripID) + "/builder" }

// supplierRow is AgentSupplierRow.
type supplierRow struct {
	SupplierID           string       `json:"supplier_id"`
	Name                 string       `json:"name"`
	Kind                 string       `json:"kind"`
	DefaultCommissionPct *json.Number `json:"default_commission_pct"`
	PaymentTerms         *string      `json:"commission_payment_terms"`
	PaymentLagDays       *int         `json:"commission_payment_lag_days"`
}

// supplierKinds are supplier_kind's eight values, in the enum's (and the read's) order, each
// a static <optgroup> in the page with its own repeat (repeats cannot nest).
var supplierKinds = []string{"airline", "hotel_brand", "resort", "cruise_line", "tour_operator", "insurance", "transfer", "other"}

func loadSuppliers(r *http.Request, d handlers.Deps, v visit) []supplierRow {
	if !v.canRead() {
		return nil
	}
	rows, err := agentread.Call[supplierRow](r.Context(), d.Supa, v.st, "agent_suppliers", struct{}{}, d.Log)
	if err != nil {
		return nil
	}
	if rows == nil {
		rows = []supplierRow{}
	}
	return rows
}

// builderView is everything one render of the builder shows.
type builderView struct {
	tripID     string
	ov         *overview
	components []component
	suppliers  []supplierRow
	seeded     string // "", "failed" or a count
	sheet      *componentValues
	sheetErrs  map[string]string
	sheetError string
	editingID  string
	save       *saveForm
}

var builderSlots = func() []string {
	s := []string{"not-found", "trip", "seed-failed", "seed-applied", "seed-applied-text",
		"back-link", "client-name", "title", "total", "commission", "count", "grid", "save-sr",
		"canvas-empty", "canvas",
		"sheet", "s-kind", "s-id", "s-overline", "s-heading", "s-error", "s-error-text",
		"f-name-label", "f-name", "f-name-hint", "f-name-error",
		"f-flag-cell", "f-flag", "f-notes", "f-cost", "f-cost-error", "f-pct", "f-pct-error",
		"f-commission", "f-commission-error", "s-cancel", "f-end-date-error",
		"save-dialog", "save-receipt", "save-form", "save-name", "save-description", "save-name-hint", "save-error", "save-error-text",
		"save-actions", "save-done", "save-done-link"}
	for _, k := range componentRail {
		s = append(s, "add-"+k)
	}
	for _, c := range componentColumns {
		k := slotKey(c)
		s = append(s, "carry-"+k, "f-"+k+"-cell", "f-"+k+"-label", "f-"+k)
	}
	for _, i := range []string{"plane", "building", "ship", "trip", "sparkle", "shield", "receipt"} {
		s = append(s, "s-icon-"+i)
	}
	for _, k := range supplierKinds {
		s = append(s, "sg-"+slotKey(k))
	}
	return s
}()

var builderSpecs = []page.Spec{spec("agent/trips/builder.html", builderSlots, func() map[string][]string {
	m := map[string][]string{
		"comp": append([]string{"comp", "up-form", "up-id", "up-btn", "up-sr", "down-form", "down-id", "down-btn", "down-sr",
			"c-title", "c-subtitle", "c-cost", "c-edit", "c-edit-sr", "rm-form", "rm-id", "rm-sr"}, componentIconSlots...),
		"detail-text": {"dt-label", "dt-input"},
	}
	for _, k := range supplierKinds {
		m["sup-"+slotKey(k)] = []string{"sup-" + slotKey(k)}
	}
	return m
}())}

type builderRenderer struct {
	d    handlers.Deps
	tmpl *page.Template
}

// show reads the trip, its components and the suppliers, and renders the builder. sheet,
// when not nil, is a refused sheet coming back with what was typed.
func (h builderRenderer) show(w http.ResponseWriter, r *http.Request, v visit, tripID string, status int, adjust func(*builderView)) {
	doc := h.tmpl.New()
	bv := &builderView{tripID: tripID}
	st := stateBody
	notFound := false
	switch {
	case !v.canRead():
		st = stateRetry
	case !uuid.IsUUID(tripID):
		notFound = true
	default:
		var res overviewResult
		parallel(
			func() { res = loadOverview(r, h.d, v, tripID) },
			func() { bv.components = loadComponents(r, h.d, v, tripID) },
			func() { bv.suppliers = loadSuppliers(r, h.d, v) },
		)
		switch {
		case res.notFound:
			notFound = true
		case res.ov == nil || bv.components == nil || bv.suppliers == nil:
			st = stateRetry
		default:
			bv.ov = res.ov
		}
	}
	if notFound { // also after a refused write whose trip is gone on the re-read
		status = http.StatusNotFound
	}
	if bv.ov != nil {
		q := r.URL.Query()
		if r.Method == http.MethodGet {
			if s := q.Get("seeded"); s == "failed" {
				bv.seeded = s
			} else if n, ok := smallCount(q, "seeded"); ok && q.Has("seeded") {
				bv.seeded = strconv.Itoa(n)
			}
			// The sheet: ?edit= a row on this trip, else ?add= a kind.
			if id := q.Get("edit"); id != "" {
				for _, c := range bv.components {
					if c.id == id {
						vals := editValues(c.row)
						bv.sheet, bv.editingID = &vals, c.id
					}
				}
			}
			if bv.sheet == nil {
				if kind := componentKindFromParam(q.Get("add")); kind != "" {
					vals := emptyComponent(kind)
					bv.sheet = &vals
				}
			}
			if q.Get("saved") == "1" {
				b, ok1 := smallCount(q, "bookings")
				dd, ok2 := smallCount(q, "days")
				if ok1 && ok2 {
					bv.save = &saveForm{receipt: savedReceipt(b, dd)}
				}
			}
		}
		if adjust != nil {
			adjust(bv)
		}
	}
	if fillFrame(doc, r, v, st) {
		if notFound {
			doc.Keep("not-found")
			doc.Remove("trip")
		} else {
			doc.Remove("not-found")
			doc.Keep("trip")
			fillBuilder(doc, bv)
		}
	}
	web.Render(w, h.d.Log, doc, status, web.Private)
}

func mountBuilder(rt *gate.Router, d handlers.Deps) error {
	tmpl, err := d.Pages.Template("agent/trips/builder.html")
	if err != nil {
		return err
	}
	h := builderRenderer{d: d, tmpl: tmpl}

	rt.Protected("GET /agent/trips/{tripId}/builder", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		h.show(w, r, v, r.PathValue("tripId"), http.StatusOK, nil)
	}))

	post := func(pattern string, fn func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values)) {
		afterSignIn(rt, pattern, builderPath)
		rt.Protected(pattern, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			f, ok := web.Form(w, r)
			if !ok {
				return
			}
			v, done := begin(w, r, d)
			if done {
				return
			}
			tripID := r.PathValue("tripId")
			v.here = builderPath(tripID)
			switch {
			case !uuid.IsUUID(tripID):
				h.show(w, r, v, tripID, http.StatusNotFound, nil)
			case v.noAccess:
				h.show(w, r, v, tripID, http.StatusForbidden, nil) // an admin: nothing is sent
			case !v.canRead():
				h.show(w, r, v, tripID, http.StatusServiceUnavailable, nil)
			default:
				fn(w, r, v, tripID, f)
			}
		}))
	}

	// saveComponentAction: validate, then agent-trip component_upsert. Every column goes:
	// a sheet that does not show one carries it, because the upsert replaces the row.
	post("POST /agent/trips/{tripId}/builder/component", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		vals := componentFromForm(f)
		again := func(status int, errs map[string]string, msg string) {
			h.show(w, r, v, tripID, status, func(bv *builderView) {
				bv.sheet, bv.sheetErrs, bv.sheetError = &vals, errs, msg
				bv.editingID = vals.componentID
			})
		}
		if errs := validateComponent(vals); len(errs) > 0 {
			again(http.StatusUnprocessableEntity, errs, "")
			return
		}
		cost, _ := dollarsToCents(vals.cost)
		detail := map[string]any{}
		for _, field := range componentSpecs[vals.kind].detail {
			raw, ok := vals.detail[field.key]
			if !ok || raw == "" {
				continue
			}
			if field.kind == "flag" {
				detail[field.key] = true
			} else {
				detail[field.key] = raw
			}
		}
		body := map[string]any{
			"op": "component_upsert", "tripId": tripID, "kind": vals.kind,
			"displayName": vals.displayName, "costCents": cost, "detail": detail,
		}
		// `x || undefined`: an empty value is left out, never sent as "".
		for key, value := range map[string]string{
			"componentId": vals.componentID, "supplierId": vals.supplierID, "commissionPct": vals.commissionPct,
			"location": vals.cols["location"], "startDate": vals.cols["startDate"], "endDate": vals.cols["endDate"],
			"startTime": vals.cols["startTime"], "endTime": vals.cols["endTime"],
			"confirmationNumber": vals.cols["confirmationNumber"],
		} {
			if value != "" {
				body[key] = value
			}
		}
		if vals.commission != "" {
			c, _ := dollarsToCents(vals.commission)
			body["commissionCents"] = c
		}
		res := call(r.Context(), d, r, v, "agent-trip", body)
		out := outcome(res, copyBuilderFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			web.SeeOther(w, r, builderPath(tripID))
		case out.Conflict:
			again(out.Status, nil, copyBuilderStale)
		default:
			again(out.Status, nil, out.Message)
		}
	})

	// removeComponentAction: archive, then back to the builder whatever happened (as Next).
	post("POST /agent/trips/{tripId}/builder/remove", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		id := f.Get("componentId")
		if uuid.IsUUID(id) {
			res := call(r.Context(), d, r, v, "agent-trip", map[string]any{
				"op": "component_archive", "tripId": tripID, "componentId": id,
			})
			if res.Kind == api.Unauthenticated {
				signIn(w, r, v)
				return
			}
		}
		web.SeeOther(w, r, builderPath(tripID))
	})

	// moveComponentAction: swap with the neighbour in the order just read, send the whole order.
	post("POST /agent/trips/{tripId}/builder/move", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		id, dir := f.Get("componentId"), f.Get("direction")
		if id == "" || (dir != "up" && dir != "down") {
			web.SeeOther(w, r, builderPath(tripID))
			return
		}
		comps := loadComponents(r, d, v, tripID)
		ids := make([]string, 0, len(comps))
		from := -1
		for i, c := range comps {
			ids = append(ids, c.id)
			if c.id == id {
				from = i
			}
		}
		to := from + 1
		if dir == "up" {
			to = from - 1
		}
		if comps == nil || from < 0 || to < 0 || to >= len(ids) {
			web.SeeOther(w, r, builderPath(tripID))
			return
		}
		ids[from], ids[to] = ids[to], ids[from]
		res := call(r.Context(), d, r, v, "agent-trip", map[string]any{
			"op": "component_reorder", "tripId": tripID, "componentIds": ids,
		})
		if res.Kind == api.Unauthenticated {
			signIn(w, r, v)
			return
		}
		web.SeeOther(w, r, builderPath(tripID))
	})

	post("POST /agent/trips/{tripId}/builder/save-template", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		saveTemplate(w, r, d, v, tripID, f, builderPath(tripID), func(status int, sf *saveForm) {
			h.show(w, r, v, tripID, status, func(bv *builderView) { bv.save = sf })
		})
	})
	return nil
}

func fillBuilder(d *page.Doc, bv *builderView) {
	ov, id := bv.ov, bv.tripID
	switch bv.seeded {
	case "":
		d.Remove("seed-failed")
		d.Remove("seed-applied")
	case "failed":
		d.Keep("seed-failed")
		d.Remove("seed-applied")
	default:
		n, _ := strconv.Atoi(bv.seeded)
		d.Remove("seed-failed")
		d.Keep("seed-applied")
		d.Text("seed-applied-text", seedApplied(n))
	}

	d.URL("back-link", "href", tripPath(id))
	d.Text("client-name", ov.clientName)
	d.Text("title", ov.title)
	d.Text("total", ov.totalValueLabel)
	d.Text("commission", ov.totalCommission)
	d.Text("count", plural(len(bv.components), "piece", "pieces"))

	d.Keep("grid")
	for _, k := range componentRail {
		d.URL("add-"+k, "href", builderPath(id)+"?add="+k)
	}
	d.Text("save-sr", " — "+ov.title)

	// The canvas.
	if len(bv.components) == 0 {
		d.Keep("canvas-empty")
		d.Remove("canvas") // and the sample row inside it
	} else {
		d.Remove("canvas-empty")
		d.Keep("canvas")
		n := len(bv.components)
		d.Repeat("comp", n, func(i int, row *page.Row) {
			c := bv.components[i]
			editing := c.id == bv.editingID
			row.Keep("comp")
			row.Class("comp", "trp-crow-editing", editing)
			if editing {
				row.Attr("comp", "aria-current", "true")
			}
			for _, dir := range []string{"up", "down"} {
				row.URL(dir+"-form", "action", builderPath(id)+"/move")
				row.Attr(dir+"-id", "value", c.id)
				row.Keep(dir + "-btn")
			}
			row.Bool("up-btn", "disabled", i == 0)
			row.Bool("down-btn", "disabled", i == n-1)
			row.Text("up-sr", "Move up — "+c.title)
			row.Text("down-sr", "Move down — "+c.title)
			for _, s := range componentIconSlots {
				if s == "c-icon-"+c.icon {
					row.Keep(s)
				} else {
					row.Remove(s)
				}
			}
			row.Text("c-title", c.title)
			if c.subtitle == "" {
				row.Remove("c-subtitle")
			} else {
				row.Text("c-subtitle", c.subtitle)
			}
			row.Text("c-cost", c.costLabel)
			row.URL("c-edit", "href", builderPath(id)+"?edit="+url.QueryEscape(c.id))
			row.Text("c-edit-sr", " "+c.title)
			row.URL("rm-form", "action", builderPath(id)+"/remove")
			row.Attr("rm-id", "value", c.id)
			row.Text("rm-sr", "Remove from trip — "+c.title)
		})
	}

	if bv.sheet == nil {
		d.Remove("sheet")
	} else {
		fillSheet(d, bv)
	}
	fillBuilderSaveDialog(d, bv)
}

func fillSheet(d *page.Doc, bv *builderView) {
	vals := *bv.sheet
	spec := componentSpecs[vals.kind]
	isEdit := vals.componentID != ""
	d.Keep("sheet")
	d.URL("sheet", "action", builderPath(bv.tripID)+"/component")
	d.Attr("s-kind", "value", vals.kind)
	if isEdit {
		d.Attr("s-id", "value", vals.componentID)
	} else {
		d.Remove("s-id")
	}
	for _, i := range []string{"plane", "building", "ship", "trip", "sparkle", "shield", "receipt"} {
		if i == spec.icon {
			d.Keep("s-icon-" + i)
		} else {
			d.Remove("s-icon-" + i)
		}
	}
	if isEdit {
		d.Text("s-overline", "Edit")
		d.Text("s-heading", spec.shortLabel)
	} else {
		d.Text("s-overline", "Add to this trip")
		d.Text("s-heading", spec.addLabel)
	}
	if bv.sheetError == "" {
		d.Remove("s-error")
	} else {
		d.Keep("s-error")
		d.Text("s-error-text", bv.sheetError)
	}

	errOf := func(field string) string { return bv.sheetErrs[field] }
	d.Text("f-name-label", spec.nameLabel)
	d.Attr("f-name", "value", vals.displayName)
	d.Attr("f-name", "placeholder", spec.namePlaceholder)
	if e := errOf("displayName"); e != "" {
		d.Remove("f-name-hint")
		d.Text("f-name-error", e)
		d.Attr("f-name", "aria-invalid", "true")
		d.Attr("f-name", "aria-describedby", "component-displayName-error")
	} else {
		d.Keep("f-name-hint")
		d.Remove("f-name-error")
	}

	// The supplier picker: one <optgroup> per kind that has suppliers, in the read's order.
	for _, k := range supplierKinds {
		var group []supplierRow
		for _, s := range bv.suppliers {
			if s.Kind == k || (k == "other" && !contains(supplierKinds, s.Kind)) {
				group = append(group, s)
			}
		}
		sk := slotKey(k)
		if len(group) == 0 {
			d.Remove("sg-" + sk) // with its sample option
			continue
		}
		d.Keep("sg-" + sk)
		d.Repeat("sup-"+sk, len(group), func(i int, row *page.Row) {
			s := group[i]
			row.Attr("sup-"+sk, "value", s.SupplierID)
			row.Text("sup-"+sk, s.Name)
			row.Bool("sup-"+sk, "selected", s.SupplierID == vals.supplierID)
			if s.DefaultCommissionPct != nil {
				row.Attr("sup-"+sk, "data-pct", jsNumberString(*s.DefaultCommissionPct))
			}
		})
	}

	// The six columns: shown with this kind's label, or carried as hidden fields.
	for _, c := range componentColumns {
		k := slotKey(c)
		label, shown := spec.columns[c]
		if shown {
			d.Remove("carry-" + k)
			d.Keep("f-" + k + "-cell")
			d.Text("f-"+k+"-label", label)
			d.Attr("f-"+k, "value", vals.cols[c])
		} else {
			d.Attr("carry-"+k, "value", vals.cols[c])
			d.Remove("f-" + k + "-cell") // the end date's error goes with it
		}
	}
	if _, shown := spec.columns["endDate"]; shown {
		if e := errOf("endDate"); e != "" {
			d.Text("f-end-date-error", e)
			d.Attr("f-end-date", "aria-invalid", "true")
			d.Attr("f-end-date", "aria-describedby", "component-endDate-error")
		} else {
			d.Remove("f-end-date-error")
		}
	}

	// The detail fields: text ones repeat, the flag and the notes are fixed.
	var texts []detailField
	hasFlag := false
	for _, f := range spec.detail {
		switch f.kind {
		case "text":
			texts = append(texts, f)
		case "flag":
			hasFlag = true
		}
	}
	d.Repeat("detail-text", len(texts), func(i int, row *page.Row) {
		f := texts[i]
		row.Text("dt-label", f.label)
		row.Attr("dt-input", "name", "detail."+f.key)
		row.Attr("dt-input", "value", vals.detail[f.key])
	})
	if hasFlag {
		d.Keep("f-flag-cell")
		d.Bool("f-flag", "checked", vals.detail["gratuities_included"] == "on")
		d.Keep("f-flag")
	} else {
		d.Remove("f-flag-cell")
	}
	d.Text("f-notes", vals.detail["notes"])

	money := func(slot, errSlot, field, value string) {
		d.Attr(slot, "value", value)
		if e := errOf(field); e != "" {
			d.Text(errSlot, e)
			d.Attr(slot, "aria-invalid", "true")
			d.Attr(slot, "aria-describedby", "component-"+field+"-error")
		} else {
			d.Remove(errSlot)
		}
	}
	money("f-cost", "f-cost-error", "cost", vals.cost)
	money("f-pct", "f-pct-error", "commissionPct", vals.commissionPct)
	money("f-commission", "f-commission-error", "commission", vals.commission)
	d.URL("s-cancel", "href", builderPath(bv.tripID))
}

func fillBuilderSaveDialog(d *page.Doc, bv *builderView) {
	sf := bv.save
	d.Keep("save-dialog")
	if sf != nil {
		d.Bool("save-dialog", "open", true)
	}
	d.URL("save-form", "action", builderPath(bv.tripID)+"/save-template")
	if sf != nil && sf.receipt != "" {
		d.Text("save-receipt", sf.receipt)
		d.Remove("save-form")
		d.Remove("save-actions")
		d.Keep("save-done")
		d.URL("save-done-link", "href", builderPath(bv.tripID))
		return
	}
	d.Remove("save-receipt")
	d.Remove("save-done")
	d.Keep("save-actions")
	name, desc := bv.ov.title, ""
	if sf != nil {
		name, desc = sf.name, sf.description
	}
	d.Attr("save-name", "value", name)
	d.Attr("save-description", "value", desc)
	nameHint(d, name)
	if sf == nil || sf.err == "" {
		d.Remove("save-error")
	} else {
		d.Keep("save-error")
		d.Text("save-error-text", sf.err)
	}
}

// slotKey turns a column or kind name into a slot name: startDate is start-date, hotel_brand
// is hotel-brand (slot names are lower-case kebab).
func slotKey(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '_':
			b.WriteByte('-')
		case r >= 'A' && r <= 'Z':
			b.WriteByte('-')
			b.WriteRune(r + ('a' - 'A'))
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
