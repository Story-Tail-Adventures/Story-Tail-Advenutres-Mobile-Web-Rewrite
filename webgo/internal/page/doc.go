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
	"golang.org/x/net/html/atom"
)

// plainAttrs may be set with Attr. URL attributes go through URL or PayURL; event handlers
// (on*), style, srcdoc, srcset and the like are never set from Go.
//
// Values are escaped on render, so any string is safe AS AN ATTRIBUTE. Two uses still need
// care, and they are the handler's job: a data-* value that one of our JS modules reads as a
// URL or as markup must be checked there too (SafeURL does not run on data-*), and name
// should come from the handler, never from request data, so a visitor cannot pick a name
// that shadows a global our scripts read.
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

// urlTags pairs each URL attribute with the elements URL may set it on. Anything else (a
// <base href>, a <link href> stylesheet, an <embed src>) is refused even with a safe value.
var urlTags = map[string]map[atom.Atom]bool{
	"href":       {atom.A: true, atom.Area: true},
	"src":        {atom.Img: true, atom.Source: true, atom.Audio: true, atom.Video: true, atom.Track: true},
	"action":     {atom.Form: true},
	"formaction": {atom.Button: true, atom.Input: true},
}

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
//
// What counts as handling a slot, so no placeholder ships:
//
//   - Text, URL, PayURL, Remove or Keep handle it.
//   - Attr handles a void element (<input>, <img>): attributes are all it has. On any other
//     element Attr, like Class and Bool, only adjusts it; its text still needs Text, Keep or
//     Remove.
//   - Separately, every URL attribute the slot carries in the HTML (its placeholder link)
//     must go through URL or PayURL, unless the slot is kept or removed. Text alone on
//     <a href="#sample"> would otherwise ship the sample link.
//
// Text the HTML gives a slot is treated as copy unless Text is called; put text that varies
// in its own slot (a <span> inside the link), and the startup check covers it.
type scope struct {
	where      string
	slots      map[string]*html.Node      // nil value: removed
	filled     map[string]bool            // handled as content
	urlPending map[string]map[string]bool // slot -> URL attributes still holding placeholders (present = pending)
	repeats    map[string]*html.Node      // Doc only; nil value: filled or removed
	repeatDone map[string]bool            // Doc only
	errs       *[]error
}

func newScope(where string, errs *[]error) scope {
	return scope{
		where:      where,
		slots:      map[string]*html.Node{},
		filled:     map[string]bool{},
		urlPending: map[string]map[string]bool{},
		errs:       errs,
	}
}

// track records the URL attributes each slot carries, after index has found the slots.
func (s *scope) track() {
	for name, n := range s.slots {
		for _, a := range n.Attr {
			if a.Namespace == "" && urlTags[a.Key] != nil {
				if s.urlPending[name] == nil {
					s.urlPending[name] = map[string]bool{}
				}
				s.urlPending[name][a.Key] = true
			}
		}
	}
}

func (s *scope) fail(format string, a ...any) {
	*s.errs = append(*s.errs, fmt.Errorf("%s: "+format, append([]any{s.where}, a...)...))
}

// node finds a live slot. fill says whether the calling setter handles the slot's content.
func (s *scope) node(slot string, fill bool) *html.Node {
	n, ok := s.slots[slot]
	if !ok {
		s.fail("no slot %q here (not declared for this page or row)", slot)
		return nil
	}
	if n == nil {
		s.fail("slot %q was already removed", slot)
		return nil
	}
	if fill {
		s.filled[slot] = true
	}
	return n
}

// Text makes text the slot's only content, as a text node. Any string is safe here: it is
// escaped when the page is written.
func (s *scope) Text(slot, text string) {
	n := s.node(slot, true)
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
	if inner := s.liveInside(n); inner != "" {
		s.fail("slot %q holds %s; Text would drop it, so fill that instead (or Remove %q)", slot, inner, slot)
		return
	}
	// Attributes stay, so a link's placeholder href is still pending until URL handles it.
	replaceText(n, text)
}

// liveInside names a still-live slot or repeat inside n (not n itself), or "".
func (s *scope) liveInside(n *html.Node) string {
	found := ""
	var walk func(*html.Node)
	walk = func(x *html.Node) {
		for c := x.FirstChild; c != nil && found == ""; c = c.NextSibling {
			if name, ok := attrValue(c, attrSlot); ok && s.slots[name] == c {
				found = fmt.Sprintf("slot %q", name)
				return
			}
			if name, ok := attrValue(c, attrRepeat); ok && s.repeats != nil && s.repeats[name] == c {
				found = fmt.Sprintf("repeat %q", name)
				return
			}
			walk(c)
		}
	}
	walk(n)
	return found
}

