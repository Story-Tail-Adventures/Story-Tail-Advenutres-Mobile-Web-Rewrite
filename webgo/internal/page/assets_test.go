package page

import (
	"strings"
	"testing"
	"testing/fstest"
)

// resolve stands in for internal/static's Lookup: two known assets.
func resolve(ref string) (string, bool) {
	name, frag, hasFrag := strings.Cut(ref, "#")
	known := map[string]string{
		"/assets/css/site.css": "/assets/css/site.abc1234567.css",
		"/assets/js/ui.js":     "/assets/js/ui.def1234567.js",
		"/assets/icons.svg":    "/assets/icons.0123456789.svg",
		"/assets/img/a.webp":   "/assets/img/a.9876543210.webp",
	}
	u, ok := known[name]
	if hasFrag {
		u += "#" + frag
	}
	return u, ok
}

func loadWithAssets(t *testing.T, page string) (*Set, error) {
	t.Helper()
	fsys := fstest.MapFS{"p.html": {Data: []byte(page)}}
	return LoadWith(fsys, Options{Assets: resolve}, Spec{File: "p.html"})
}

func TestOwnAssetsAreRewrittenToHashedNames(t *testing.T) {
	set, err := loadWithAssets(t, `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/assets/css/site.css"><script type="module" src="/assets/js/ui.js"></script>
<link rel="canonical" href="https://example.com/x"></head>
<body><img src="/assets/img/a.webp" alt=""><img src="https://images.unsplash.com/x" alt="">
<svg class="icon"><use href="/assets/icons.svg#search"></use></svg></body></html>`)
	if err != nil {
		t.Fatal(err)
	}
	tmpl, _ := set.Template("p.html")
	out, err := tmpl.New().Bytes()
	if err != nil {
		t.Fatal(err)
	}
	got := string(out)
	for _, want := range []string{
		`href="/assets/css/site.abc1234567.css"`,
		`src="/assets/js/ui.def1234567.js"`,
		`src="/assets/img/a.9876543210.webp"`,
		`href="/assets/icons.0123456789.svg#search"`,
		`href="https://example.com/x"`,        // not ours: untouched
		`src="https://images.unsplash.com/x"`, // not ours: untouched
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %s in\n%s", want, got)
		}
	}
	if strings.Contains(got, `"/assets/css/site.css"`) {
		t.Error("the plain asset name survived")
	}
}

func TestPagesThatBreakTheCSPFailToLoad(t *testing.T) {
	cases := map[string]struct{ page, want string }{
		"unknown asset":       {`<html><head><link rel="stylesheet" href="/assets/css/gone.css"></head><body></body></html>`, "does not exist"},
		"inline script":       {`<html><head><script>alert(1)</script></head><body></body></html>`, "inline <script>"},
		"external script":     {`<html><head><script src="https://cdn.example.com/x.js"></script></head><body></body></html>`, "not one of our assets"},
		"external stylesheet": {`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css"></head><body></body></html>`, "not one of our assets"},
		"style element":       {`<html><head><style>p{color:red}</style></head><body></body></html>`, "<style> element"},
		"style attribute":     {`<html><body><p style="color:red">x</p></body></html>`, "style attribute"},
		"event handler":       {`<html><body><button onclick="go()">x</button></body></html>`, "onclick handler"},
		"xlink asset":         {`<html><body><svg><use xlink:href="/assets/icons.svg#a"></use></svg></body></html>`, "plain href"},
		"unknown icon sprite": {`<html><body><svg><use href="/assets/other.svg#a"></use></svg></body></html>`, "does not exist"},
		"svg script by href":  {`<html><body><svg><script href="https://cdn.example.com/x.js"></script></svg></body></html>`, "<script> inside <svg>"},
		"javascript: link":    {`<html><body><a href=" JavaScript:alert(1)">x</a></body></html>`, "javascript: URL"},
		"javascript: action":  {`<html><body><form action="javascript:go()"></form></body></html>`, "javascript: URL"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := loadWithAssets(t, c.page)
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Errorf("err = %v, want it to mention %q", err, c.want)
			}
		})
	}
}

