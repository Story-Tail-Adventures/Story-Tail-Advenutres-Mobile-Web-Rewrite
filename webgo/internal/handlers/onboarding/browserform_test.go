package onboarding_test

import (
	"cmp"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// A form, submitted the way a BROWSER submits it.
//
// LIFTED from the agent people area (webgo/internal/handlers/agent/people/browserform_test.go,
// commit b95b6fc) with the receiver re-pointed at this area's client. The parsing is theirs
// and is deliberately not rewritten, so a fix to one is a fix worth copying to the other.
//
// What it does NOT serialize, so do not assume coverage: multiple selects, unchecked radio
// groups, file inputs, formaction overrides, and button[form=...].
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

type submitButton struct {
	name, value string
	// disabled: the page drew it off. A browser will not submit it at all; a test that wants
	// to prove the SERVER refuses a forged click can still pass it to click().
	disabled bool
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
			switch n.Data {
			case "input":
				kind := attr(n, "type")
				switch {
				case name == "", off:
				case kind == "submit", kind == "button", kind == "image":
					// Only the clicked one is sent; the caller names it.
				case kind == "checkbox", kind == "radio":
					// "on" stands in only when there is NO value attribute. An explicit
					// value="" is submitted as the empty string, and a radio that means
					// "no answer" is exactly that — turning it into "on" would post a band
					// nobody offered.
					if hasAttr(n, "checked") {
						value := "on"
						if hasAttr(n, "value") {
							value = attr(n, "value")
						}
						out.fields.Add(name, value)
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
						// Same rule as a checkbox: the label stands in only when the option
						// carries no value attribute at all.
						value := textOf(opt)
						if hasAttr(opt, "value") {
							value = attr(opt, "value")
						}
						out.fields.Add(name, value)
					}
				}
			case "button":
				// A nameless submit is recorded too. It contributes nothing to the post —
				// click() leaves it out — but it still decides what Enter does, and that is
				// what these tests are reading the form for.
				if cmp.Or(attr(n, "type"), "submit") == "submit" {
					out.submits = append(out.submits, submitButton{name, attr(n, "value"), off})
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
func (c *client) click(f browserForm, button submitButton) *httptest.ResponseRecorder {
	c.hn.t.Helper()
	values := url.Values{}
	for k, vs := range f.fields {
		values[k] = append([]string(nil), vs...)
	}
	if button.name != "" {
		values.Add(button.name, button.value)
	}
	return c.post(f.action, values)
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
