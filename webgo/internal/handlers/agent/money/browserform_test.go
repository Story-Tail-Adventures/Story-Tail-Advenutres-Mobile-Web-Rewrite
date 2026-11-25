package money

import (
	"cmp"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// Lifted from webgo/internal/handlers/agent/people/browserform_test.go (the people area's
// §3.5 work), unchanged apart from the package and cmp.Or. A Go test file cannot be shared
// across packages, so this is a deliberate twin: if you change one, change both.
//
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
	// label is the button's own words, for the forms whose buttons carry no name.
	label string
	// disabled: the page drew it off. A browser will not submit it at all; a test that wants
	// to prove the SERVER refuses a forged click can still pass it to click().
	disabled bool
	// novalidate: this button skips the form's own checks (formnovalidate).
	novalidate bool
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
						out.fields.Add(name, defaultedValue(n, "on"))
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
						out.fields.Add(name, defaultedValue(opt, textOf(opt)))
					}
				}
			case "button":
				if cmp.Or(attr(n, "type"), "submit") == "submit" {
					out.submits = append(out.submits, submitButton{
						name: name, value: attr(n, "value"),
						label:      strings.TrimSpace(textOf(n)),
						disabled:   off,
						novalidate: hasAttr(n, "formnovalidate"),
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

// click posts the form with one submit button's name and value, as a browser does. Pressing
// Enter in a text box is click(f, f.submits[0]...) — the form's default button.
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

// submitLabelled finds the submit button whose words are exactly label — the handle for a
// form whose buttons carry no name.
func (f browserForm) submitLabelled(t *testing.T, label string) submitButton {
	t.Helper()
	for _, b := range f.submits {
		if b.label == label {
			return b
		}
	}
	t.Fatalf("no submit button labelled %q (have %v)", label, f.submits)
	return submitButton{}
}

// defaultSubmit is the button Enter presses: the FIRST submit in the form, in tree order.
func (f browserForm) defaultSubmit(t *testing.T) submitButton {
	t.Helper()
	if len(f.submits) == 0 {
		t.Fatal("the form has no submit button")
	}
	return f.submits[0]
}

// defaultedValue is the value a browser sends for a control: the `value` ATTRIBUTE when it
// is present, even when it is empty, and the fallback only when the attribute is ABSENT.
//
// Falling back on emptiness instead is a harness that lies. Five pages in this sub-area
// carry `<option value="">` — "Pick a supplier", "All suppliers", "Ignore this column" —
// and a test that chose one of those would post the option's visible TEXT, then fail as
// though the screen were broken.
func defaultedValue(n *html.Node, fallback string) string {
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

// A browser falls back on an ABSENT value attribute, never on an empty one. Five pages in
// this sub-area carry `<option value="">`, so a harness that confused the two would post the
// option's visible text and the failure would read as a page bug.
func TestReadFormSendsAnEmptyValueAsEmpty(t *testing.T) {
	const page = `<!doctype html><html><body><form data-slot="f" action="/x">
		<select name="column">
			<option value="" selected>Ignore this column</option>
			<option value="gross">Gross</option>
		</select>
		<select name="supplier"><option selected>Sandals Resorts</option></select>
		<input type="checkbox" name="plain" checked>
		<input type="checkbox" name="valued" value="" checked>
		<input type="checkbox" name="one" value="1" checked>
	</form></body></html>`
	f := readForm(t, page, "f")
	for _, c := range [][2]string{
		// The attribute is there and empty: that is what the server receives.
		{"column", ""},
		// No attribute at all on the option, so its text is the value.
		{"supplier", "Sandals Resorts"},
		// No attribute on a checkbox, so "on" — the browser's own default.
		{"plain", "on"},
		{"valued", ""},
		{"one", "1"},
	} {
		if _, ok := f.fields[c[0]]; !ok {
			t.Errorf("%s was not submitted at all", c[0])
			continue
		}
		if got := f.fields.Get(c[0]); got != c[1] {
			t.Errorf("%s posts %q, want %q", c[0], got, c[1])
		}
	}
}
