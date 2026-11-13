package page

import (
	"strings"
	"testing"
	"testing/fstest"
)

const headLayoutHTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Story-Tail Adventures</title>
<meta name="description" content="The layout's default sentence."></head>
<body><main data-layout-main>x</main></body></html>`

const photoPageHTML = `<!DOCTYPE html>
<html><head><title>Photo · Story-Tail Adventures</title></head><body><main>
<img data-slot="photo" src="https://images.unsplash.com/sample" alt="">
<img data-slot="placeholder-set" src="https://images.unsplash.com/a" srcset="https://images.unsplash.com/a 1x" alt="">
</main></body></html>`

func loadPhoto(t *testing.T) *Template {
	t.Helper()
	set, err := Load(fstest.MapFS{
		"layout.html": {Data: []byte(headLayoutHTML)},
		"photo.html":  {Data: []byte(photoPageHTML)},
	}, Spec{File: "photo.html", Layout: &Layout{File: "layout.html"}, Slots: []string{"photo", "placeholder-set"}})
	if err != nil {
		t.Fatal(err)
	}
	tmpl, err := set.Template("photo.html")
	if err != nil {
		t.Fatal(err)
	}
	return tmpl
}

func fillPhotos(d *Doc) {
	d.URL("photo", "src", "https://images.unsplash.com/photo-1?w=640")
	d.URL("placeholder-set", "src", "https://images.unsplash.com/photo-2?w=640")
	d.SrcSet("placeholder-set", []Candidate{{"https://images.unsplash.com/photo-2?w=640", "640w"}})
}

func TestHeadWritesMetadata(t *testing.T) {
	d := loadPhoto(t).New()
	fillPhotos(d)
	d.Head(Head{
		Title:       `Turks & "Caicos" · Story-Tail Adventures`,
		Description: `A <b>week</b> of "rest".`,
		Canonical:   "https://app.story-tail.com/explore/beaches",
		Robots:      "noindex, follow",
		Properties: []Property{
			{"og:title", "Turks"},
			{"og:url", "https://app.story-tail.com/explore/beaches"},
			{"og:image", "javascript:alert(1)"},
			{"twitter:card", "summary_large_image"},
		},
		JSONLD: map[string]string{"name": "</script><script>alert(1)</script>"},
	})
	out := render(t, d)
	bs := "\\"
	for _, want := range []string{
		`<title>Turks &amp; &#34;Caicos&#34; · Story-Tail Adventures</title>`,
		`<meta name="description" content="A &lt;b&gt;week&lt;/b&gt; of &#34;rest&#34;."/>`,
		`<meta name="robots" content="noindex, follow"/>`,
		`<link rel="canonical" href="https://app.story-tail.com/explore/beaches"/>`,
		`<meta property="og:title" content="Turks"/>`,
		`<meta property="og:url" content="https://app.story-tail.com/explore/beaches"/>`,
		`<meta name="twitter:card" content="summary_large_image"/>`,
		`<script type="application/ld+json">{"name":"` + bs + `u003c/script` + bs + `u003e` + bs + `u003cscript`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %s in\n%s", want, out)
		}
	}
	if strings.Contains(out, "javascript:") {
		t.Error("an unsafe og:image shipped")
	}
	if strings.Count(out, `name="description"`) != 1 {
		t.Error("the layout's description should be replaced, not duplicated")
	}
}

func TestHeadLeavesOutAnUnsafeCanonical(t *testing.T) {
	d := loadPhoto(t).New()
	fillPhotos(d)
	d.Head(Head{Canonical: "http://localhost:8080/"})
	if out := render(t, d); strings.Contains(out, "canonical") {
		t.Errorf("an http canonical shipped:\n%s", out)
	}
}

func TestHeadRefusesOtherPropertyNames(t *testing.T) {
	d := loadPhoto(t).New()
	fillPhotos(d)
	d.Head(Head{Properties: []Property{{"http-equiv", "refresh"}}})
	if _, err := d.Bytes(); err == nil {
		t.Error("a non og:/twitter: name rendered")
	}
}

func TestSrcSet(t *testing.T) {
	d := loadPhoto(t).New()
	d.URL("photo", "src", "https://images.unsplash.com/photo-1?w=640")
	if !d.SrcSet("photo", []Candidate{
		{"https://images.unsplash.com/photo-1?w=640&q=80", "640w"},
		{"https://images.unsplash.com/photo-1?w=1080&q=80", "1080w"},
	}) {
		t.Fatal("a good srcset was refused")
	}
	d.URL("placeholder-set", "src", "https://images.unsplash.com/photo-2?w=640")
	if d.SrcSet("placeholder-set", []Candidate{{"https://x.example/a.jpg 9999w, javascript:alert(1)", "1x"}}) {
		t.Error("a candidate with a comma and a space was accepted")
	}
	out := render(t, d)
	if !strings.Contains(out, `srcset="https://images.unsplash.com/photo-1?w=640&amp;q=80 640w, https://images.unsplash.com/photo-1?w=1080&amp;q=80 1080w"`) {
		t.Errorf("srcset missing:\n%s", out)
	}
	if strings.Count(out, "srcset") != 1 {
		t.Errorf("the refused srcset (and its placeholder) should be gone:\n%s", out)
	}
}

