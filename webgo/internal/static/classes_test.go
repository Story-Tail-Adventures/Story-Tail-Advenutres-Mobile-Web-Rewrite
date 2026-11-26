package static

import (
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"golang.org/x/net/html"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// Every class a page uses must be defined by some stylesheet: the idea behind
// web/test/class-allowlist.test.ts. A misspelled or deleted class matches no rule and nothing
// errors; the element just loses its look. So this reads every class in every page file, and
// every class a Go handler adds with page.Doc.Class("slot", "name", ...), and fails on any
// that no CSS file in webgo/assets defines.
//
// The reverse check (no unused CSS) stays off while the pages are still being built: the
// shared stylesheets define what the area sessions will use.

// markers are classes with no rule of their own: hooks a script or a test reads.
var markers = map[string]string{}

var (
	prelude    = regexp.MustCompile(`([^{};]+)\{`)
	classInSel = regexp.MustCompile(`\.([A-Za-z_][\w-]*)`)
	goClass    = regexp.MustCompile(`\.Class\(\s*[^,]+,\s*"([^"]+)"`)
)

// definedClasses reads every `.class` in a rule's selector across all stylesheets.
func definedClasses(t *testing.T) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	err := fs.WalkDir(assets.FS, "css", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".css") {
			return err
		}
		b, err := fs.ReadFile(assets.FS, p)
		if err != nil {
			return err
		}
		css := comment.ReplaceAllString(string(b), "")
		for _, m := range prelude.FindAllStringSubmatch(css, -1) {
			if strings.Contains(m[1], ":") && !strings.Contains(m[1], ".") {
				continue // a declaration's value, not a selector
			}
			for _, c := range classInSel.FindAllStringSubmatch(m[1], -1) {
				out[c[1]] = true
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

type use struct{ class, where string }

// pageClasses reads the class attribute of every element in every page file.
func pageClasses(t *testing.T) []use {
	t.Helper()
	var out []use
	err := fs.WalkDir(pages.FS, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".html") {
			return err
		}
		f, err := pages.FS.Open(p)
		if err != nil {
			return err
		}
		defer f.Close()
		doc, err := html.Parse(f)
		if err != nil {
			return err
		}
		var walk func(*html.Node)
		walk = func(n *html.Node) {
			if n.Type == html.ElementNode {
				for _, a := range n.Attr {
					if a.Key == "class" && a.Namespace == "" {
						for _, c := range strings.Fields(a.Val) {
							out = append(out, use{c, p})
						}
					}
				}
			}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				walk(c)
			}
		}
		walk(doc)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// goClasses reads the literal class names handlers add with Class(slot, "name", on).
func goClasses(t *testing.T) []use {
	t.Helper()
	root := filepath.Join("..", "..")
	var out []use
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(p, ".go") || strings.HasSuffix(p, "_test.go") {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		for _, m := range goClass.FindAllStringSubmatch(string(b), -1) {
			out = append(out, use{m[1], p})
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestEveryClassIsDefined(t *testing.T) {
	defined := definedClasses(t)
	uses := append(pageClasses(t), goClasses(t)...)
	if len(uses) == 0 {
		t.Fatal("found no classes at all; the scan is broken")
	}
	missing := map[string][]string{}
	for _, u := range uses {
		if defined[u.class] || markers[u.class] != "" {
			continue
		}
		if !slices.Contains(missing[u.class], u.where) {
			missing[u.class] = append(missing[u.class], u.where)
		}
	}
	for _, c := range slices.Sorted(maps.Keys(missing)) {
		t.Errorf("class %q is used in %s but no stylesheet in webgo/assets/css defines it", c, strings.Join(missing[c], ", "))
	}
}

// The test itself must notice a missing class, or it guards nothing.
func TestAllowlistCatchesAnUndefinedClass(t *testing.T) {
	defined := definedClasses(t)
	for _, c := range []string{"btn", "status-booked", "pub-topbar", "sta-light-only", "client-bottom-nav"} {
		if !defined[c] {
			t.Errorf("%q should be defined", c)
		}
	}
	if defined["btn-primaryy"] || defined["95px"] {
		t.Error("the CSS scan finds classes that do not exist")
	}
}

var (
	spriteID = regexp.MustCompile(`<symbol id="([a-z_]+)" viewBox="0 0 24 24"><path d="([^"]+)"/></symbol>`)
	iconUse  = regexp.MustCompile(`href="/assets/icons\.svg#([a-z_]+)"`)
	tsPath   = regexp.MustCompile(`(?m)^\s*([a-z_]+):\s*"([^"]+)",?\s*$`)
)

func sprite(t *testing.T) map[string]string {
	t.Helper()
	b, err := assets.FS.ReadFile("icons.svg")
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	for _, m := range spriteID.FindAllStringSubmatch(string(b), -1) {
		out[m[1]] = m[2]
	}
	if len(out) == 0 {
		t.Fatal("no symbols in icons.svg")
	}
	return out
}

// Every icon a page names is in the sprite.
func TestEveryIconExists(t *testing.T) {
	icons := sprite(t)
	err := fs.WalkDir(pages.FS, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".html") {
			return err
		}
		b, err := fs.ReadFile(pages.FS, p)
		if err != nil {
			return err
		}
		for _, m := range iconUse.FindAllStringSubmatch(string(b), -1) {
			if _, ok := icons[m[1]]; !ok {
				t.Errorf("%s uses icon %q, which icons.svg does not have", p, m[1])
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// The sprite is web/components/ui/icon-paths.ts, path for path, while web/ exists. To add a
// glyph, copy its path from design/source-prototype/shared/icons.jsx into both.
func TestSpriteMatchesTheWebIconSet(t *testing.T) {
	ts, ok := repoFile(t, "web/components/ui/icon-paths.ts")
	if !ok {
		t.Skip("web/ is gone (Phase 6)")
	}
	body := ts[strings.Index(ts, "ICON_PATHS = {"):strings.Index(ts, "} as const")]
	want := map[string]string{}
	for _, m := range tsPath.FindAllStringSubmatch(body, -1) {
		want[m[1]] = m[2]
	}
	got := sprite(t)
	for name, d := range want {
		if got[name] != d {
			t.Errorf("icon %q differs from icon-paths.ts", name)
		}
	}
	for name := range got {
		if _, ok := want[name]; !ok {
			t.Errorf("icon %q is not in icon-paths.ts", name)
		}
	}
}
