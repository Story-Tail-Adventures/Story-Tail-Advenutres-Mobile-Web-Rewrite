package people

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Screens 3.10.4 Template Library and 3.10.5 Template Editor, through the real gate and
// session against the fake Supabase.

const (
	tplID    = "0195a2c0-1a00-7000-8000-0000000000e1"
	tplOther = "0195a2c0-1a00-7000-8000-0000000000e2"
)

func templateRow(id, category, name, body string, tags []string) map[string]any {
	return map[string]any{
		"template_id": id, "category": category, "name": name, "body": body,
		"tags": tags, "archived": false, "updated_at": "2026-10-14T23:30:00Z",
	}
}

func templateWorld(t *testing.T) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.rpc["agent_message_templates"] = mustJSON([]map[string]any{
		templateRow(tplID, "payment_reminder", "Final balance", "Hi {{client.firstName}}, {{payment.amount}} is due {{payment.dueDate}}.", []string{"balance"}),
		templateRow(tplOther, "lead_response", "Lead response", "Thanks for reaching out!", []string{"Honeymoon", "beach"}),
	})
	wd.fake.rpc["agent_message_template"] = mustJSON([]map[string]any{
		templateRow(tplID, "payment_reminder", "Final balance", "Hi {{client.firstName}}, {{payment.amount}} is due {{payment.dueDate}}.", []string{"balance"}),
	})
	wd.scope("p_template_id", tplID)
	return wd
}

func TestTemplateLibraryPage(t *testing.T) {
	t.Run("groups, cards and the three actions", func(t *testing.T) {
		wd := templateWorld(t)
		rec := wd.get(templatesPath)
		if rec.Code != http.StatusOK {
			t.Fatalf("library = %d", rec.Code)
		}
		b := rec.Body.String()
		has(t, b, "Templates", "Messages you send often, grouped by stage.",
			">Lead response<", ">Payment reminder<", "Final balance",
			"Last edited Oct 14 · Honeymoon, beach",
			`href="/agent/messages/templates/`+tplID+`"`,
			`value="duplicate"`, `value="archive"`, "New template",
			`href="/agent/messages/templates?view=archived"`)
		// Lead response is the first category, so its card comes before the payment one.
		if strings.Index(b, "Lead response") > strings.Index(b, "Final balance") {
			t.Error("the groups are not in the library's order")
		}
		lacks(t, b, "Restore", "Used 42")
		// The read asked for the live shelf.
		has(t, wd.fake.rpcArgs["agent_message_templates"], `"p_archived":false`)
	})

	t.Run("the archived shelf offers Restore alone", func(t *testing.T) {
		wd := templateWorld(t)
		b := wd.get(templatesPath + "?view=archived").Body.String()
		has(t, b, "Archived templates", `value="restore"`, "All templates", `href="/agent/messages/templates"`)
		lacks(t, b, `value="duplicate"`, "New template", "Messages you send often")
		has(t, wd.fake.rpcArgs["agent_message_templates"], `"p_archived":true`)
	})

	t.Run("an empty shelf says which one it is", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.rpc["agent_message_templates"] = "[]"
		has(t, wd.get(templatesPath).Body.String(), "No templates yet. Start one, and it&#39;ll be ready")
		has(t, wd.get(templatesPath+"?view=archived").Body.String(), "Nothing archived.", "ready to restore")
	})

	t.Run("a failed read is not an empty library", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.failing["agent_message_templates"] = true
		if rec := wd.get(templatesPath); rec.Code != http.StatusServiceUnavailable {
			t.Errorf("failed read = %d", rec.Code)
		}
	})
}

