package page

import (
	"bytes"
	"errors"
	"fmt"
	"maps"
	"regexp"
	"slices"
	"strings"

	"github.com/mdigger/htmlx"
	"golang.org/x/net/html"
)

// plainAttrs may be set with Attr. URL attributes go through URL or PayURL; event handlers
// (on*), style, srcdoc, srcset and the like are never set from Go.
var plainAttrs = map[string]bool{
	"title": true, "alt": true, "value": true, "placeholder": true, "name": true,
	"type": true, "min": true, "max": true, "step": true, "rows": true, "cols": true,
	"maxlength": true, "minlength": true, "size": true, "lang": true, "dir": true,
	"datetime": true, "colspan": true, "rowspan": true, "headers": true, "scope": true,
	"abbr": true, "start": true, "autocomplete": true, "inputmode": true,
	"enterkeyhint": true, "role": true, "tabindex": true, "width": true, "height": true,
	"loading": true, "decoding": true, "label": true, "accept": true, "sizes": true,
}

// boolAttrs may be switched with Bool.
var boolAttrs = map[string]bool{
	"checked": true, "selected": true, "disabled": true, "hidden": true, "required": true,
	"readonly": true, "open": true, "multiple": true, "reversed": true, "novalidate": true,
	"inert": true,
}

// urlAttrs may only be set through URL (or PayURL for href).
var urlAttrs = map[string]bool{"href": true, "src": true, "action": true, "formaction": true}

