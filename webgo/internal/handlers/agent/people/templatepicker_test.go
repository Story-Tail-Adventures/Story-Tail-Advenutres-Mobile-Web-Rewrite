package people

import (
	"html"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// Screen 3.10.3 Template Picker, over an open thread.

const milestoneID = "0195a2c0-1a00-7000-8000-0000000000f1"

// pickerWorld is the messages world with a library and this thread's merge data.
func pickerWorld(t *testing.T, mergeRow map[string]any) *world {
	t.Helper()
	wd := messagesWorld(t)
	wd.fake.rpc["agent_message_templates"] = mustJSON([]map[string]any{
		templateRow(tplID, "payment_reminder", "Final balance", "Hi {{client.firstName}}, {{payment.amount}} is due {{payment.dueDate}}. Pay here: {{payment.link}}", []string{"balance"}),
		templateRow(tplOther, "lead_response", "Lead response", "Thanks for reaching out! I'll be in touch.", []string{"Honeymoon"}),
	})
	row := map[string]any{
		"client_first_name": "Maya", "agent_first_name": "Gyasi",
		"trip_title": "Anniversary Week in Negril", "trip_destinations": []string{"Negril, Jamaica"},
		"trip_start_date": "2026-11-20", "trip_end_date": "2026-11-27",
		"payment_label": nil, "payment_owed_cents": nil, "payment_currency": nil,
		"payment_due_date": nil, "payment_link": nil,
	}
	for k, v := range mergeRow {
		row[k] = v
	}
	wd.fake.rpc["agent_message_merge_context"] = mustJSON([]map[string]any{row})
	return wd
}

func TestPickerOpens(t *testing.T) {
	t.Run("the reply box offers it, and it opens on the first template with a preview", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		b0 := wd.get(threadURL).Body.String()
		has(t, b0, "Insert template")
		// It sits inside the reply form, whose box is required. Without formnovalidate the
		// browser refuses the click on an empty box — which is exactly when a template is
		// wanted. A handler test cannot see this, because it posts without a browser.
		i := strings.Index(b0, `value="picker"`)
		if i < 0 {
			t.Fatal("no picker button")
		}
		if !strings.Contains(b0[strings.LastIndex(b0[:i], "<button"):i], "formnovalidate") {
			t.Error("the picker button validates the reply box, so an empty box cannot open it")
		}
		// And the reply form's op may not also be a hidden field: a hidden op=send is posted
		// BEFORE the clicked button's op, so the picker's own value would never be read.
		form := b0[strings.Index(b0, `data-slot="rp-form"`):i]
		if strings.Contains(form, `type="hidden" name="op"`) {
			t.Error("a hidden op would win over the button that was clicked")
		}

		rec := wd.post(threadURL, url.Values{"op": {"picker"}, "body": {"Hi there"}})
		if rec.Code != http.StatusOK {
			t.Fatalf("picker = %d", rec.Code)
		}
		b := rec.Body.String()
		has(t, b, "Insert a template", "Search templates", "Manage templates",
			">Lead response<", ">Payment reminder<", "Preview · for Maya",
			// the list is grouped in the library's order, so Lead response is first and is
			// what the picker opens on
			"Thanks for reaching out! I&#39;ll be in touch.",
			// the draft rides along in the picker's own form
			`name="body" value="Hi there"`)
		// This thread has no milestone, so the payment template would leave three holes.
		lacks(t, b, "This one needs")
		// Every control in the picker posts an op. A button with any other name would reach
		// the thread handler with no op at all, which is a 400.
		for _, chunk := range strings.Split(b[strings.Index(b, "ppl-pk-scrim"):], "<button")[1:] {
			tag := chunk[:strings.Index(chunk, ">")]
			if !strings.Contains(tag, `name="op"`) {
				t.Errorf("a picker button posts no op: <button%s>", tag)
			}
		}
	})

	t.Run("a template the thread cannot fill turns Insert as-is off and says why", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		// What the browser really posts when a list button is clicked: one name, one value.
		b := wd.post(threadURL, url.Values{"op": {"pick:" + tplID}}).Body.String()
		has(t, b, "This one needs a payment and a pay link, which this thread doesn&#39;t have.",
			"Use Insert &amp; edit to fill them in yourself.")
		if !buttonDisabled(b, "insert-asis") {
			t.Error("Insert as-is is still live with fields missing")
		}
		if buttonDisabled(b, `"insert"`) {
			t.Error("Insert & edit went off too; it is how the advisor fills them in")
		}
		// The footer buttons post no template id of their own, so the picker has to carry
		// what is showing. Without it, Insert quietly inserts the FIRST template instead.
		if got := formValue(b, "tpl"); got != tplID {
			t.Errorf("the picker carries %q as the selection, want %q", got, tplID)
		}
	})

	t.Run("a milestone fills the payment fields and opens on Payment reminder", func(t *testing.T) {
		wd := pickerWorld(t, map[string]any{
			"payment_label": "Final balance", "payment_owed_cents": "120000",
			"payment_currency": "USD", "payment_due_date": "2026-10-02",
			"payment_link": "https://www.sandals.com/pay/SRB-220119",
		})
		b := wd.get(threadURL + "?remind=" + milestoneID).Body.String()
		has(t, b, "Insert a template",
			"Hi Maya, $1,200 is due Oct 2, 2026. Pay here: https://www.sandals.com/pay/SRB-220119")
		lacks(t, b, "This one needs")
		// The milestone went to the read.
		has(t, wd.fake.rpcArgs["agent_message_merge_context"], `"p_milestone_id":"`+milestoneID+`"`)
	})

	t.Run("search narrows the list and moves the preview onto what is left", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		b := wd.post(threadURL, url.Values{"op": {"search"}, "tq": {"balance"}, "tpl": {tplOther}}).Body.String()
		has(t, b, "Final balance", `value="balance"`)
		lacks(t, b, "Thanks for reaching out!")

		none := wd.post(threadURL, url.Values{"op": {"search"}, "tq": {"nothing at all"}}).Body.String()
		has(t, none, "No templates match.", "Pick a template to see it here.")
	})

	t.Run("an empty library points at the editor and offers no insert", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		wd.fake.rpc["agent_message_templates"] = "[]"
		b := wd.post(threadURL, url.Values{"op": {"picker"}}).Body.String()
		has(t, b, "No templates yet.", `href="/agent/messages/templates/new"`)
		lacks(t, b, "Insert as-is", "Insert &amp; edit")
	})

	t.Run("a failed template read offers no picker rather than an empty one", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		wd.fake.failing["agent_message_templates"] = true
		rec := wd.post(threadURL, url.Values{"op": {"picker"}, "body": {"Keep this"}})
		if rec.Code != http.StatusOK {
			t.Fatalf("failed read = %d", rec.Code)
		}
		b := rec.Body.String()
		lacks(t, b, "Insert a template")
		has(t, b, "Keep this")
	})

	t.Run("a failed merge read still opens, with every field missing", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		wd.fake.failing["agent_message_merge_context"] = true
		b := wd.post(threadURL, url.Values{"op": {"pick:" + tplID}}).Body.String()
		has(t, b, "Insert a template", "This one needs a first name")
		if !buttonDisabled(b, "insert-asis") {
			t.Error("Insert as-is is live although nothing merged")
		}
	})
}

