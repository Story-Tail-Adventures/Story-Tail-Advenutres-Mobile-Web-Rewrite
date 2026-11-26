package people

import (
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screens 3.10.4 Template Library and 3.10.5 Template Editor, ported from
// app/(agent)/agent/messages/templates/** and components/agent/{MessageTemplateLibrary,
// MessageTemplateEditor}.tsx.
//
// EVERY CONTROL IS A LINK OR A FORM. Next runs Duplicate, Archive, Restore and Save through
// server actions from a client component; here each is a POST that redirects, so the library
// is a URL and the back button means what it says. The one thing a script adds is the
// editor's live preview and putting a merge field in at the cursor; without it the field
// chips post and the server appends.

var templatesSpec = page.Spec{
	File:   "agent/people/templates.html",
	Layout: shell.Agent,
	Slots: []string{
		"tpl-title", "tpl-sub", "tpl-view", "tpl-new", "tpl-error", "tpl-receipt",
		"tpl-empty", "tpl-empty-title", "tpl-empty-body", "tpl-grid",
	},
	Repeats: map[string][]string{
		"tpl": {
			"t-group", "t-card", "t-form", "t-id", "t-view", "t-name", "t-meta",
			"t-edit", "t-edit-name", "t-dup", "t-dup-name", "t-arch", "t-arch-name",
			"t-restore", "t-restore-name",
		},
	},
}

var templateNotFoundSpec = page.Spec{File: "agent/people/template-not-found.html", Layout: shell.Agent}

var templateEditorSpec = page.Spec{
	File:   "agent/people/template-editor.html",
	Layout: shell.Agent,
	Slots: []string{
		"ed-form", "ed-id", "ed-category-label", "ed-h1", "ed-status", "ed-archive", "ed-error",
		"ed-name", "ed-name-error", "ed-body", "ed-body-error", "ed-body-hint",
		"ed-tags", "ed-tag-list", "ed-preview",
		"cat-lead-response", "cat-proposal", "cat-booking-confirmation", "cat-pre-trip",
		"cat-post-trip", "cat-payment-reminder", "cat-other",
	},
	Repeats: map[string][]string{
		"field": {"f-chip", "f-label"},
		"tag":   {"g-tag"},
	},
}

const templatesPath = "/agent/messages/templates"

// ── Reads ────────────────────────────────────────────────────────────────────────────────

type templatesArgs struct {
	Archived bool `json:"p_archived"`
}

type templateArgs struct {
	TemplateID string `json:"p_template_id"`
}

// loadTemplates reads one shelf of the library.
func (a *app) loadTemplates(r *http.Request, v visit, archived bool) ([]messageTemplate, error) {
	rows, err := agentreadCall[messageTemplateRow](r.Context(), a, v, "agent_message_templates", templatesArgs{archived})
	if err != nil {
		return nil, err
	}
	out := make([]messageTemplate, len(rows))
	for i, row := range rows {
		out[i] = toTemplate(row, v.me.TimeZone)
	}
	return out, nil
}

// loadTemplate reads one template. found is false for no such template and for somebody
// else's alike, so ids cannot be probed.
func (a *app) loadTemplate(r *http.Request, v visit, templateID string) (messageTemplate, bool, error) {
	if !uuidPattern.MatchString(templateID) {
		return messageTemplate{}, false, nil
	}
	rows, err := agentreadCall[messageTemplateRow](r.Context(), a, v, "agent_message_template", templateArgs{templateID})
	if err != nil {
		return messageTemplate{}, false, err
	}
	if len(rows) == 0 {
		return messageTemplate{}, false, nil
	}
	return toTemplate(rows[0], v.me.TimeZone), true, nil
}

// ── 3.10.4 Template Library ──────────────────────────────────────────────────────────────

// libraryHref is this shelf's URL, so every form comes back to the list it was on.
func libraryHref(archived bool) string {
	if archived {
		return templatesPath + "?view=archived"
	}
	return templatesPath
}

// templateReceipt is the word a write left behind, on the library page that loads next.
func templateReceipt(w http.ResponseWriter, r *http.Request, secure bool) string {
	rc, ok := takeReceipt(w, r, secure)
	if !ok || rc.Kind != "template" {
		return ""
	}
	switch rc.Outcome {
	case "duplicated":
		return tplDuplicated
	case "archived":
		return tplArchivedDone
	case "restored":
		return tplRestoredDone
	case "saved":
		return tplSaved
	case "nothing":
		return tplNothingChanged
	}
	return ""
}

type libraryState struct {
	Error   string
	Receipt string
}

func (a *app) serveTemplates(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	archived := r.URL.Query().Get("view") == "archived"
	a.renderTemplates(w, r, v, archived, libraryState{Receipt: templateReceipt(w, r, a.d.SecureCookies)}, http.StatusOK)
}

func (a *app) renderTemplates(w http.ResponseWriter, r *http.Request, v visit, archived bool, st libraryState, status int) {
	templates, err := a.loadTemplates(r, v, archived)
	if err != nil {
		a.renderFailed(w, r, v, true)
		return
	}
	doc := a.templates.New()
	a.chrome(w, r, doc, v)
	fillTemplates(doc, groupTemplates(templates), archived, st)
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillTemplates(doc *page.Doc, groups []templateGroup, archived bool, st libraryState) {
	doc.Text("tpl-title", pick(archived, tplArchivedTitle, tplTitle))
	// The archived shelf is its own heading; the subtitle belongs to the live one.
	if archived {
		doc.Remove("tpl-sub")
	} else {
		doc.Text("tpl-sub", tplSubtitle)
	}
	doc.Text("tpl-view", pick(archived, tplViewLive, tplViewArchived))
	doc.URL("tpl-view", "href", libraryHref(!archived))
	keepIf(doc, "tpl-new", !archived)

	if st.Error == "" {
		doc.Remove("tpl-error")
	} else {
		doc.Text("tpl-error", st.Error)
	}
	if st.Receipt == "" {
		doc.Remove("tpl-receipt")
	} else {
		doc.Text("tpl-receipt", st.Receipt)
	}

	keepIf(doc, "tpl-empty", len(groups) == 0)
	if len(groups) == 0 {
		doc.Text("tpl-empty-title", pick(archived, tplEmptyArchived, tplTitle))
		doc.Text("tpl-empty-body", pick(archived, tplEmptyArchivedBody, tplEmptyLibrary))
	}
	keepIf(doc, "tpl-grid", len(groups) > 0)
	if len(groups) == 0 {
		return
	}

	// One flat repeat: a heading row, then its cards, then the next heading.
	type row struct {
		group string
		t     messageTemplate
	}
	var rows []row
	for _, g := range groups {
		rows = append(rows, row{group: g.Label})
		for _, t := range g.Templates {
			rows = append(rows, row{t: t})
		}
	}
	view := ""
	if archived {
		view = "archived"
	}
	doc.Repeat("tpl", len(rows), func(i int, r *page.Row) {
		it := rows[i]
		keepIf2(r, "t-group", it.group != "")
		keepIf2(r, "t-card", it.group == "")
		if it.group != "" {
			r.Text("t-group", it.group)
			return
		}
		r.Keep("t-form")
		r.Attr("t-id", "value", it.t.ID)
		r.Attr("t-view", "value", view)
		r.Text("t-name", it.t.Name)
		meta := it.t.LastEditedLabel
		if len(it.t.Tags) > 0 {
			meta += " · " + strings.Join(it.t.Tags, ", ")
		}
		r.Text("t-meta", meta)
		// An archived template is not edited or copied until it is back.
		keepIf2(r, "t-edit", !archived)
		keepIf2(r, "t-dup", !archived)
		keepIf2(r, "t-arch", !archived)
		keepIf2(r, "t-restore", archived)
		// Each button says which template it acts on, for a screen reader moving by button.
		named := " " + it.t.Name
		if archived {
			r.Text("t-restore-name", named)
			return
		}
		r.URL("t-edit", "href", templatesPath+"/"+it.t.ID)
		r.Text("t-edit-name", named)
		r.Text("t-dup-name", named)
		r.Text("t-arch-name", named)
	})
}

type templateWriteBody struct {
	Op            string   `json:"op"`
	TemplateID    string   `json:"templateId"`
	NewTemplateID string   `json:"newTemplateId,omitempty"`
	Archived      *bool    `json:"archived,omitempty"`
	Category      string   `json:"category,omitempty"`
	Name          string   `json:"name,omitempty"`
	Body          string   `json:"body,omitempty"`
	Tags          []string `json:"tags,omitempty"`
}

// postTemplates is the library's Duplicate, Archive and Restore.
func (a *app) postTemplates(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	archived := f.Get("view") == "archived"
	templateID := f.Get("templateId")
	if !uuidPattern.MatchString(templateID) {
		web.SeeOther(w, r, libraryHref(archived))
		return
	}

	var body templateWriteBody
	var outcome string
	switch f.Get("op") {
	case "duplicate":
		// The new id is minted here rather than in the browser. Next mints one per click too,
		// so a double click makes two copies in both; what the id buys is a retry of the SAME
		// request landing once.
		body = templateWriteBody{Op: "duplicate", TemplateID: templateID, NewTemplateID: uuid.New()}
		outcome = "duplicated"
	case "archive", "restore":
		on := f.Get("op") == "archive"
		body = templateWriteBody{Op: "archive", TemplateID: templateID, Archived: &on}
		outcome = pick(on, "archived", "restored")
	default:
		web.SeeOther(w, r, libraryHref(archived))
		return
	}

	res := a.d.API.Call(r.Context(), "agent-message-template", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: body})
	out := web.FromResult(res, tplActionFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
	case !out.OK:
		a.renderTemplates(w, r, v, archived, libraryState{Error: templateFailure(res, tplActionFailed)}, out.Status)
	default:
		setReceipt(w, receipt{Kind: "template", Outcome: outcome}, a.d.SecureCookies)
		web.SeeOther(w, r, libraryHref(archived))
	}
}

// templateFailure is the function's own sentence when it wrote one, else the fixed fallback.
func templateFailure(res api.Result, fallback string) string {
	if res.Kind == api.Rejected && res.Detail != "" {
		return res.Detail
	}
	return fallback
}

// ── 3.10.5 Template Editor ───────────────────────────────────────────────────────────────

// editorState is one rendering of the editor: what is in the boxes, and what to say about it.
type editorState struct {
	// TemplateID is the row being edited, or the id a create will use.
	TemplateID string
	New        bool
	Category   string
	Name       string
	Body       string
	Tags       []string
	// SavedName is the heading, which follows the stored name rather than the box.
	SavedName   string
	NameError   string
	BodyError   string
	FormError   string
	Status      string
	Suggestions []string
}

func (a *app) serveNewTemplate(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	suggestions, err := a.tagSuggestions(r, v)
	if err != nil {
		a.renderFailed(w, r, v, true)
		return
	}
	// It starts in Other with nothing in it; the advisor picks the category.
	a.renderEditor(w, r, v, editorState{
		TemplateID: uuid.New(), New: true, Category: "other", Suggestions: suggestions,
	}, http.StatusOK)
}

func (a *app) serveTemplate(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	t, found, err := a.loadTemplate(r, v, r.PathValue("templateId"))
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		a.renderTemplateNotFound(w, r, v)
		return
	}
	suggestions, err := a.tagSuggestions(r, v)
	if err != nil {
		a.renderFailed(w, r, v, true)
		return
	}
	a.renderEditor(w, r, v, editorState{
		TemplateID: t.ID, Category: t.Category, Name: t.Name, Body: t.Body, Tags: t.Tags,
		SavedName: t.Name, Suggestions: suggestions,
		Status: templateReceipt(w, r, a.d.SecureCookies),
	}, http.StatusOK)
}