// An empty <script src> is the only script shape a page may have; whitespace inside it is fine.
func TestExternalModuleScriptsAreFine(t *testing.T) {
	if _, err := loadWithAssets(t, `<html><head><script type="module" src="/assets/js/ui.js">
</script></head><body></body></html>`); err != nil {
		t.Error(err)
	}
}

// Without Options.Assets nothing is rewritten or checked: the package's own tests and pages
// that predate the asset table keep loading as they did.
func TestLoadWithoutAssetsLeavesPagesAlone(t *testing.T) {
	fsys := fstest.MapFS{"p.html": {Data: []byte(`<html><head><link rel="stylesheet" href="/assets/css/site.css"></head><body></body></html>`)}}
	set, err := Load(fsys, Spec{File: "p.html"})
	if err != nil {
		t.Fatal(err)
	}
	tmpl, _ := set.Template("p.html")
	out, _ := tmpl.New().Bytes()
	if !strings.Contains(string(out), `href="/assets/css/site.css"`) {
		t.Error("Load rewrote an asset with no resolver")
	}
}

// A layout's repeats are declared once on the Layout and checked for every page that uses it.
func TestLayoutRepeats(t *testing.T) {
	fsys := fstest.MapFS{
		"layout.html": {Data: []byte(`<html><head><title>L</title></head><body><ul><li data-repeat="nav"><a data-slot="nav-link" href="/x">x</a></li></ul><main data-layout-main></main></body></html>`)},
		"p.html":      {Data: []byte(`<html><head><title>P</title></head><body><main><p data-slot="a">x</p></main></body></html>`)},
	}
	lay := &Layout{File: "layout.html", Repeats: map[string][]string{"nav": {"nav-link"}}}
	set, err := Load(fsys, Spec{File: "p.html", Layout: lay, Slots: []string{"a"}})
	if err != nil {
		t.Fatal(err)
	}
	tmpl, _ := set.Template("p.html")
	d := tmpl.New()
	d.Text("a", "hello")
	d.Repeat("nav", 2, func(i int, r *Row) {
		r.URL("nav-link", "href", []string{"/one", "/two"}[i])
		r.Text("nav-link", []string{"One", "Two"}[i])
	})
	out, err := d.Bytes()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `href="/one">One</a>`) || !strings.Contains(string(out), `href="/two">Two</a>`) {
		t.Errorf("layout repeat not filled:\n%s", out)
	}

	// A page may not redeclare the layout's repeat.
	_, err = Load(fsys, Spec{File: "p.html", Layout: lay, Slots: []string{"a"}, Repeats: map[string][]string{"nav": {"nav-link"}}})
	if err == nil || !strings.Contains(err.Error(), "declared by both") {
		t.Errorf("a duplicate repeat loaded: %v", err)
	}
	// And an undeclared layout repeat still fails the boot.
	_, err = Load(fsys, Spec{File: "p.html", Layout: &Layout{File: "layout.html"}, Slots: []string{"a"}})
	if err == nil || !strings.Contains(err.Error(), `repeat "nav" is in the HTML but not declared`) {
		t.Errorf("an undeclared layout repeat loaded: %v", err)
	}
}

// Comments in a page file are notes for its editors, and never reach a visitor.
func TestCommentsNeverShip(t *testing.T) {
	fsys := fstest.MapFS{"p.html": {Data: []byte(`<!DOCTYPE html>
<!-- internal: ports components/Foo.tsx -->
<html><head><!-- head note --><title>T</title></head><body><!-- body note --><p>x<!-- inline --></p></body></html>`)}}
	set, err := Load(fsys, Spec{File: "p.html"})
	if err != nil {
		t.Fatal(err)
	}
	tmpl, _ := set.Template("p.html")
	out, _ := tmpl.New().Bytes()
	if strings.Contains(string(out), "<!--") || strings.Contains(string(out), "note") {
		t.Errorf("a comment shipped:\n%s", out)
	}
}