var (
	attrName  = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
	className = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_-]*$`)
)

func settable(name string) bool {
	if !attrName.MatchString(name) {
		return false
	}
	switch name {
	case attrSlot, attrRepeat, attrLayoutMain:
		return false // structure, owned by the page file
	}
	return plainAttrs[name] || strings.HasPrefix(name, "data-") || strings.HasPrefix(name, "aria-")
}

// scope is the set of slots one set of setters can reach: the whole page for a Doc, one
// copied row for a Row. Setter mistakes are recorded, not returned, so a handler reads as
// a list of fills; Doc.Bytes reports every recorded mistake and renders nothing.
type scope struct {
	where      string
	slots      map[string]*html.Node // nil value: removed
	touched    map[string]bool
	repeats    map[string]*html.Node // Doc only; nil value: filled or removed
	repeatDone map[string]bool       // Doc only
	errs       *[]error
}

func newScope(where string, errs *[]error) scope {
	return scope{where: where, slots: map[string]*html.Node{}, touched: map[string]bool{}, errs: errs}
}

func (s *scope) fail(format string, a ...any) {
	*s.errs = append(*s.errs, fmt.Errorf("%s: "+format, append([]any{s.where}, a...)...))
}

func (s *scope) node(slot string) *html.Node {
	n, ok := s.slots[slot]
	if !ok {
		s.fail("no slot %q here (not declared for this page or row)", slot)
		return nil
	}
	if n == nil {
		s.fail("slot %q was already removed", slot)
		return nil
	}
	s.touched[slot] = true
	return n
}

// Text makes text the slot's only content, as a text node. Any string is safe here: it is
// escaped when the page is written.
func (s *scope) Text(slot, text string) {
	n := s.node(slot)
	if n == nil {
		return
	}
	if voidElements[n.DataAtom] {
		s.fail("slot %q is a <%s>, which cannot hold text; use Attr(%q, \"value\", ...)", slot, n.Data, slot)
		return
	}
	if tag, raw := inRawText(n); raw {
		s.fail("slot %q is inside <%s>, where text is written unescaped", slot, tag)
		return
	}
	replaceText(n, text)
}

// Attr sets a plain attribute: data-*, aria-*, or one of a fixed list (title, alt, value,
// name, ...). It refuses URL attributes (use URL), event handlers and style.
func (s *scope) Attr(slot, name, value string) {
	n := s.node(slot)
	if n == nil {
		return
	}
	if !settable(name) {
		s.fail("attribute %q cannot be set with Attr (links use URL; event handlers and style are never set)", name)
		return
	}
	setAttr(n, name, value)
}

// Bool switches a boolean attribute such as checked, selected, disabled or hidden.
func (s *scope) Bool(slot, name string, on bool) {
	n := s.node(slot)
	if n == nil {
		return
	}
	if !boolAttrs[name] {
		s.fail("%q is not a boolean attribute Bool may switch", name)
		return
	}
	if on {
		setAttr(n, name, "")
	} else {
		removeAttr(n, name)
	}
}

// URL sets href, src, action or formaction when SafeURL allows the value, and reports
// whether it did. A refused value removes the attribute instead (so the placeholder link
// cannot ship either); the handler decides whether to hide the element too.
func (s *scope) URL(slot, attr, raw string) bool {
	n := s.node(slot)
	if n == nil {
		return false
	}
	if !urlAttrs[attr] {
		s.fail("URL sets only href, src, action or formaction, not %q", attr)
		return false
	}
	v, ok := SafeURL(raw)
	if !ok {
		removeAttr(n, attr)
		return false
	}
	setAttr(n, attr, v)
	return true
}

// PayURL sets a pay link's href only when it is absolute https:// (CLAUDE.md rule 4), and
// reports whether it did. A refused value removes the href.
func (s *scope) PayURL(slot, raw string) bool {
	n := s.node(slot)
	if n == nil {
		return false
	}
	v, ok := SafePayURL(raw)
	if !ok {
		removeAttr(n, "href")
		return false
	}
	setAttr(n, "href", v)
	return true
}

// Class adds (on) or removes (off) one class name.
func (s *scope) Class(slot, class string, on bool) {
	n := s.node(slot)
	if n == nil {
		return
	}
	if !className.MatchString(class) {
		s.fail("class %q is not a plain class name", class)
		return
	}
	current, _ := attrValue(n, "class")
	var out []string
	for _, c := range strings.Fields(current) {
		if c != class {
			out = append(out, c)
		}
	}
	if on {
		out = append(out, class)
	}
	if len(out) == 0 {
		removeAttr(n, "class")
		return
	}
	setAttr(n, "class", strings.Join(out, " "))
}

// Remove takes the slot's element, and everything in it, out of the page. Slots and
// repeats inside it count as handled.
func (s *scope) Remove(slot string) {
	n := s.node(slot)
	if n == nil {
		return
	}
	var walk func(*html.Node)
	walk = func(x *html.Node) {
		if name, ok := attrValue(x, attrSlot); ok && s.slots[name] == x {
			s.slots[name] = nil
			s.touched[name] = true
		}
		if name, ok := attrValue(x, attrRepeat); ok && s.repeats != nil && s.repeats[name] == x {
			s.repeats[name] = nil
			s.repeatDone[name] = true
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	htmlx.Remove(n)
}

// Keep marks a slot as deliberately left as written in the HTML, for blocks that are shown
// or hidden depending on the data (call Remove in the other branch).
func (s *scope) Keep(slot string) { s.node(slot) }

func (s *scope) untouched() []error {
	var errs []error
	for _, name := range slices.Sorted(maps.Keys(s.slots)) {
		if !s.touched[name] {
			errs = append(errs, fmt.Errorf("%s: slot %q was never filled; fill it, Remove it or Keep it", s.where, name))
		}
	}
	return errs
}

// Doc is one request's copy of a page. It is not safe for use by more than one goroutine,
// and it is never shared: every request calls Template.New.
type Doc struct {
	scope
	root    *html.Node
	errList []error
}

// Row is one copied row of a repeat, with the same setters scoped to that row.
type Row struct {
	scope
}

// New returns a fresh, independent copy of the page to fill.
func (t *Template) New() *Doc {
	d := &Doc{root: clone(t.root)}
	d.scope = newScope(t.file, &d.errList)
	d.repeats = map[string]*html.Node{}
	d.repeatDone = map[string]bool{}
	index(d.root, d.slots, d.repeats)
	return d
}

// Repeat copies the repeat's sample row n times, calls fill for each copy in order, then
// removes the sample. n == 0 just removes the sample (pair it with an empty state).
func (d *Doc) Repeat(name string, n int, fill func(i int, r *Row)) {
	tmpl, ok := d.repeats[name]
	if !ok {
		d.fail("no repeat %q here (not declared for this page)", name)
		return
	}
	if tmpl == nil {
		d.fail("repeat %q was already filled or removed", name)
		return
	}
	for i := range n {
		row := clone(tmpl)
		removeAttr(row, attrRepeat)
		r := &Row{scope: newScope(fmt.Sprintf("%s: repeat %q row %d", d.where, name, i), d.errs)}
		index(row, r.slots, nil)
		tmpl.Parent.InsertBefore(row, tmpl)
		if fill != nil {
			fill(i, r)
		}
		*d.errs = append(*d.errs, r.untouched()...)
	}
	htmlx.Remove(tmpl)
	d.repeats[name] = nil
	d.repeatDone[name] = true
}

func (d *Doc) problems() error {
	errs := slices.Clone(d.errList)
	errs = append(errs, d.untouched()...)
	for _, name := range slices.Sorted(maps.Keys(d.repeats)) {
		if !d.repeatDone[name] {
			errs = append(errs, fmt.Errorf("%s: repeat %q was never filled; its sample row would ship (Repeat with 0 removes it)", d.where, name))
		}
	}
	return errors.Join(errs...)
}

// Bytes checks the page is complete and renders it. On any recorded mistake it renders
// nothing and returns every problem, so a half-filled page never reaches a visitor.
func (d *Doc) Bytes() ([]byte, error) {
	if err := d.problems(); err != nil {
		return nil, err
	}
	var b bytes.Buffer
	if err := html.Render(&b, d.root); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

// Fragment renders just the slot's element, for partial page updates later (ruling 3).
// The whole page must still be complete, so a fragment never carries a placeholder.
func (d *Doc) Fragment(slot string) ([]byte, error) {
	n := d.slots[slot] // read directly: rendering is not filling
	if n == nil {
		return nil, fmt.Errorf("%s: no slot %q to render", d.where, slot)
	}
	if err := d.problems(); err != nil {
		return nil, err
	}
	var b bytes.Buffer
	if err := html.Render(&b, n); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}