func TestTemplateLibraryActions(t *testing.T) {
	t.Run("Duplicate sends a fresh v7 and says a copy was made", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"created"}`}
		rec := wd.post(templatesPath, url.Values{"op": {"duplicate"}, "templateId": {tplID}})
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != templatesPath {
			t.Fatalf("duplicate = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		c := wd.fake.callsTo("agent-message-template")[0]
		if string(c.Body["op"]) != `"duplicate"` || string(c.Body["templateId"]) != `"`+tplID+`"` {
			t.Errorf("body = %v", c.Body)
		}
		newID := strings.Trim(string(c.Body["newTemplateId"]), `"`)
		if !uuid.IsV7(newID) {
			t.Errorf("newTemplateId %q is not a v7", newID)
		}
		// The receipt is a code, never a sentence from the browser.
		if rc := cookieNamed(rec, receiptCookie); rc == nil {
			t.Fatal("no receipt")
		} else {
			has(t, wd.getWith(templatesPath, rc).Body.String(), "Copy made")
		}
	})

	t.Run("Archive and Restore each come back to the shelf they were on", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"changed"}`}
		rec := wd.post(templatesPath, url.Values{"op": {"archive"}, "templateId": {tplID}})
		if got := rec.Header().Get("Location"); got != templatesPath {
			t.Errorf("archive = %q", got)
		}
		if c := wd.fake.callsTo("agent-message-template")[0]; string(c.Body["archived"]) != "true" {
			t.Errorf("body = %v", c.Body)
		}
		has(t, wd.getWith(templatesPath, cookieNamed(rec, receiptCookie)).Body.String(), "Archived")

		wd2 := templateWorld(t)
		wd2.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"changed"}`}
		rec = wd2.post(templatesPath, url.Values{"op": {"restore"}, "templateId": {tplID}, "view": {"archived"}})
		if got := rec.Header().Get("Location"); got != templatesPath+"?view=archived" {
			t.Errorf("restore = %q", got)
		}
		if c := wd2.fake.callsTo("agent-message-template")[0]; string(c.Body["archived"]) != "false" {
			t.Errorf("body = %v", c.Body)
		}
		has(t, wd2.getWith(templatesPath+"?view=archived", cookieNamed(rec, receiptCookie)).Body.String(), "Restored")
	})

	t.Run("a refusal stays on the list with the reason", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{404, `{"detail":"That template is not in your library."}`}
		// web.FromResult turns every rejection into 422; what travels is the sentence.
		rec := wd.post(templatesPath, url.Values{"op": {"archive"}, "templateId": {tplID}})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("refused = %d", rec.Code)
		}
		has(t, rec.Body.String(), "That template is not in your library.")
	})

	t.Run("a malformed id and an unknown op write nothing", func(t *testing.T) {
		wd := templateWorld(t)
		for _, f := range []url.Values{
			{"op": {"archive"}, "templateId": {"nope"}},
			{"op": {"delete"}, "templateId": {tplID}},
			{"templateId": {tplID}},
		} {
			if rec := wd.post(templatesPath, f); rec.Code != http.StatusSeeOther {
				t.Errorf("%v = %d", f, rec.Code)
			}
		}
		if n := len(wd.fake.callsTo("agent-message-template")); n != 0 {
			t.Errorf("%d calls", n)
		}
	})
}

func TestTemplateEditorPage(t *testing.T) {
	t.Run("a new form, with its id and the sample preview", func(t *testing.T) {
		wd := templateWorld(t)
		rec := wd.get(templatesPath + "/new")
		if rec.Code != http.StatusOK {
			t.Fatalf("new = %d", rec.Code)
		}
		b := rec.Body.String()
		// It starts in Other, as Next's new page does; the advisor picks the category.
		if !optionSelectedBySlot(b, "cat-other") {
			t.Error("a new template does not start in Other")
		}
		has(t, b, "New template", `data-slot="ed-category-label">Other<`, `action="/agent/messages/templates/new"`,
			"Preview · with sample data", "Merge fields", "{{client.firstName}}", "{{payment.link}}",
			// the tags box offers what is already used
			">Honeymoon<", ">beach<", ">balance<")
		// A template that does not exist yet cannot be archived.
		lacks(t, b, `value="archive"`)
		id := formValue(b, "templateId")
		if !uuid.IsV7(id) {
			t.Errorf("templateId %q is not a v7", id)
		}
	})

	t.Run("an existing template fills every box and previews with the sample", func(t *testing.T) {
		wd := templateWorld(t)
		b := wd.get(templatesPath + "/" + tplID).Body.String()
		has(t, b, `action="/agent/messages/templates/`+tplID+`"`, "Final balance",
			"Payment reminder", `value="balance"`, `value="archive"`,
			// the preview merges the fixed sample, never a real client
			"Hi Jordan, $1,200 is due Jun 12, 2026.")
		if !optionSelectedBySlot(b, "cat-payment-reminder") {
			t.Error("the stored category is not selected")
		}
	})

	t.Run("somebody else's template and no template read the same", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.rpc["agent_message_template"] = "[]"
		for _, target := range []string{templatesPath + "/" + tplID, templatesPath + "/nope"} {
			rec := wd.get(target)
			if rec.Code != http.StatusNotFound {
				t.Errorf("%s = %d", target, rec.Code)
			}
			has(t, rec.Body.String(), "That template isn&#39;t in your library.")
		}
	})
}