func TestPickerInserts(t *testing.T) {
	t.Run("the merged words go in after the draft, and the picker closes", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		rec := wd.post(threadURL, url.Values{
			"op": {"insert-asis"}, "tpl": {tplOther}, "body": {"Hi! "}, "internalNote": {"true"},
		})
		if rec.Code != http.StatusOK {
			t.Fatalf("insert = %d", rec.Code)
		}
		b := rec.Body.String()
		has(t, b, "Hi! Thanks for reaching out! I&#39;ll be in touch.", "Template added. Read it over, then send.")
		lacks(t, b, "Insert a template")
		// The note switch it was opened with comes back on.
		if !checkedBox(b, "internalNote") {
			t.Error("the note switch was lost through the picker")
		}
	})

	t.Run("an empty box gets the template alone", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		has(t, wd.post(threadURL, url.Values{"op": {"insert-asis"}, "tpl": {tplOther}, "body": {"   "}}).Body.String(),
			">Thanks for reaching out! I&#39;ll be in touch.<")
	})

	t.Run("Insert & edit leaves the raw tokens in, and Send then refuses them", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		b := wd.post(threadURL, url.Values{"op": {"insert"}, "tpl": {tplID}}).Body.String()
		has(t, b, "{{payment.amount}}", "{{payment.link}}")

		rec := wd.post(threadURL, url.Values{"op": {"send"}, "body": {"Pay {{payment.amount}} at {{payment.link}}."}})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("send with tokens = %d", rec.Code)
		}
		has(t, rec.Body.String(),
			"{{payment.amount}}, {{payment.link}} are still in your message, and this thread has no values for them.")
		if n := len(wd.fake.callsTo("agent-message")); n != 0 {
			t.Errorf("a message with raw tokens reached the function: %d calls", n)
		}
	})

	t.Run("Insert as-is on a template with holes is refused, however it was posted", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		rec := wd.post(threadURL, url.Values{"op": {"insert-asis"}, "tpl": {tplID}})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("forged insert-asis = %d", rec.Code)
		}
		// The picker stays open with the reason on it rather than the tokens going in.
		has(t, rec.Body.String(), "Insert a template", "This one needs a payment")
	})

	t.Run("Cancel keeps the draft and writes nothing", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		b := wd.post(threadURL, url.Values{"op": {"close"}, "body": {"My own words"}}).Body.String()
		has(t, b, "My own words")
		lacks(t, b, "Insert a template")
		if n := len(wd.fake.callsTo("agent-message")); n != 0 {
			t.Errorf("closing the picker wrote: %d calls", n)
		}
	})

	t.Run("nothing in the picker reaches the function", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		for _, op := range []string{"picker", "pick", "search", "insert", "insert-asis", "close"} {
			wd.post(threadURL, url.Values{"op": {op}, "tpl": {tplOther}, "body": {"x"}})
		}
		if n := len(wd.fake.callsTo("agent-message")); n != 0 {
			t.Errorf("%d calls", n)
		}
	})
}

