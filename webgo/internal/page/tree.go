package page

import (
	"strings"

	"github.com/mdigger/htmlx"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

const (
	attrSlot       = "data-slot"
	attrRepeat     = "data-repeat"
	attrLayoutMain = "data-layout-main"
)

// rawText lists the elements whose text x/net/html writes WITHOUT escaping (checked against
// v0.62.0 on 2026-11-06). A text node placed inside one of them can close the element and
// open a script. textarea and title are escaped on render, so they are not here: a form can
// be re-filled with what the visitor typed.
var rawText = map[atom.Atom]bool{
	atom.Script:    true,
	atom.Style:     true,
	atom.Noscript:  true,
	atom.Iframe:    true,
	atom.Xmp:       true,
	atom.Noembed:   true,
	atom.Noframes:  true,
	atom.Plaintext: true,
}

// voidElements cannot have children; render fails if one does.
var voidElements = map[atom.Atom]bool{
	atom.Area: true, atom.Base: true, atom.Br: true, atom.Col: true, atom.Embed: true,
	atom.Hr: true, atom.Img: true, atom.Input: true, atom.Keygen: true, atom.Link: true,
	atom.Meta: true, atom.Param: true, atom.Source: true, atom.Track: true, atom.Wbr: true,
}

// attrValue reads one attribute (through htmlx, a reader).
func attrValue(n *html.Node, key string) (string, bool) {
	if n == nil || n.Type != html.ElementNode {
		return "", false
	}
	return htmlx.AttrVal(n.Attr, key)
}

func hasAttr(key string) htmlx.Matcher {
	return func(n *html.Node) bool {
		_, ok := htmlx.AttrVal(n.Attr, key)
		return ok
	}
}

// clone returns a deep copy of n: new nodes and NEW attribute slices all the way down.
// Sharing an attribute slice with a parsed page would let one request's change show up in
// every later request's page (the review's finding 3).
func clone(n *html.Node) *html.Node {
	c := &html.Node{Type: n.Type, DataAtom: n.DataAtom, Data: n.Data, Namespace: n.Namespace}
	if len(n.Attr) > 0 {
		c.Attr = make([]html.Attribute, len(n.Attr))
		copy(c.Attr, n.Attr)
	}
	for ch := n.FirstChild; ch != nil; ch = ch.NextSibling {
		c.AppendChild(clone(ch))
	}
	return c
}

// index records the slots in a tree. A data-repeat element is recorded in repeats (when
// repeats is not nil) and its contents are skipped: they belong to the rows, not the page.
func index(root *html.Node, slots, repeats map[string]*html.Node) {
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			if repeats != nil {
				if name, ok := attrValue(n, attrRepeat); ok {
					repeats[name] = n
					return
				}
			}
			if name, ok := attrValue(n, attrSlot); ok {
				slots[name] = n
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
}

// inRawText reports the raw-text element n sits in (or is), if any.
func inRawText(n *html.Node) (string, bool) {
	for p := n; p != nil; p = p.Parent {
		if p.Type == html.ElementNode && rawText[p.DataAtom] {
			return p.Data, true
		}
	}
	return "", false
}

// replaceText makes text the only child of n, as a text node. Never parsed as markup.
func replaceText(n *html.Node, text string) {
	htmlx.RemoveChilds(n)
	n.AppendChild(&html.Node{Type: html.TextNode, Data: text})
}

// textOf concatenates the text nodes under n. (htmlx's Text un-escapes a second time.)
func textOf(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return b.String()
}

// setAttr sets key on n, building a new slice so no other tree can see the change, and
// leaving exactly one attribute of that name.
func setAttr(n *html.Node, key, val string) {
	out := make([]html.Attribute, 0, len(n.Attr)+1)
	done := false
	for _, a := range n.Attr {
		if a.Namespace == "" && a.Key == key {
			if !done {
				out = append(out, html.Attribute{Key: key, Val: val})
				done = true
			}
			continue
		}
		out = append(out, a)
	}
	if !done {
		out = append(out, html.Attribute{Key: key, Val: val})
	}
	n.Attr = out
}

// removeAttr drops key from n, building a new slice.
func removeAttr(n *html.Node, key string) {
	out := make([]html.Attribute, 0, len(n.Attr))
	for _, a := range n.Attr {
		if a.Namespace == "" && a.Key == key {
			continue
		}
		out = append(out, a)
	}
	n.Attr = out
}