// tagSuggestions is every tag already on a live template, for the tags box's list.
func (a *app) tagSuggestions(r *http.Request, v visit) ([]string, error) {
	templates, err := a.loadTemplates(r, v, false)
	if err != nil {
		return nil, err
	}
	return knownTags(templates), nil
}

// renderTemplateNotFound is the editor's notFound() branch: somebody else's template and no
// template reach the same page, so ids cannot be probed.
func (a *app) renderTemplateNotFound(w http.ResponseWriter, r *http.Request, v visit) {
	doc := a.templateNotFound.New()
	a.chrome(w, r, doc, v)
	web.Render(w, a.d.Log, doc, http.StatusNotFound, web.Private)
}

func (a *app) renderEditor(w http.ResponseWriter, r *http.Request, v visit, st editorState, status int) {
	doc := a.templateEditor.New()
	a.chrome(w, r, doc, v)
	fillEditor(doc, st)
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillEditor(doc *page.Doc, st editorState) {
	action := templatesPath + "/new"
	if !st.New {
		action = templatesPath + "/" + st.TemplateID
	}
	doc.URL("ed-form", "action", action)
	doc.Attr("ed-id", "value", st.TemplateID)
	doc.Text("ed-category-label", templateCategoryLabels[st.Category])
	doc.Text("ed-h1", pick(st.SavedName == "", tplNewTitle, st.SavedName))

	// Next renders the status line even when it has nothing to say, and the gap it leaves in
	// the header row is part of the layout; removing it widened the heading by 8px.
	doc.Text("ed-status", st.Status)
	// A template that does not exist yet cannot be archived.
	keepIf(doc, "ed-archive", !st.New)
	if !st.New {
		doc.Attr("ed-archive", "data-archive-confirm", tplLeaveUnsaved)
	}
	if st.FormError == "" {
		doc.Remove("ed-error")
	} else {
		doc.Text("ed-error", st.FormError)
	}

	doc.Attr("ed-name", "value", st.Name)
	if st.NameError == "" {
		doc.Remove("ed-name-error")
	} else {
		doc.Text("ed-name-error", st.NameError)
		doc.Attr("ed-name", "aria-invalid", "true")
	}
	for _, c := range templateCategories {
		// A slot name takes no underscore, so the category's own name is hyphenated. An
		// option is not a void element, so setting an attribute on it is not filling it.
		slot := "cat-" + strings.ReplaceAll(c, "_", "-")
		doc.Bool(slot, "selected", c == st.Category)
		doc.Keep(slot)
	}

	doc.Text("ed-body", st.Body)
	if st.BodyError == "" {
		doc.Remove("ed-body-error")
		doc.Text("ed-body-hint", tplBodyHint)
	} else {
		doc.Text("ed-body-error", st.BodyError)
		doc.Attr("ed-body", "aria-invalid", "true")
		// The hint and the error would say two things at once under one box.
		doc.Remove("ed-body-hint")
	}

	doc.Attr("ed-tags", "value", strings.Join(st.Tags, ", "))
	doc.Keep("ed-tag-list")
	// A datalist option with no value attribute offers its own text, which is the tag.
	doc.Repeat("tag", len(st.Suggestions), func(i int, r *page.Row) {
		r.Text("g-tag", st.Suggestions[i])
	})

	// Each chip carries the sample this field becomes, so templates.js can draw the preview
	// as the advisor types without keeping a second copy of the sample.
	sample := mergeValuesOf(sampleMergeContext)
	doc.Repeat("field", len(mergeFields), func(i int, r *page.Row) {
		r.Attr("f-chip", "value", mergeFields[i])
		r.Attr("f-chip", "data-sample", sample[mergeFields[i]])
		r.Keep("f-chip")
		r.Text("f-label", "{{"+mergeFields[i]+"}}")
	})

	doc.Text("ed-preview", renderTemplate(st.Body, sample).Text)
}

// parseTags reads the tags box: separated by commas, each trimmed and cut to 30 characters,
// one of each (the first spelling kept), at most ten. The Autocomplete does the same.
func parseTags(raw string) []string {
	var out []string
	seen := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		tag := strings.TrimSpace(part)
		if tag == "" {
			continue
		}
		tag = cutRunes(tag, maxTemplateTag)
		if lower := strings.ToLower(tag); !seen[lower] {
			seen[lower] = true
			out = append(out, tag)
		}
		if len(out) == maxTemplateTags {
			break
		}
	}
	return out
}

