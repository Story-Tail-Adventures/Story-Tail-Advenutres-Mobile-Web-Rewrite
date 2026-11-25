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
	// submits maps a submit button's value to its name, in tree order.
	submits []submitButton
}

type submitButton struct{ name, value string }

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
			switch n.Data {
			case "input":
				kind := attr(n, "type")
				switch {
				case name == "":
				case kind == "submit", kind == "button", kind == "image":
					// Only the clicked one is sent; the caller names it.
				case kind == "checkbox", kind == "radio":
					if hasAttr(n, "checked") {
						out.fields.Add(name, cmpOr(attr(n, "value"), "on"))
					}
				default:
					out.fields.Add(name, attr(n, "value"))
				}
			case "textarea":
				if name != "" {
					out.fields.Add(name, textOf(n))
				}
			case "select":
				if name != "" {
					if opt := findNode(n, func(o *html.Node) bool {
						return o.Data == "option" && hasAttr(o, "selected")
					}); opt != nil {
						out.fields.Add(name, cmpOr(attr(opt, "value"), textOf(opt)))
					}
				}
			case "button":
				if name != "" && cmpOr(attr(n, "type"), "submit") == "submit" {
					out.submits = append(out.submits, submitButton{name, attr(n, "value")})
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

// click posts the form with one submit button's name and value, as a browser does. Pressing
// Enter in a text box is click(f, f.submits[0]...) — the form's default button.
func (wd *world) click(f browserForm, button submitButton) *httptest.ResponseRecorder {
	wd.t.Helper()
	values := url.Values{}
	for k, vs := range f.fields {
		values[k] = append([]string(nil), vs...)
	}
	if button.name != "" {
		values.Add(button.name, button.value)
	}
	return wd.post(f.action, values)
}

// submitNamed clicks the submit button whose value is exactly value.
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

	t.Run("Enter in the search box searches; it does not close the picker", func(t *testing.T) {
		wd := pickerWorld(t, nil)
		reply := readForm(t, wd.get(threadURL).Body.String(), "rp-form")
		pk := readForm(t, wd.click(reply, reply.submitNamed(t, "picker")).Body.String(), "pk-form")
		pk.fields.Set("tq", "balance")
		// Enter clicks the form's FIRST submit button.
		rec := wd.click(pk, pk.submits[0])
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
		rec := wd.click(f, f.submits[0])
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
		chip := submitButton{"field", "trip.dates"}
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
