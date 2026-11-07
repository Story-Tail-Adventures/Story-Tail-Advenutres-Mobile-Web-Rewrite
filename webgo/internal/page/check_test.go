package page

import (
	"strings"
	"testing"
	"testing/fstest"
)

func doc(body string) []byte {
	return []byte("<!DOCTYPE html><html><head><title>t</title></head><body><main>" + body + "</main></body></html>")
}

// Each broken page must stop Load, with an error that names the problem.
func TestLoadRefusesBrokenPages(t *testing.T) {
	cases := []struct {
		name string
		html []byte
		spec Spec
		want string
	}{
		{
			"undeclared slot", doc(`<p data-slot="a">x</p><p data-slot="b">y</p>`),
			Spec{Slots: []string{"a"}}, `slot "b" is in the HTML but not declared`,
		},
		{
			"declared slot missing (a rename)", doc(`<p data-slot="trip-name">x</p>`),
			Spec{Slots: []string{"trip-title"}}, `slot "trip-title" appears 0 times`,
		},
		{
			"slot twice", doc(`<p data-slot="a">x</p><p data-slot="a">y</p>`),
			Spec{Slots: []string{"a"}}, `slot "a" appears 2 times`,
		},
		{
			"slot inside a script", []byte(`<!DOCTYPE html><html><head><script data-slot="a"></script></head><body></body></html>`),
			Spec{Slots: []string{"a"}}, "raw text",
		},
		{
			"slot inside a style", doc(`<style data-slot="a"></style>`),
			Spec{Slots: []string{"a"}}, "raw text",
		},
		{
			"undeclared repeat", doc(`<ul><li data-repeat="rows">x</li></ul>`),
			Spec{}, `repeat "rows" is in the HTML but not declared`,
		},
		{
			"declared repeat missing", doc(`<p>x</p>`),
			Spec{Repeats: map[string][]string{"rows": nil}}, `repeat "rows" appears 0 times`,
		},
		{
			"nested repeat", doc(`<ul><li data-repeat="a"><ol><li data-repeat="b">x</li></ol></li></ul>`),
			Spec{Repeats: map[string][]string{"a": nil, "b": nil}}, "nesting is not supported",
		},
		{
			"a row's own slot undeclared", doc(`<ul><li data-repeat="a" data-slot="b">x</li></ul>`),
			Spec{Repeats: map[string][]string{"a": nil}}, `slot "b" is in repeat "a" but not declared`,
		},
		{
			"row slot undeclared", doc(`<ul><li data-repeat="a"><span data-slot="name">x</span></li></ul>`),
			Spec{Repeats: map[string][]string{"a": nil}}, `slot "name" is in repeat "a" but not declared`,
		},
		{
			"row slot missing", doc(`<ul><li data-repeat="a">x</li></ul>`),
			Spec{Repeats: map[string][]string{"a": {"name"}}}, `slot "name" appears 0 times in repeat "a"`,
		},
		{
			"name used by the page and a row", doc(`<p data-slot="name">x</p><ul><li data-repeat="a"><span data-slot="name">y</span></li></ul>`),
			Spec{Slots: []string{"name"}, Repeats: map[string][]string{"a": {"name"}}}, "declared twice",
		},
		{
			"bad slot name", doc(`<p data-slot="Trip_Title">x</p>`),
			Spec{Slots: []string{"Trip_Title"}}, "must match",
		},
		{
			"missing file", nil,
			Spec{Slots: nil}, "file does not exist",
		},
		{
			"slot on a <link>", []byte(`<!DOCTYPE html><html><head><link data-slot="a" rel="stylesheet" href="/x.css"></head><body></body></html>`),
			Spec{Slots: []string{"a"}}, "may not be a slot",
		},
		{
			"slot on a <base>", []byte(`<!DOCTYPE html><html><head><base data-slot="a" href="/"></head><body></body></html>`),
			Spec{Slots: []string{"a"}}, "may not be a slot",
		},
		{
			"slot on a <meta>", []byte(`<!DOCTYPE html><html><head><meta data-slot="a" http-equiv="refresh" content="0"></head><body></body></html>`),
			Spec{Slots: []string{"a"}}, "may not be a slot",
		},
		{
			"slot on an <embed>", doc(`<embed data-slot="a" src="/x">`),
			Spec{Slots: []string{"a"}}, "may not be a slot",
		},
		{
			"slot with xlink:href", doc(`<svg><a data-slot="a" xlink:href="#placeholder"><text>x</text></a></svg>`),
			Spec{Slots: []string{"a"}}, "namespaced attribute",
		},
	}
	for _, c := range cases {
		fsys := fstest.MapFS{}
		if c.html != nil {
			fsys["p.html"] = &fstest.MapFile{Data: c.html}
		}
		c.spec.File = "p.html"
		_, err := Load(fsys, c.spec)
		if err == nil {
			t.Errorf("%s: loaded without error", c.name)
			continue
		}
		if !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: error %q does not mention %q", c.name, err, c.want)
		}
	}
}