// cutRunes keeps the first n characters, counted as a browser's maxlength counts them.
func cutRunes(s string, n int) string {
	return sliceUTF16(s, n)
}

// editorFromForm reads the boxes back out of a post.
func editorFromForm(f url.Values, templateID string, isNew bool, suggestions []string) editorState {
	category := f.Get("category")
	if !slices.Contains(templateCategories, category) {
		category = "other"
	}
	return editorState{
		TemplateID:  templateID,
		New:         isNew,
		Category:    category,
		Name:        cutRunes(f.Get("name"), maxTemplateName),
		Body:        cutRunes(f.Get("body"), maxTemplateBody),
		Tags:        parseTags(f.Get("tags")),
		Suggestions: suggestions,
	}
}

// templateNewID keeps the id the form was drawn with, so a retry of the same Save lands once,
// and mints a fresh one when that id is too old for the function's window (Data-Model §21.6:
// within the last hour). A form left open all afternoon saves rather than being refused
// forever.
func templateNewID(posted string) string {
	if !uuid.IsV7(posted) {
		return uuid.New()
	}
	at, err := uuid.Timestamp(posted)
	if err != nil || time.Since(at) > 30*time.Minute || time.Until(at) > time.Minute {
		return uuid.New()
	}
	return posted
}

func (a *app) postNewTemplate(w http.ResponseWriter, r *http.Request) {
	a.postTemplate(w, r, "")
}