// Attr sets a plain attribute: data-*, aria-*, or one of a fixed list (title, alt, value,
// name, ...). It refuses URL attributes (use URL), event handlers and style. On a void
// element it handles the slot; elsewhere it only adjusts it.
func (s *scope) Attr(slot, name, value string) {
	n := s.node(slot, false)
	if n == nil {
		return
	}
	if voidElements[n.DataAtom] {
		s.filled[slot] = true
	}
	if !settable(name) {
		s.fail("attribute %q cannot be set with Attr (links use URL; event handlers and style are never set)", name)
		return
	}
	setAttr(n, name, value)
}

// Bool switches a boolean attribute such as checked, selected, disabled or hidden. It only
// adjusts the slot; it does not handle it.
func (s *scope) Bool(slot, name string, on bool) {
	n := s.node(slot, false)
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

// URL sets href, src, action or formaction, on an element that takes it, when SafeURL
// allows the value, and reports whether it did. A refused value removes the attribute
// instead (so the placeholder link cannot ship either); the handler decides whether to
// hide the element too. Either way the attribute counts as handled.
func (s *scope) URL(slot, attr, raw string) bool {
	n := s.node(slot, true)
	if n == nil {
		return false
	}
	tags, known := urlTags[attr]
	if !known {
		s.fail("URL sets only href, src, action or formaction, not %q", attr)
		return false
	}
	if !tags[n.DataAtom] {
		s.fail("URL may not set %s on <%s> (slot %q)", attr, n.Data, slot)
		return false
	}
	s.markURL(slot, attr)
	v, ok := SafeURL(raw)
	if !ok {
		removeAttr(n, attr)
		return false
	}
	setAttr(n, attr, v)
	return true
}

// PayURL sets a pay link's href, on an <a> only, when the value is absolute https://
// (CLAUDE.md rule 4), and reports whether it did. A refused value removes the href.
func (s *scope) PayURL(slot, raw string) bool {
	n := s.node(slot, true)
	if n == nil {
		return false
	}
	if n.DataAtom != atom.A {
		s.fail("PayURL sets the href of an <a> only, not <%s> (slot %q)", n.Data, slot)
		return false
	}
	s.markURL(slot, "href")
	v, ok := SafePayURL(raw)
	if !ok {
		removeAttr(n, "href")
		return false
	}
	setAttr(n, "href", v)
	return true
}

// markURL records that attr on slot went through URL or PayURL.
func (s *scope) markURL(slot, attr string) {
	delete(s.urlPending[slot], attr) // deleting from a nil map is a no-op
}

// Class adds (on) or removes (off) one class name. It only adjusts the slot.
func (s *scope) Class(slot, class string, on bool) {
	n := s.node(slot, false)
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
	n := s.node(slot, true)
	if n == nil {
		return
	}
	var walk func(*html.Node)
	walk = func(x *html.Node) {
		if name, ok := attrValue(x, attrSlot); ok && s.slots[name] == x {
			s.slots[name] = nil
			s.filled[name] = true
			delete(s.urlPending, name)
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

// Keep marks a slot as deliberately left as written in the HTML, links included, for
// blocks that are shown or hidden depending on the data (call Remove in the other branch).
func (s *scope) Keep(slot string) {
	if s.node(slot, true) != nil {
		delete(s.urlPending, slot)
	}
}

func (s *scope) unhandled() []error {
	var errs []error
	for _, name := range slices.Sorted(maps.Keys(s.slots)) {
		if s.slots[name] == nil {
			continue
		}
		if !s.filled[name] {
			errs = append(errs, fmt.Errorf("%s: slot %q was never filled; fill it (Text, URL, PayURL, or Attr on a void element), Remove it or Keep it", s.where, name))
		}
		for _, attr := range slices.Sorted(maps.Keys(s.urlPending[name])) {
			errs = append(errs, fmt.Errorf("%s: slot %q still has its placeholder %s; set it with URL or PayURL, or Keep or Remove the slot", s.where, name, attr))
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
	d.track()
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
		r.track()
		tmpl.Parent.InsertBefore(row, tmpl)
		if fill != nil {
			fill(i, r)
		}
		*d.errs = append(*d.errs, r.unhandled()...)
	}
	htmlx.Remove(tmpl)
	d.repeats[name] = nil
	d.repeatDone[name] = true
}

func (d *Doc) problems() error {
	errs := slices.Clone(d.errList)
	errs = append(errs, d.unhandled()...)
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
