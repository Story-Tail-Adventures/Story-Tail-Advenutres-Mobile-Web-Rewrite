// Package page builds the web app's HTML on the server.
//
// Each screen is a plain HTML file. The server parses every file once at startup and, per
// request, fills a fresh deep copy: slots marked data-slot="name" get text, attributes or
// links; rows marked data-repeat="name" are copied once per item; blocks that do not apply
// are removed from the tree, so their data never reaches the browser.
//
// This is the ONLY package that imports htmlx, and it uses htmlx only to READ: parse, find,
// remove. Every write is our own code on golang.org/x/net/html, because htmlx's setters are
// broken (SetAttr keeps an existing value, AddClass never applies, RemoveAttr writes into a
// shared slice) or unsafe (SetHTML parses its input as markup). boundary_test.go enforces
// both rules. See docs/HTMLX-Library-Security-Review.md and docs/GO-MIGRATION.md §4.4.
//
// The safety rules, which template engines would otherwise have given us:
//
//   - Values only go in as text nodes or attribute values, which x/net/html escapes on
//     render. Nothing from a request or a database row is ever parsed as HTML.
//   - Text is refused inside raw-text elements (script, style, ...), where render does
//     not escape it.
//   - Link attributes go through SafeURL (relative, https:, mailto:, tel:) and pay links
//     through SafePayURL (absolute https:// only). Event handlers and style are never set.
//   - Every slot and repeat in a file must be declared in Go and vice versa, checked at
//     startup, and every declared slot must be filled, removed or kept before a page
//     renders. A renamed slot fails the boot and CI instead of shipping its placeholder.
//   - Parsed pages are never changed; each request gets new nodes and new attribute slices.
package page

import (
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"slices"

	"github.com/mdigger/htmlx"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Layout is a shared frame: a full HTML document with exactly one element carrying
// data-layout-main. A page's <main> children are moved into that element, and the page's
// <title> text replaces the layout's.
type Layout struct {
	File  string   // path inside the pages file system, e.g. "layout/base.html"
	Slots []string // slots the layout itself carries, filled by every page that uses it
}

// Spec declares one page file and everything a handler will fill in it.
type Spec struct {
	// File is the page, a full HTML document that opens on its own in a browser with its
	// placeholder text, e.g. "demo/index.html".
	File string
	// Layout frames the page. Nil means File is the whole document.
	Layout *Layout
	// Slots are filled once per page. Each must appear exactly once outside any repeat.
	Slots []string
	// Repeats maps a repeat name to the slots inside each of its rows.
	Repeats map[string][]string
}

// Set holds every page parsed at startup. It is read-only after Load, so any number of
// requests can use it at once.
type Set struct {
	templates map[string]*Template
}

// Template is one composed page, never changed after Load. Call New per request.
type Template struct {
	file string
	root *html.Node
}

// Load parses and checks every spec. It reports every problem at once, so a broken page
// stops the server from starting with the full list.
func Load(fsys fs.FS, specs ...Spec) (*Set, error) {
	s := &Set{templates: make(map[string]*Template, len(specs))}
	layouts := map[string]*html.Node{}
	seen := map[string]bool{} // by name, whether or not the first one built
	var errs []error
	for _, spec := range specs {
		if seen[spec.File] {
			errs = append(errs, fmt.Errorf("%s: declared twice", spec.File))
			continue
		}
		seen[spec.File] = true
		t, err := build(fsys, spec, layouts)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		s.templates[spec.File] = t
	}
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	return s, nil
}

// Template returns the loaded page for file. Handlers call it once, at startup.
func (s *Set) Template(file string) (*Template, error) {
	t, ok := s.templates[file]
	if !ok {
		return nil, fmt.Errorf("page %q was not loaded; add its Spec to Load", file)
	}
	return t, nil
}

// Files lists the loaded page files, sorted.
func (s *Set) Files() []string { return slices.Sorted(maps.Keys(s.templates)) }

func build(fsys fs.FS, spec Spec, layouts map[string]*html.Node) (*Template, error) {
	root, err := parseFile(fsys, spec.File)
	if err != nil {
		return nil, err
	}
	declared := slices.Clone(spec.Slots)
	if spec.Layout != nil {
		lay, ok := layouts[spec.Layout.File]
		if !ok {
			if lay, err = parseFile(fsys, spec.Layout.File); err != nil {
				return nil, err
			}
			layouts[spec.Layout.File] = lay
		}
		if root, err = compose(lay, root, spec); err != nil {
			return nil, err
		}
		declared = append(slices.Clone(spec.Layout.Slots), declared...)
	}
	if err := check(root, spec.File, declared, spec.Repeats); err != nil {
		return nil, err
	}
	return &Template{file: spec.File, root: root}, nil
}

func parseFile(fsys fs.FS, name string) (*html.Node, error) {
	f, err := fsys.Open(name)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	defer f.Close()
	doc, err := htmlx.Parse(f)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	return doc.Node, nil
}

// compose builds a new tree from a copy of the layout with the page's main content moved in.
// The cached layout tree is never touched; the freshly parsed page tree is consumed.
func compose(layout, pageDoc *html.Node, spec Spec) (*html.Node, error) {
	out := clone(layout)

	mains := htmlx.FindAll(out, hasAttr(attrLayoutMain))
	if len(mains) != 1 {
		return nil, fmt.Errorf("%s: needs exactly one element with %s, found %d", spec.Layout.File, attrLayoutMain, len(mains))
	}
	pageMains := htmlx.FindAll(pageDoc, htmlx.Tag(atom.Main))
	if len(pageMains) != 1 {
		return nil, fmt.Errorf("%s: needs exactly one <main> to place in %s, found %d", spec.File, spec.Layout.File, len(pageMains))
	}

	target, src := mains[0], pageMains[0]
	htmlx.RemoveChilds(target)
	for c := src.FirstChild; c != nil; {
		next := c.NextSibling
		src.RemoveChild(c)
		target.AppendChild(c)
		c = next
	}

	if pageTitle := htmlx.Find(pageDoc, htmlx.Tag(atom.Title)); pageTitle != nil {
		if title := htmlx.Find(out, htmlx.Tag(atom.Title)); title != nil {
			replaceText(title, textOf(pageTitle))
		}
	}
	return out, nil
}