func TestSrcSetMistakes(t *testing.T) {
	cases := map[string][]Candidate{
		"bad descriptor": {{"https://images.unsplash.com/a", "640"}},
		"http":           {{"http://images.unsplash.com/a", "1x"}},
		"empty":          nil,
	}
	for name, set := range cases {
		d := loadPhoto(t).New()
		fillPhotos(d)
		d.URL("photo", "src", "https://images.unsplash.com/a")
		if d.SrcSet("photo", set) {
			t.Errorf("%s: accepted", name)
		}
	}
}

// A placeholder srcset in the HTML is a link like any other: it must be set or dropped.
func TestPlaceholderSrcSetIsPending(t *testing.T) {
	d := loadPhoto(t).New()
	d.URL("photo", "src", "https://images.unsplash.com/a")
	d.URL("placeholder-set", "src", "https://images.unsplash.com/b")
	if _, err := d.Bytes(); err == nil || !strings.Contains(err.Error(), "srcset") {
		t.Errorf("the sample srcset would ship: %v", err)
	}
}

// The reviewer's findings on this package, each kept as a test so the fix cannot be undone
// quietly.
func TestHeadRefusesAPropertyThatIsNotOnTheList(t *testing.T) {
	// og:video, twitter:player and friends are links a crawler fetches, and none of them
	// shares a spelling with og:url or og:image, so a suffix rule let them through unchecked.
	for _, name := range []string{"og:video", "og:audio", "og:see_also", "twitter:player", "twitter:app:url:iphone"} {
		d := loadPhoto(t).New()
		fillPhotos(d)
		d.Head(Head{Properties: []Property{{name, "javascript:alert(1)"}}})
		b, err := d.Bytes()
		if err == nil {
			t.Errorf("%s rendered: %s", name, b)
		}
	}
}

func TestHeadLinksMustBeAbsoluteHTTPS(t *testing.T) {
	for _, bad := range []string{"/explore/x", "?q=1", "#frag", "mailto:gyasi@example.com", "tel:+15550000", "http://app.story-tail.com/x"} {
		d := loadPhoto(t).New()
		fillPhotos(d)
		d.Head(Head{Canonical: bad, Properties: []Property{{"og:url", bad}, {"og:image", bad}}})
		out := render(t, d)
		if strings.Contains(out, "canonical") || strings.Contains(out, "og:url") || strings.Contains(out, "og:image") {
			t.Errorf("%q was written as a link:\n%s", bad, out)
		}
	}
}

func TestHeadRefusesASecondCall(t *testing.T) {
	d := loadPhoto(t).New()
	fillPhotos(d)
	d.Head(Head{Title: "One", Canonical: "https://app.story-tail.com/"})
	d.Head(Head{Title: "Two", Canonical: "https://app.story-tail.com/other"})
	if _, err := d.Bytes(); err == nil || !strings.Contains(err.Error(), "called twice") {
		t.Errorf("a second Head was accepted: %v", err)
	}
}

func TestHeadWritesNothingForATypedNilJSONLD(t *testing.T) {
	type doc struct{ Name string }
	var missing *doc
	d := loadPhoto(t).New()
	fillPhotos(d)
	d.Head(Head{JSONLD: missing})
	if out := render(t, d); strings.Contains(out, "ld+json") {
		t.Errorf("a typed nil shipped an empty JSON-LD block:\n%s", out)
	}
}

func TestSrcSetHandlesTheSlot(t *testing.T) {
	// A <source> holds no text and may carry no src, so SrcSet has to be enough on its own.
	const pic = `<!DOCTYPE html><html><head><title>t</title></head><body><main>
<picture><source data-slot="webp" type="image/webp" srcset="https://images.unsplash.com/a 1x"><img data-slot="fallback" src="https://images.unsplash.com/a" alt=""></picture>
</main></body></html>`
	set, err := Load(fstest.MapFS{"layout.html": {Data: []byte(headLayoutHTML)}, "pic.html": {Data: []byte(pic)}},
		Spec{File: "pic.html", Layout: &Layout{File: "layout.html"}, Slots: []string{"webp", "fallback"}})
	if err != nil {
		t.Fatal(err)
	}
	tmpl, _ := set.Template("pic.html")
	d := tmpl.New()
	d.SrcSet("webp", []Candidate{{"https://images.unsplash.com/photo-1?w=640", "640w"}})
	d.URL("fallback", "src", "https://images.unsplash.com/photo-1?w=640")
	d.SrcSet("fallback", []Candidate{{"https://images.unsplash.com/photo-1?w=640", "640w"}})
	if _, err := d.Bytes(); err != nil {
		t.Errorf("a <source> filled only by SrcSet did not count as handled: %v", err)
	}
}

func TestSrcSetRefusesAZeroDensity(t *testing.T) {
	for _, d := range []string{"0x", "0.0x", "00x"} {
		doc := loadPhoto(t).New()
		fillPhotos(doc)
		doc.URL("photo", "src", "https://images.unsplash.com/a")
		if doc.SrcSet("photo", []Candidate{{"https://images.unsplash.com/a", d}}) {
			t.Errorf("descriptor %q was accepted", d)
		}
	}
}
