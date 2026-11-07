package page

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/mdigger/htmlx"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Head is a page's search and sharing metadata: what Next's `metadata` export wrote into
// <head> (title, description, canonical URL, robots, Open Graph and Twitter cards) and the
// JSON-LD block some public pages carry.
//
// It is not a slot. Slots may not sit on <meta>, <link> or inside <script> (check.go), and
// that rule stays: here this package builds the elements itself, from a fixed list of tag
// and attribute names, so a handler chooses values only, never markup or attribute names.
type Head struct {
	// Title replaces the <title> text when set. Pages with a fixed title write it in their
	// file's <title> instead.
	Title string
	// Description replaces the content of the layout's <meta name="description">.
	Description string
	// Canonical is the page's absolute URL. A value SafeURL refuses (an http:// origin in
	// local development, say) is left out rather than written.
	Canonical string
	// Robots is the robots meta content ("noindex, follow"). Empty writes none.
	Robots string
	// Properties are Open Graph (og:*) and Twitter card (twitter:*) entries, written in
	// order. og:* uses property=, twitter:* uses name=, as Next wrote them. A name ending in
	// "url" or "image" is a link and goes through SafeURL; a refused one is left out.
	Properties []Property
	// JSONLD, when not nil, is marshalled into a <script type="application/ld+json">.
	// encoding/json escapes <, > and & in strings, so no value can close the element.
	JSONLD any
}

// Property is one Open Graph or Twitter card entry.
type Property struct {
	Name, Content string
}

var propertyName = regexp.MustCompile(`^(og|twitter):[a-z_:]+$`)

// isLinkProperty reports whether a property's content is a URL a crawler will fetch.
func isLinkProperty(name string) bool {
	return strings.HasSuffix(name, "url") || strings.HasSuffix(name, "image")
}

// Head writes h into the page's <head>. Call it at most once per request.
func (d *Doc) Head(h Head) {
	head := htmlx.Find(d.root, htmlx.Tag(atom.Head))
	if head == nil {
		d.fail("Head: the page has no <head>")
		return
	}
	if h.Title != "" {
		if title := htmlx.Find(head, htmlx.Tag(atom.Title)); title != nil {
			replaceText(title, h.Title)
		} else {
			d.fail("Head: the page has no <title> to replace")
		}
	}
	if h.Description != "" {
		desc := htmlx.Find(head, func(n *html.Node) bool {
			if n.DataAtom != atom.Meta {
				return false
			}
			v, ok := attrValue(n, "name")
			return ok && v == "description"
		})
		if desc == nil {
			desc = element(atom.Meta, html.Attribute{Key: "name", Val: "description"})
			head.AppendChild(desc)
		}
		setAttr(desc, "content", h.Description)
	}
	if h.Robots != "" {
		head.AppendChild(element(atom.Meta,
			html.Attribute{Key: "name", Val: "robots"},
			html.Attribute{Key: "content", Val: h.Robots}))
	}
	if h.Canonical != "" {
		if v, ok := SafeURL(h.Canonical); ok {
			head.AppendChild(element(atom.Link,
				html.Attribute{Key: "rel", Val: "canonical"},
				html.Attribute{Key: "href", Val: v}))
		}
	}
	for _, p := range h.Properties {
		if !propertyName.MatchString(p.Name) {
			d.fail("Head: %q is not an og: or twitter: property name", p.Name)
			continue
		}
		content := p.Content
		if isLinkProperty(p.Name) {
			v, ok := SafeURL(content)
			if !ok {
				continue
			}
			content = v
		}
		key := "property"
		if strings.HasPrefix(p.Name, "twitter:") {
			key = "name"
		}
		head.AppendChild(element(atom.Meta,
			html.Attribute{Key: key, Val: p.Name},
			html.Attribute{Key: "content", Val: content}))
	}
	if h.JSONLD != nil {
		b, err := json.Marshal(h.JSONLD) // HTML-escapes <, > and & inside strings
		if err != nil {
			d.fail("Head: JSON-LD did not marshal: %v", err)
			return
		}
		if bytes.ContainsAny(b, "<>") {
			d.fail("Head: JSON-LD carries a raw angle bracket")
			return
		}
		s := element(atom.Script, html.Attribute{Key: "type", Val: "application/ld+json"})
		s.AppendChild(&html.Node{Type: html.TextNode, Data: string(b)})
		head.AppendChild(s)
	}
}

func element(a atom.Atom, attrs ...html.Attribute) *html.Node {
	return &html.Node{Type: html.ElementNode, DataAtom: a, Data: a.String(), Attr: attrs}
}