const okLayout = `<!DOCTYPE html><html><head><title>L</title></head><body><main data-layout-main></main></body></html>`

func TestLayoutRules(t *testing.T) {
	page := doc(`<p data-slot="a">x</p>`)
	cases := map[string]struct {
		layout string
		page   []byte
		want   string
	}{
		"layout without a main":  {`<!DOCTYPE html><html><body><div>x</div></body></html>`, page, "exactly one element with data-layout-main"},
		"layout with two mains":  {`<!DOCTYPE html><html><body><main data-layout-main></main><div data-layout-main></div></body></html>`, page, "found 2"},
		"page without a main":    {`<!DOCTYPE html><html><body><main data-layout-main></main></body></html>`, []byte(`<!DOCTYPE html><p data-slot="a">x</p>`), "exactly one <main>"},
		"undeclared layout slot": {`<!DOCTYPE html><html><body><nav data-slot="nav">n</nav><main data-layout-main></main></body></html>`, page, `slot "nav" is in the HTML but not declared`},
		// compose uses only the page's <title> and <main>; anything else must fail loudly.
		"page stylesheet":      {okLayout, []byte(`<!DOCTYPE html><html><head><title>t</title><link rel="stylesheet" href="/p.css"></head><body><main><p data-slot="a">x</p></main></body></html>`), "<link> in the page's <head> would be dropped"},
		"page script":          {okLayout, []byte(`<!DOCTYPE html><html><head><script src="/p.js"></script></head><body><main><p data-slot="a">x</p></main></body></html>`), "<script> in the page's <head> would be dropped"},
		"main attributes":      {okLayout, []byte(`<!DOCTYPE html><html><body><main class="wide"><p data-slot="a">x</p></main></body></html>`), "attributes on the page's <main>"},
		"content outside main": {okLayout, []byte(`<!DOCTYPE html><html><body><nav data-slot="nav">n</nav><main><p data-slot="a">x</p></main></body></html>`), "<nav> outside <main>"},
		"text outside main":    {okLayout, []byte(`<!DOCTYPE html><html><body>stray<main><p data-slot="a">x</p></main></body></html>`), "text outside <main>"},
	}
	for name, c := range cases {
		fsys := fstest.MapFS{"l.html": {Data: []byte(c.layout)}, "p.html": {Data: c.page}}
		_, err := Load(fsys, Spec{File: "p.html", Layout: &Layout{File: "l.html"}, Slots: []string{"a"}})
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, want mention of %q", name, err, c.want)
		}
	}
}

func TestLoadReportsEveryProblemAtOnce(t *testing.T) {
	fsys := fstest.MapFS{
		"a.html": {Data: doc(`<p data-slot="x">x</p>`)},
		"b.html": {Data: doc(`<p data-slot="y">y</p>`)},
	}
	_, err := Load(fsys, Spec{File: "a.html"}, Spec{File: "b.html"}, Spec{File: "a.html", Slots: []string{"x"}})
	if err == nil {
		t.Fatal("loaded")
	}
	for _, want := range []string{"a.html", "b.html", "declared twice"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error lacks %q: %v", want, err)
		}
	}
}

func TestLayoutIsSharedNotMutated(t *testing.T) {
	fsys := fstest.MapFS{
		"l.html": {Data: []byte(`<!DOCTYPE html><html><head><title>L</title></head><body><main data-layout-main>L</main></body></html>`)},
		"a.html": {Data: []byte(`<!DOCTYPE html><html><head><title>A</title></head><body><main><p data-slot="a">a</p></main></body></html>`)},
		"b.html": {Data: []byte(`<!DOCTYPE html><html><head><title>B</title></head><body><main><p data-slot="b">b</p></main></body></html>`)},
	}
	lay := &Layout{File: "l.html"}
	set, err := Load(fsys, Spec{File: "a.html", Layout: lay, Slots: []string{"a"}}, Spec{File: "b.html", Layout: lay, Slots: []string{"b"}})
	if err != nil {
		t.Fatal(err)
	}
	for file, slot := range map[string]string{"a.html": "a", "b.html": "b"} {
		tmpl, _ := set.Template(file)
		d := tmpl.New()
		d.Text(slot, "filled-"+slot)
		b, err := d.Bytes()
		if err != nil {
			t.Fatal(err)
		}
		out := string(b)
		other := map[string]string{"a": "b", "b": "a"}[slot]
		if !strings.Contains(out, "filled-"+slot) || strings.Contains(out, `data-slot="`+other+`"`) {
			t.Errorf("%s got the other page's content:\n%s", file, out)
		}
	}
	if got := set.Files(); len(got) != 2 || got[0] != "a.html" {
		t.Errorf("Files() = %v", got)
	}
	if _, err := set.Template("missing.html"); err == nil {
		t.Error("Template returned a page that was never loaded")
	}
}