func TestTemplateEditorSave(t *testing.T) {
	saved := url.Values{
		"op": {"save"}, "category": {"proposal"}, "name": {"Proposal note"},
		"body": {"Hi {{client.firstName}}."}, "tags": {"beach, Beach , cruise"},
	}

	t.Run("a create sends the form's own id and lands on the template", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"created"}`}
		id := uuid.New()
		f := cloneValues(saved)
		f.Set("templateId", id)
		rec := wd.post(templatesPath+"/new", f)
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != templatesPath+"/"+id {
			t.Fatalf("create = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		c := wd.fake.callsTo("agent-message-template")[0]
		if string(c.Body["op"]) != `"create"` || string(c.Body["templateId"]) != `"`+id+`"` ||
			string(c.Body["category"]) != `"proposal"` || string(c.Body["name"]) != `"Proposal note"` {
			t.Errorf("body = %v", c.Body)
		}
		// Tags: trimmed, one of each with the first spelling kept.
		if string(c.Body["tags"]) != `["beach","cruise"]` {
			t.Errorf("tags = %s", c.Body["tags"])
		}
	})

	t.Run("an id too old for the function's window is replaced, not refused", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"created"}`}
		f := cloneValues(saved)
		f.Set("templateId", "0195a2c0-1a00-7000-8000-0000000000c1") // minted in 2025
		wd.post(templatesPath+"/new", f)
		got := strings.Trim(string(wd.fake.callsTo("agent-message-template")[0].Body["templateId"]), `"`)
		if got == "0195a2c0-1a00-7000-8000-0000000000c1" || !uuid.IsV7(got) {
			t.Errorf("templateId = %q", got)
		}
	})

	t.Run("an update keeps the URL and says it saved", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"changed"}`}
		rec := wd.post(templatesPath+"/"+tplID, saved)
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != templatesPath+"/"+tplID {
			t.Fatalf("update = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		if c := wd.fake.callsTo("agent-message-template")[0]; string(c.Body["op"]) != `"update"` {
			t.Errorf("op = %s", c.Body["op"])
		}
		has(t, wd.getWith(templatesPath+"/"+tplID, cookieNamed(rec, receiptCookie)).Body.String(), "Saved")
	})

	t.Run("a Save that changes nothing writes nothing", func(t *testing.T) {
		wd := templateWorld(t)
		rec := wd.post(templatesPath+"/"+tplID, url.Values{
			"op": {"save"}, "category": {"payment_reminder"}, "name": {"Final balance"},
			"body": {"Hi {{client.firstName}}, {{payment.amount}} is due {{payment.dueDate}}."},
			"tags": {"balance"},
		})
		if rec.Code != http.StatusSeeOther {
			t.Fatalf("no-op = %d", rec.Code)
		}
		if n := len(wd.fake.callsTo("agent-message-template")); n != 0 {
			t.Errorf("a no-op wrote: %d calls", n)
		}
		has(t, wd.getWith(templatesPath+"/"+tplID, cookieNamed(rec, receiptCookie)).Body.String(), "No changes to save.")
	})

	t.Run("an empty name, an empty body and an unknown token each keep every word", func(t *testing.T) {
		for _, c := range []struct{ name, body, want string }{
			{"", "Hello.", "Give this template a name."},
			{"  ", "Hello.", "Give this template a name."},
			{"A name", "   ", "Write the message this template starts from."},
			{"A name", "Hi {{client.firstname}} and {{nope}}.",
				"{{client.firstname}}, {{nope}} aren&#39;t merge fields. Pick from the list under the message."},
		} {
			wd := templateWorld(t)
			rec := wd.post(templatesPath+"/"+tplID, url.Values{
				"op": {"save"}, "category": {"proposal"}, "name": {c.name}, "body": {c.body},
			})
			if rec.Code != http.StatusUnprocessableEntity {
				t.Fatalf("%q/%q = %d", c.name, c.body, rec.Code)
			}
			b := rec.Body.String()
			has(t, b, c.want, "Unsaved changes")
			if n := len(wd.fake.callsTo("agent-message-template")); n != 0 {
				t.Errorf("%q wrote: %d calls", c.want, n)
			}
			// The words typed are still in the boxes.
			if c.body != "   " {
				has(t, b, strings.ReplaceAll(c.body, "'", "&#39;"))
			}
		}
	})

	t.Run("a refused save keeps every word and the id", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{503, `{}`}
		id := uuid.New()
		f := cloneValues(saved)
		f.Set("templateId", id)
		f.Set("body", "Keep <this>.")
		rec := wd.post(templatesPath+"/new", f)
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("refused = %d", rec.Code)
		}
		has(t, rec.Body.String(), "That didn&#39;t save. Try again in a moment.", "Keep &lt;this&gt;.",
			`value="`+id+`"`, "Proposal note")
	})

	t.Run("Archive from the editor goes back to the library", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"changed"}`}
		rec := wd.post(templatesPath+"/"+tplID, url.Values{"op": {"archive"}, "name": {"Final balance"}, "body": {"x"}})
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != templatesPath {
			t.Fatalf("archive = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		if c := wd.fake.callsTo("agent-message-template")[0]; string(c.Body["op"]) != `"archive"` {
			t.Errorf("op = %s", c.Body["op"])
		}
	})

	t.Run("a new template cannot be archived, and an unknown op is refused", func(t *testing.T) {
		wd := templateWorld(t)
		for _, c := range []struct {
			target string
			form   url.Values
		}{
			{templatesPath + "/new", url.Values{"op": {"archive"}}},
			{templatesPath + "/" + tplID, url.Values{"op": {"delete"}}},
			{templatesPath + "/" + tplID, url.Values{}},
		} {
			if rec := wd.post(c.target, c.form); rec.Code != http.StatusBadRequest {
				t.Errorf("%s %v = %d", c.target, c.form, rec.Code)
			}
		}
		if n := len(wd.fake.callsTo("agent-message-template")); n != 0 {
			t.Errorf("%d calls", n)
		}
	})
}