func TestPickerSelection(t *testing.T) {
	library := []messageTemplate{
		sampleTemplate("1", "lead_response", "Lead A", nil, "alpha"),
		sampleTemplate("2", "payment_reminder", "Pay A", nil, "beta"),
		sampleTemplate("3", "lead_response", "Lead B", nil, "gamma"),
	}
	p := picker{Templates: library}

	t.Run("it opens on the first in the order the list shows", func(t *testing.T) {
		if got := p.openOn(""); got != "1" {
			t.Errorf("openOn = %q", got)
		}
	})

	t.Run("a door with a milestone opens on that category", func(t *testing.T) {
		if got := p.openOn("payment_reminder"); got != "2" {
			t.Errorf("openOn = %q", got)
		}
		// A category with nothing in it falls back rather than showing nothing.
		if got := p.openOn("proposal"); got != "1" {
			t.Errorf("openOn with an empty group = %q", got)
		}
	})

	t.Run("a search that hides the selection moves the preview", func(t *testing.T) {
		narrowed := picker{Templates: library, Search: "gamma", SelectedID: "1"}
		got, ok := narrowed.selected()
		if !ok || got.ID != "3" {
			t.Errorf("selected = %+v %v", got, ok)
		}
		_, ordered := narrowed.shown()
		if len(ordered) != 1 {
			t.Errorf("shown %d", len(ordered))
		}
	})

	t.Run("a search that hides everything selects nothing", func(t *testing.T) {
		if _, ok := (picker{Templates: library, Search: "zzz"}).selected(); ok {
			t.Error("something was selected from an empty list")
		}
	})

	t.Run("startOn only means something once a payment field filled", func(t *testing.T) {
		if got := pickerStartOn(milestoneID, map[string]string{}); got != "" {
			t.Errorf("no payment label = %q", got)
		}
		if got := pickerStartOn("", map[string]string{"payment.label": "Final balance"}); got != "" {
			t.Errorf("no milestone = %q", got)
		}
		if got := pickerStartOn(milestoneID, map[string]string{"payment.label": "Final balance"}); got != "payment_reminder" {
			t.Errorf("both = %q", got)
		}
	})
}

// buttonDisabled reports whether the submit carrying value is drawn disabled.
func buttonDisabled(body, value string) bool {
	i := strings.Index(body, `value="`+strings.Trim(value, `"`)+`"`)
	if i < 0 {
		return false
	}
	start := strings.LastIndex(body[:i], "<button")
	end := i + strings.Index(body[i:], ">")
	return start >= 0 && strings.Contains(body[start:end], "disabled")
}

// The chips the editor draws are the fields the picker fills, each with the sample the server
// renders the preview with: the script reads those samples off the chips, so a chip missing
// its sample would draw a preview that differs from the one Save produces.
func TestEditorChipsCarryEveryFieldAndItsSample(t *testing.T) {
	wd := templateWorld(t)
	b := wd.get(templatesPath + "/new").Body.String()
	sample := mergeValuesOf(sampleMergeContext)
	for _, f := range mergeFields {
		i := strings.Index(b, `value="`+f+`"`)
		if i < 0 {
			t.Errorf("the editor offers no chip for %q", f)
			continue
		}
		tag := b[strings.LastIndex(b[:i], "<button"):][:strings.Index(b[strings.LastIndex(b[:i], "<button"):], ">")]
		if want := `data-sample="` + html.EscapeString(sample[f]) + `"`; !strings.Contains(tag, want) {
			t.Errorf("chip %q carries no sample; want %s in %s", f, want, tag)
		}
	}
}
