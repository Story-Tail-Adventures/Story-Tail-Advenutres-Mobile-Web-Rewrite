package page

import (
	"bytes"
	"encoding/json"
	"net/url"
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
	// Canonical is the page's absolute https:// URL. Anything else (a relative path, an
	// http:// origin in local development) is left out rather than written: a canonical or a
	// shared link is read by somebody else's crawler, on another host, where a relative path
	// means a different page.
	Canonical string
	// Robots is the robots meta content ("noindex, follow"). Empty writes none.
	Robots string
	// Properties are Open Graph (og:*) and Twitter card (twitter:*) entries, written in
	// order. og:* uses property=, twitter:* uses name=, as Next wrote them. Only the names in
	// knownProperties may be set, and the ones that are links must be absolute https://.
	Properties []Property
	// JSONLD, when not nil, is marshalled into a <script type="application/ld+json">.
	// encoding/json escapes <, > and & in strings, so no value can close the element.
	JSONLD any
}

// Property is one Open Graph or Twitter card entry.
type Property struct {
	Name, Content string
}

// knownProperties is every Open Graph and Twitter card entry a page may set, and whether its
// content is a link. An allowlist, not a pattern: the names whose content is a URL a crawler
// or a chat app will FETCH do not share a spelling (og:image, og:video, og:audio,
// twitter:player, twitter:app:url:iphone), so a rule like "ends in url or image" silently
// lets og:video through unchecked. A name that is not here is refused, so adding one is a
// deliberate edit with this comment in front of it.
var knownProperties = map[string]struct{ link bool }{
	"og:title":             {},
	"og:description":       {},
	"og:site_name":         {},
	"og:type":              {},
	"og:locale":            {},
	"og:url":               {link: true},
	"og:image":             {link: true},
	"og:image:width":       {},
	"og:image:height":      {},
	"og:image:alt":         {},
	"twitter:card":         {},
	"twitter:title":        {},
	"twitter:description":  {},
	"twitter:site":         {},
	"twitter:image":        {link: true},
	"twitter:image:width":  {},
	"twitter:image:height": {},
	"twitter:image:alt":    {},
}

// absoluteHTTPS allows only an absolute https:// URL with a host. Canonical links and the
// link properties go through it rather than SafeURL, which also allows relative paths,
// mailto: and tel: because it is written for links inside our own pages.
func absoluteHTTPS(raw string) (string, bool) {
	v, ok := SafeURL(raw)
	if !ok {
		return "", false
	}
	u, err := url.Parse(v)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return "", false
	}
	return v, true
}

// Head writes h into the page's <head>, once per request. A second call is a mistake, not a
// merge: the elements it appends are not slots, so calling it twice leaves two canonicals and
// two JSON-LD blocks with nothing to say which one a crawler should believe.
func (d *Doc) Head(h Head) {
	head := htmlx.Find(d.root, htmlx.Tag(atom.Head))
	if head == nil {
		d.fail("Head: the page has no <head>")
		return
	}
	if d.headDone {
		d.fail("Head: called twice; one call carries the whole page's metadata")
		return
	}
	d.headDone = true
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
		if v, ok := absoluteHTTPS(h.Canonical); ok {
			head.AppendChild(element(atom.Link,
				html.Attribute{Key: "rel", Val: "canonical"},
				html.Attribute{Key: "href", Val: v}))
		}
	}
	for _, p := range h.Properties {
		kind, known := knownProperties[p.Name]
		if !known {
			d.fail("Head: %q is not a property a page may set; add it to knownProperties, with whether it is a link", p.Name)
			continue
		}
		content := p.Content
		if kind.link {
			v, ok := absoluteHTTPS(content)
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
		if string(b) == "null" {
			// A typed nil pointer is not nil in an interface, so h.JSONLD != nil let one
			// through and shipped <script ...>null</script>. Nothing to say is nothing to write.
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
