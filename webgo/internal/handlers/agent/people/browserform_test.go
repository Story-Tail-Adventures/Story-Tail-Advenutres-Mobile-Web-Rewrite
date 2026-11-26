package people

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// A form, submitted the way a BROWSER submits it.
//
// Handler tests that hand-build url.Values test the handler against itself: they can post a
// field no control writes, two fields no single click sends together, or an op that only the
// test knows about. Every one of those passed while the picker was answering 400 to a click
// on a template and sending the advisor's half-written message to the client.
//
// So this reads the rendered page, finds the form, serializes the controls in it as a browser
// would, adds the ONE submit button that was clicked, and posts that to the form's own action.

// browserForm is one form read off a page.
type browserForm struct {
	action string
	fields url.Values
	// required: the names of controls the page marked required. A browser refuses to submit
	// the form while one of them is empty, unless the button clicked says formnovalidate.
	required []string
	// submits maps a submit button's value to its name, in tree order.
	submits []submitButton
}

type submitButton struct {
	name, value string
	// disabled: the page drew it off. A browser will not submit it at all; a test that wants
	// to prove the SERVER refuses a forged click can still pass it to click().
	disabled bool
	// novalidate: this button skips the form's own checks (formnovalidate).
	novalidate bool
	// label: its text, for a button with no name. Such a button sends no name/value pair,
	// but it is still a click target and still what Enter presses, so it has to be here or
	// defaultSubmit names the wrong one.
	label string
}