func (a *app) postExistingTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := r.PathValue("templateId")
	if !uuidPattern.MatchString(templateID) {
		web.Error(w, http.StatusNotFound)
		return
	}
	a.postTemplate(w, r, templateID)
}

// postTemplate is Save, Archive and the merge-field chips, for both the new form and an
// existing template. templateID is empty on the new form.
func (a *app) postTemplate(w http.ResponseWriter, r *http.Request, templateID string) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	isNew := templateID == ""
	id := templateID
	if isNew {
		id = templateNewID(f.Get("templateId"))
	}
	suggestions, err := a.tagSuggestions(r, v)
	if err != nil {
		a.renderFailed(w, r, v, true)
		return
	}
	st := editorFromForm(f, id, isNew, suggestions)

	// A stored template keeps its heading and knows what "no changes" means.
	var stored messageTemplate
	if !isNew {
		t, found, err := a.loadTemplate(r, v, templateID)
		switch {
		case err != nil:
			a.renderFailed(w, r, v, true)
			return
		case !found:
			a.renderTemplateNotFound(w, r, v)
			return
		}
		stored = t
		st.SavedName = t.Name
	}

	// A merge field chip: the token goes in and nothing is saved.
	if field := f.Get("field"); field != "" {
		if !isMergeField(field) {
			web.Error(w, http.StatusBadRequest)
			return
		}
		st.Body = insertTemplate(st.Body, "{{"+field+"}}")
		st.Status = tplUnsaved
		a.renderEditor(w, r, v, st, http.StatusOK)
		return
	}

	switch f.Get("op") {
	case "archive":
		if isNew {
			web.Error(w, http.StatusBadRequest)
			return
		}
		on := true
		res := a.d.API.Call(r.Context(), "agent-message-template", v.st.AccessToken, api.Input{
			Method: http.MethodPost, Body: templateWriteBody{Op: "archive", TemplateID: templateID, Archived: &on},
		})
		out := web.FromResult(res, tplActionFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			st.FormError = templateFailure(res, tplActionFailed)
			st.Status = tplUnsaved
			a.renderEditor(w, r, v, st, out.Status)
		default:
			setReceipt(w, receipt{Kind: "template", Outcome: "archived"}, a.d.SecureCookies)
			web.SeeOther(w, r, templatesPath)
		}
	case "save":
		a.saveTemplate(w, r, v, st, stored)
	default:
		web.Error(w, http.StatusBadRequest)
	}
}

