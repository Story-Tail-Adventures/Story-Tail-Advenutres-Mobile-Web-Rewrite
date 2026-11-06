package page

import (
	"errors"
	"fmt"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// assetPrefix is where our own static files are served (internal/static).
const assetPrefix = "/assets/"

// rewriteAssets runs once per page at startup, on the freshly composed tree before any
// request can see it. It does two jobs.
//
// It points the page's own asset references at their hashed URLs: <link href>,
// <script src>, <img src>, <source src> and svg <use href> that name /assets/... A name that
// is not an asset fails the boot, so a renamed stylesheet cannot ship as a 404.
//
// And it refuses what the Content Security Policy (script-src 'self', style-src 'self', no
// inline anything) would silently block in the browser: an inline <script>, any <style>, a
// style="" attribute, an on* handler, and a script or stylesheet from anywhere but /assets/.
// A page that breaks the CSP fails the boot here instead of rendering unstyled or dead.
//
// The writes are this package's own setAttr, on a tree no request holds yet. They come
// from our files, never from a request.
func rewriteAssets(root *html.Node, file string, resolve func(string) (string, bool)) error {
	var errs []error
	fail := func(format string, a ...any) {
		errs = append(errs, fmt.Errorf("%s: "+format, append([]any{file}, a...)...))
	}
	asset := func(n *html.Node, key string) {
		v, ok := attrValue(n, key)
		if !ok || !strings.HasPrefix(v, assetPrefix) {
			return
		}
		u, ok := resolve(v)
		if !ok {
			fail("<%s %s=%q> names an asset that does not exist", n.Data, key, v)
			return
		}
		setAttr(n, key, u)
	}

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			for _, a := range n.Attr {
				switch {
				case a.Namespace == "" && a.Key == "style":
					fail("<%s> has a style attribute; the CSP (style-src 'self') blocks inline styles, so use a class", n.Data)
				case a.Namespace == "" && strings.HasPrefix(a.Key, "on"):
					fail("<%s> has an %s handler; the CSP blocks inline handlers, so use a JS module", n.Data, a.Key)
				case a.Namespace != "" && a.Key == "href" && strings.HasPrefix(a.Val, assetPrefix):
					fail("<%s> uses %s:href for an asset; use a plain href", n.Data, a.Namespace)
				case urlTags[a.Key] != nil && strings.HasPrefix(strings.ToLower(strings.TrimSpace(a.Val)), "javascript:"):
					fail("<%s %s> is a javascript: URL; the CSP blocks it, so use a JS module", n.Data, a.Key)
				}
			}
			switch n.DataAtom {
			case atom.Script:
				src, hasSrc := attrValue(n, "src")
				switch {
				case n.Namespace != "":
					// An SVG <script> loads by href, which the src rule below would not see.
					fail("<script> inside <%s>; scripts belong in /assets/js/ files", n.Namespace)
				case !hasSrc:
					if strings.TrimSpace(textOf(n)) != "" {
						fail("inline <script>; the CSP (script-src 'self') blocks it, so move it to an /assets/js/ file")
					}
				case !strings.HasPrefix(src, assetPrefix):
					fail("<script src=%q> is not one of our assets; the CSP allows only /assets/", src)
				default:
					asset(n, "src")
				}
			case atom.Style:
				fail("<style> element; the CSP (style-src 'self') blocks it, so put the rules in an /assets/css/ file")
			case atom.Link:
				href, _ := attrValue(n, "href")
				if rel, _ := attrValue(n, "rel"); hasToken(rel, "stylesheet") && !strings.HasPrefix(href, assetPrefix) {
					fail("<link rel=stylesheet href=%q> is not one of our assets; the CSP allows only /assets/", href)
				}
				asset(n, "href")
			case atom.Img, atom.Source:
				asset(n, "src")
			default:
				if n.Namespace == "svg" && n.Data == "use" {
					asset(n, "href")
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return errors.Join(errs...)
}

func hasToken(list, token string) bool {
	for _, t := range strings.Fields(list) {
		if strings.EqualFold(t, token) {
			return true
		}
	}
	return false
}