// readForm finds the form carrying data-slot=slot and reads it as a browser would.
func readForm(t *testing.T, body, slot string) browserForm {
	t.Helper()
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	node := findNode(doc, func(n *html.Node) bool {
		return n.Data == "form" && attr(n, "data-slot") == slot
	})
	if node == nil {
		t.Fatalf("no form with data-slot=%q", slot)
	}
	out := browserForm{action: attr(node, "action"), fields: url.Values{}}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			name := attr(n, "name")
			// A disabled control is not successful: a browser leaves it out of the post
			// entirely. Leaving it in would let a test send a field no user could send.
			off := hasAttr(n, "disabled")
			if name != "" && !off && hasAttr(n, "required") {
				out.required = append(out.required, name)
			}
			switch n.Data {
			case "input":
				kind := attr(n, "type")
				switch {
				case name == "", off:
				case kind == "submit", kind == "button", kind == "image":
					// Only the clicked one is sent; the caller names it.
				case kind == "checkbox", kind == "radio":
					if hasAttr(n, "checked") {
						out.fields.Add(name, valueOr(n, "on"))
					}
				default:
					out.fields.Add(name, attr(n, "value"))
				}
			case "textarea":
				if name != "" && !off {
					out.fields.Add(name, textOf(n))
				}
			case "select":
				if name != "" && !off {
					if opt := findNode(n, func(o *html.Node) bool {
						return o.Data == "option" && hasAttr(o, "selected")
					}); opt != nil {
						out.fields.Add(name, valueOr(opt, textOf(opt)))
					}
				}
			case "button":
				// A submit with no name is recorded too. It posts no pair of its own, which
				// is what a form carrying its op in a hidden field relies on, but it is
				// still the thing Enter clicks.
				if cmpOr(attr(n, "type"), "submit") == "submit" {
					out.submits = append(out.submits, submitButton{
						name: name, value: attr(n, "value"), disabled: off,
						novalidate: hasAttr(n, "formnovalidate"),
						label:      strings.Join(strings.Fields(textOf(n)), " "),
					})
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(node)
	return out
}

// defaultSubmit is the button Enter presses: the FIRST submit in the form in tree order,
// named or not, enabled or not. A form with no submit button at all submits itself, which is
// the empty button — click() then posts the fields alone, as a browser does.
//
// Always use this rather than submits[0] directly. They differ exactly when the first button
// has no name, and then submits[0] is the SECOND button and an Enter test quietly checks the
// wrong one.
func (f browserForm) defaultSubmit() submitButton {
	if len(f.submits) == 0 {
		return submitButton{}
	}
	return f.submits[0]
}

// click posts the form with one submit button's name and value, as a browser does. Pressing
// Enter in a text box is click(f, f.defaultSubmit()).
//
// It refuses the click a browser would refuse. A form with an empty required control does
// not submit at all unless the button says formnovalidate, and a handler test cannot see
// that: it posts past constraint validation, so the server is right and the page is still
// unusable. That is how "Insert template" came to be unclickable on an empty reply box.
func (wd *world) click(f browserForm, button submitButton) *httptest.ResponseRecorder {
	wd.t.Helper()
	values := url.Values{}
	for k, vs := range f.fields {
		values[k] = append([]string(nil), vs...)
	}
	if !button.novalidate {
		for _, name := range f.required {
			if values.Get(name) == "" {
				wd.t.Fatalf("a browser would not send this click: %q is required and empty, and %q=%q does not say formnovalidate",
					name, button.name, button.value)
			}
		}
	}
	if button.name != "" {
		values.Add(button.name, button.value)
	}
	return wd.post(f.action, values)
}

// submitNamed finds the submit button whose value is exactly value. It does NOT refuse a
// disabled one: several tests here click a button the page drew off, to prove the server
// refuses the post rather than trusting the markup. Read .disabled when that matters.
func (f browserForm) submitNamed(t *testing.T, value string) submitButton {
	t.Helper()
	for _, b := range f.submits {
		if b.value == value {
			return b
		}
	}
	t.Fatalf("no submit button with value %q (have %v)", value, f.submits)
	return submitButton{}
}

// valueOr is the value a control posts: its `value` attribute when it HAS one, even when
// that is empty, and the fallback only when the attribute is absent entirely.
//
// The difference is not pedantic. `<option value="">` is how a "none" choice is written, and
// a checkbox can legitimately carry `value=""`. Falling back on emptiness posts the option's
// visible TEXT, or the string "on", neither of which a browser would ever send — and that
// surfaces as a test failure that reads like a defect in the page.
func valueOr(n *html.Node, fallback string) string {
	if hasAttr(n, "value") {
		return attr(n, "value")
	}
	return fallback
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func hasAttr(n *html.Node, key string) bool {
	for _, a := range n.Attr {
		if a.Key == key {
			return true
		}
	}
	return false
}

func textOf(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(x *html.Node) {
		if x.Type == html.TextNode {
			b.WriteString(x.Data)
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return b.String()
}

func findNode(n *html.Node, want func(*html.Node) bool) *html.Node {
	if n.Type == html.ElementNode && want(n) {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if got := findNode(c, want); got != nil {
			return got
		}
	}
	return nil
}

// The helper's own tests. Every form in THIS area names its buttons, so the cases below are
// written by hand: the helper is shared with the other Go areas, whose forms carry the op in
// a hidden field and whose submits often have no name at all.

func TestReadFormHandlesBothFormStyles(t *testing.T) {
	const page = `<form data-slot="f" action="/go">
		<input type="hidden" name="op" value="save">
		<input name="title" value="Hi">
		<input name="off" value="x" disabled>
		<textarea name="body">words</textarea>
		<select name="cat"><option value="a">A</option><option value="b" selected>B</option></select>
		<input type="checkbox" name="flag" value="true" checked>
		<input type="checkbox" name="unflag" value="true">
		<button type="submit">Save</button>
		<button type="submit" name="op" value="archive">Archive</button>
	</form>`
	f := readForm(t, page, "f")

	t.Run("the fields are the successful controls, and only those", func(t *testing.T) {
		want := url.Values{"op": {"save"}, "title": {"Hi"}, "body": {"words"}, "cat": {"b"}, "flag": {"true"}}
		if got := f.fields.Encode(); got != want.Encode() {
			t.Errorf("fields = %s, want %s", got, want.Encode())
		}
	})

	t.Run("an empty value attribute is a value, not an absent one", func(t *testing.T) {
		// `<option value="">` is how "none" is written, and a browser posts the empty
		// string. Falling back on emptiness would post the option's visible text.
		g := readForm(t, `<form data-slot="f" action="/go">
			<select name="when"><option value="" selected>Any time</option><option value="jan">January</option></select>
			<input type="checkbox" name="box" value="" checked>
			<input type="checkbox" name="plain" checked>
		</form>`, "f")
		if got := g.fields.Get("when"); got != "" {
			t.Errorf("select with value=\"\" posted %q, want the empty string", got)
		}
		if _, ok := g.fields["when"]; !ok {
			t.Error("the select posted nothing at all")
		}
		if got := g.fields.Get("box"); got != "" {
			t.Errorf("checkbox with value=\"\" posted %q, want the empty string", got)
		}
		// A checkbox with NO value attribute is the one that posts "on".
		if got := g.fields.Get("plain"); got != "on" {
			t.Errorf("checkbox with no value posted %q, want \"on\"", got)
		}
	})

	t.Run("a submit with no name is still the default button", func(t *testing.T) {
		// This is the one that matters: with nameless buttons skipped, submits[0] would be
		// Archive, and an Enter test would quietly check the wrong button — on a settings
		// form, the destructive one.
		d := f.defaultSubmit()
		if d.label != "Save" || d.name != "" {
			t.Errorf("defaultSubmit = %+v, want the nameless Save", d)
		}
		if len(f.submits) != 2 {
			t.Errorf("submits = %+v, want both buttons", f.submits)
		}
	})

	t.Run("a nameless button posts no pair of its own", func(t *testing.T) {
		wd := templateWorld(t)
		f2 := f
		f2.action = templatesPath // somewhere that answers
		values := url.Values{}
		for k, v := range f2.fields {
			values[k] = v
		}
		// click adds nothing for a nameless button, so the hidden op is what the server reads.
		_ = wd.click(f2, f2.defaultSubmit())
		if f2.fields.Get("op") != "save" {
			t.Error("the hidden op was lost")
		}
	})
}

func TestReadFormDefaultSubmitOnAScriptOnlyForm(t *testing.T) {
	// No submit button at all: a browser submits the form itself, so the default button is
	// the empty one and click() posts the fields alone.
	f := readForm(t, `<form data-slot="f" action="/go"><input name="q" value="x"></form>`, "f")
	if d := f.defaultSubmit(); d.name != "" || d.label != "" {
		t.Errorf("defaultSubmit = %+v, want the empty button", d)
	}
}

// ── What a browser does to these two screens ─────────────────────────────────────────────

func TestPickerAsABrowserDrivesIt(t *testing.T) {
	t.Run("open, pick, insert: the template that was previewed is the one that goes in", func(t *testing.T) {
		wd := pickerWorld(t, nil)

		// Type a draft, then click "Insert template" in the reply box.
		reply := readForm(t, wd.get(threadURL).Body.String(), "rp-form")
		reply.fields.Set("body", "Quick note: ")
		open := wd.click(reply, reply.submitNamed(t, "picker"))
		if open.Code != 200 {
			t.Fatalf("Insert template = %d", open.Code)
		}
		has(t, open.Body.String(), "Insert a template")

		// Click the payment template in the list.
		pk := readForm(t, open.Body.String(), "pk-form")
		picked := wd.click(pk, pk.submitNamed(t, "pick:"+tplID))
		if picked.Code != 200 {
			t.Fatalf("picking a template = %d", picked.Code)
		}
		has(t, picked.Body.String(), "This one needs a payment")

		// Insert & edit: the PAYMENT template must go in, not the first in the list.
		pk2 := readForm(t, picked.Body.String(), "pk-form")
		inserted := wd.click(pk2, pk2.submitNamed(t, "insert"))
		b := inserted.Body.String()
		has(t, b, "Quick note: Hi ", "{{payment.amount}}", "Template added.")
		lacks(t, b, "Thanks for reaching out!")
	})

	t.Run("a button the page drew off is reported off, and is not a field", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		reply := readForm(t, wd.get(threadURL).Body.String(), "rp-form")
		// The payment template needs fields this thread has no values for.
		picked := wd.click(reply, reply.submitNamed(t, "picker")).Body.String()
		pk := readForm(t, wd.click(readForm(t, picked, "pk-form"), submitButton{name: "op", value: "pick:" + tplID}).Body.String(), "pk-form")
		if !pk.submitNamed(t, "insert-asis").disabled {
			t.Error("Insert as-is is not reported disabled, so a test could click it as a user")
		}
		if pk.submitNamed(t, "insert").disabled {
			t.Error("Insert & edit is reported disabled; it is the way to fill the fields in")
		}
		// A disabled control is never a field either, whatever kind it is.
		for k := range pk.fields {
			if k == "op" {
				t.Error("a button's op leaked into the fields")
			}
		}
	})

	t.Run("Enter in the search box searches; it does not close the picker", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		reply := readForm(t, wd.get(threadURL).Body.String(), "rp-form")
		pk := readForm(t, wd.click(reply, reply.submitNamed(t, "picker")).Body.String(), "pk-form")
		pk.fields.Set("tq", "balance")
		// Enter clicks the form's FIRST submit button.
		rec := wd.click(pk, pk.defaultSubmit())
		b := rec.Body.String()
		has(t, b, "Insert a template", "Final balance")
		lacks(t, b, "Thanks for reaching out!")
	})

	t.Run("Trip Detail's milestone survives every click", func(t *testing.T) {
		wd := pickerWorld(t, map[string]any{
			"payment_label": "Final balance", "payment_owed_cents": "120000",
			"payment_currency": "USD", "payment_due_date": "2026-10-02",
			"payment_link": "https://www.sandals.com/pay/SRB-220119",
		})
		// The door opens the thread with the picker on Payment reminder.
		opened := wd.get(threadURL + "?remind=" + milestoneID).Body.String()
		has(t, opened, "Insert a template", "$1,200 is due Oct 2, 2026")

		// Insert as-is, two clicks later, must still have the milestone's values.
		pk := readForm(t, opened, "pk-form")
		rec := wd.click(pk, pk.submitNamed(t, "insert-asis"))
		if rec.Code != 200 {
			t.Fatalf("insert as-is after the door = %d: the milestone was dropped", rec.Code)
		}
		b := rec.Body.String()
		has(t, b, "$1,200 is due Oct 2, 2026", "https://www.sandals.com/pay/SRB-220119")
		lacks(t, b, "{{payment.")
	})

	t.Run("the note switch, the draft and its id all come back", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		reply := readForm(t, wd.get(threadURL).Body.String(), "rp-form")
		reply.fields.Set("body", "Private: ")
		reply.fields.Set("internalNote", "true")
		pk := readForm(t, wd.click(reply, reply.submitNamed(t, "picker")).Body.String(), "pk-form")
		if pk.fields.Get("internalNote") != "true" || pk.fields.Get("body") != "Private: " {
			t.Errorf("the picker lost the draft: %v", pk.fields)
		}
		// The id follows the words, as the reply box's own rule does: typing earned a new one,
		// and from here the picker carries the fingerprint of what is in the box, so opening
		// and closing it does not keep re-minting.
		id := pk.fields.Get("messageId")
		if pk.fields.Get("draftFor") == "" {
			t.Error("the picker carries no draft fingerprint, so every click re-mints the id")
		}
		back := readForm(t, wd.click(pk, pk.submitNamed(t, "close")).Body.String(), "rp-form")
		if back.fields.Get("body") != "Private: " || back.fields.Get("internalNote") != "true" {
			t.Errorf("Cancel lost the draft: %v", back.fields)
		}
		if got := back.fields.Get("messageId"); got != id {
			t.Errorf("a round trip through the picker re-minted the id: %q → %q", id, got)
		}
	})
}

func TestEditorAsABrowserDrivesIt(t *testing.T) {
	t.Run("Enter in a box saves; it does not archive", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"changed"}`}
		f := readForm(t, wd.get(templatesPath+"/"+tplID).Body.String(), "ed-form")
		f.fields.Set("name", "Renamed")
		// Enter clicks the form's first submit button.
		rec := wd.click(f, f.defaultSubmit())
		if rec.Code != 303 {
			t.Fatalf("Enter = %d", rec.Code)
		}
		c := wd.fake.callsTo("agent-message-template")[0]
		if string(c.Body["op"]) != `"update"` {
			t.Errorf("Enter did %s, not a save", c.Body["op"])
		}
	})

	t.Run("a merge-field chip puts its token in and saves nothing", func(t *testing.T) {
		wd := templateWorld(t)
		f := readForm(t, wd.get(templatesPath+"/new").Body.String(), "ed-form")
		f.fields.Set("body", "See you on ")
		chip := submitButton{name: "field", value: "trip.dates"}
		b := wd.click(f, chip).Body.String()
		has(t, b, "See you on {{trip.dates}}")
		if n := len(wd.fake.callsTo("agent-message-template")); n != 0 {
			t.Errorf("a chip wrote: %d calls", n)
		}
	})

	t.Run("the form sends the category that is selected", func(t *testing.T) {
		wd := templateWorld(t)
		wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"changed"}`}
		f := readForm(t, wd.get(templatesPath+"/"+tplID).Body.String(), "ed-form")
		if got := f.fields.Get("category"); got != "payment_reminder" {
			t.Fatalf("the form carries category %q", got)
		}
		f.fields.Set("name", "Renamed")
		wd.click(f, f.submitNamed(t, "save"))
		if c := wd.fake.callsTo("agent-message-template")[0]; string(c.Body["category"]) != `"payment_reminder"` {
			t.Errorf("category = %s", c.Body["category"])
		}
	})
}

func TestLibraryAsABrowserDrivesIt(t *testing.T) {
	wd := templateWorld(t)
	wd.fake.functions["POST agent-message-template"] = reply{200, `{"outcome":"changed"}`}
	f := readForm(t, wd.get(templatesPath+"?view=archived").Body.String(), "t-form")
	rec := wd.click(f, f.submitNamed(t, "restore"))
	if rec.Code != 303 || rec.Header().Get("Location") != templatesPath+"?view=archived" {
		t.Fatalf("restore = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if c := wd.fake.callsTo("agent-message-template")[0]; string(c.Body["archived"]) != "false" {
		t.Errorf("body = %v", c.Body)
	}
}