func (a *app) saveTemplate(w http.ResponseWriter, r *http.Request, v visit, st editorState, stored messageTemplate) {
	// Both boxes are judged, not the first one that fails: Next names everything wrong at
	// once, and a save that fixes the name only to be told about the body is two trips.
	name := strings.TrimSpace(st.Name)
	if name == "" {
		st.NameError = tplNameRequired
	}
	if strings.TrimSpace(st.Body) == "" {
		st.BodyError = tplBodyRequired
	} else if unknown := unknownTokens(st.Body); len(unknown) > 0 {
		st.BodyError = templateUnknownFields(unknown)
	}
	if st.NameError != "" || st.BodyError != "" {
		st.Status = tplUnsaved
		a.renderEditor(w, r, v, st, http.StatusUnprocessableEntity)
		return
	}
	// A Save that matches what is stored says so and writes nothing.
	if !st.New && st.Category == stored.Category && name == stored.Name && st.Body == stored.Body &&
		slices.Equal(st.Tags, stored.Tags) {
		setReceipt(w, receipt{Kind: "template", Outcome: "nothing"}, a.d.SecureCookies)
		web.SeeOther(w, r, templatesPath+"/"+st.TemplateID)
		return
	}

	op := "update"
	if st.New {
		op = "create"
	}
	res := a.d.API.Call(r.Context(), "agent-message-template", v.st.AccessToken, api.Input{
		Method: http.MethodPost, Body: templateWriteBody{
			Op: op, TemplateID: st.TemplateID, Category: st.Category, Name: name, Body: st.Body, Tags: st.Tags,
		},
	})
	out := web.FromResult(res, tplSaveFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
	case !out.OK:
		st.FormError = templateFailure(res, tplSaveFailed)
		st.Status = tplUnsaved
		a.renderEditor(w, r, v, st, out.Status)
	default:
		setReceipt(w, receipt{Kind: "template", Outcome: "saved"}, a.d.SecureCookies)
		// After a create the URL becomes the template's own: Back from here should not land
		// on a blank new form, which is why Next replaces rather than pushes.
		web.SeeOther(w, r, templatesPath+"/"+st.TemplateID)
	}
}

// pick is the two-way choice this file makes often enough to name.
func pick[T any](on bool, yes, no T) T {
	if on {
		return yes
	}
	return no
}