func TestTemplateEditorMergeFieldChip(t *testing.T) {
	t.Run("the token goes in and nothing is saved", func(t *testing.T) {
		wd := templateWorld(t)
		rec := wd.post(templatesPath+"/"+tplID, url.Values{
			"field": {"trip.name"}, "category": {"proposal"}, "name": {"A name"}, "body": {"See you on "},
		})
		if rec.Code != http.StatusOK {
			t.Fatalf("chip = %d", rec.Code)
		}
		has(t, rec.Body.String(), "See you on {{trip.name}}", "Unsaved changes")
		if n := len(wd.fake.callsTo("agent-message-template")); n != 0 {
			t.Errorf("a chip wrote: %d calls", n)
		}
	})

	t.Run("an empty box gets the token alone", func(t *testing.T) {
		wd := templateWorld(t)
		has(t, wd.post(templatesPath+"/new", url.Values{"field": {"client.firstName"}, "body": {"  "}}).Body.String(),
			">{{client.firstName}}<")
	})

	t.Run("a field that is not one is refused", func(t *testing.T) {
		wd := templateWorld(t)
		if rec := wd.post(templatesPath+"/new", url.Values{"field": {"client.firstname"}}); rec.Code != http.StatusBadRequest {
			t.Errorf("unknown field = %d", rec.Code)
		}
	})
}

func TestParseTags(t *testing.T) {
	for _, c := range []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"  ,  ", nil},
		{"beach", []string{"beach"}},
		{" beach , Beach ,cruise", []string{"beach", "cruise"}},
		{strings.Repeat("a", 40), []string{strings.Repeat("a", 30)}},
		{"a,b,c,d,e,f,g,h,i,j,k,l", []string{"a", "b", "c", "d", "e", "f", "g", "h", "i", "j"}},
	} {
		got := parseTags(c.in)
		if len(got) != len(c.want) {
			t.Errorf("parseTags(%q) = %q, want %q", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("parseTags(%q) = %q, want %q", c.in, got, c.want)
				break
			}
		}
	}
}

// optionSelectedBySlot reports whether the option carrying this slot is the selected one.
func optionSelectedBySlot(body, slot string) bool {
	i := strings.Index(body, `data-slot="`+slot+`"`)
	if i < 0 {
		return false
	}
	return strings.Contains(body[i:i+strings.Index(body[i:], ">")], "selected")
}

// formValue reads the value of the first input carrying name.
func formValue(body, name string) string {
	i := strings.Index(body, `name="`+name+`"`)
	if i < 0 {
		return ""
	}
	rest := body[i:]
	j := strings.Index(rest, `value="`)
	if j < 0 {
		return ""
	}
	rest = rest[j+7:]
	return rest[:strings.Index(rest, `"`)]
}

func cloneValues(v url.Values) url.Values {
	out := url.Values{}
	for k, vs := range v {
		out[k] = append([]string(nil), vs...)
	}
	return out
}
