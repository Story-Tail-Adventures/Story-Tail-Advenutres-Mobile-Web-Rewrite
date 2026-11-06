package page

import (
	"bytes"
	"fmt"
	"strings"
	"sync"
	"testing"
	"testing/fstest"

	"golang.org/x/net/html"
)

const layoutHTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Layout title</title></head>
<body><header>Story-Tail Adventures</header><main data-layout-main>layout placeholder</main>
<footer><span data-slot="footer-note">footer placeholder</span></footer></body></html>`

const tripHTML = `<!DOCTYPE html>
<html><head><title>Trip</title></head><body><main>
<h1 data-slot="trip-title">Sample trip</h1>
<p data-slot="traveler">Sample traveler</p>
<textarea data-slot="notes">sample notes</textarea>
<a data-slot="pay-link" href="#sample-pay">Pay</a>
<input data-slot="headcount" type="number" value="2">
<ul><li data-repeat="stops"><a data-slot="stop-link" href="#sample"><span data-slot="stop-name">Sample stop</span></a></li></ul>
<section data-slot="empty"><p data-slot="empty-message">Nothing here yet.</p></section>
</main></body></html>`

var testLayout = &Layout{File: "layout.html", Slots: []string{"footer-note"}}

var tripSpec = Spec{
	File:    "trip.html",
	Layout:  testLayout,
	Slots:   []string{"trip-title", "traveler", "notes", "pay-link", "headcount", "empty", "empty-message"},
	Repeats: map[string][]string{"stops": {"stop-link", "stop-name"}},
}

func testFS() fstest.MapFS {
	return fstest.MapFS{
		"layout.html": {Data: []byte(layoutHTML)},
		"trip.html":   {Data: []byte(tripHTML)},
	}
}

func loadTrip(t *testing.T) *Template {
	t.Helper()
	set, err := Load(testFS(), tripSpec)
	if err != nil {
		t.Fatal(err)
	}
	tmpl, err := set.Template("trip.html")
	if err != nil {
		t.Fatal(err)
	}
	return tmpl
}

type stop struct{ name, link string }

// fill fills every slot, the way a handler would.
func fill(d *Doc, traveler string, stops []stop) {
	d.Text("footer-note", "Rest well.")
	d.Text("trip-title", "Aruba in April")
	d.Text("traveler", traveler)
	d.Text("notes", "Window seat, please")
	d.PayURL("pay-link", "https://pay.example.com/m/123")
	d.Attr("headcount", "value", "4")
	d.Repeat("stops", len(stops), func(i int, r *Row) {
		r.Text("stop-name", stops[i].name)
		if !r.URL("stop-link", "href", stops[i].link) {
			r.Attr("stop-link", "aria-disabled", "true")
		}
	})
	if len(stops) > 0 {
		d.Remove("empty")
	} else {
		d.Keep("empty")
		d.Text("empty-message", "No stops yet.")
	}
}

func render(t *testing.T, d *Doc) string {
	t.Helper()
	b, err := d.Bytes()
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestFillRendersAPage(t *testing.T) {
	d := loadTrip(t).New()
	fill(d, "Ada Lovelace", []stop{{"Eagle Beach", "/trips/1/stops/a"}, {"Oranjestad", "/trips/1/stops/b"}})
	out := render(t, d)

	for _, want := range []string{
		"<!DOCTYPE html>",
		"<header>Story-Tail Adventures</header>",
		"<title>Trip</title>", // the page's title replaces the layout's
		`<h1 data-slot="trip-title">Aruba in April</h1>`,
		">Ada Lovelace</p>",
		">Window seat, please</textarea>",
		`href="https://pay.example.com/m/123"`,
		`value="4"`,
		`href="/trips/1/stops/a"`, ">Eagle Beach</span>",
		`href="/trips/1/stops/b"`, ">Oranjestad</span>",
		">Rest well.</span>",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output lacks %q\n%s", want, out)
		}
	}
	for _, gone := range []string{
		"Sample", "sample", "placeholder", "#sample-pay", "Nothing here yet", "Layout title",
		`data-repeat`, `data-slot="empty"`,
	} {
		if strings.Contains(out, gone) {
			t.Errorf("output still has %q\n%s", gone, out)
		}
	}
	if n := strings.Count(out, "<li>"); n != 2 {
		t.Errorf("rendered %d rows, want 2", n)
	}
}

func TestEmptyRepeatRemovesTheSample(t *testing.T) {
	d := loadTrip(t).New()
	fill(d, "Ada", nil)
	out := render(t, d)
	if strings.Contains(out, "<li") || strings.Contains(out, "Sample stop") {
		t.Errorf("sample row shipped:\n%s", out)
	}
	if !strings.Contains(out, "No stops yet.") {
		t.Errorf("empty state missing:\n%s", out)
	}
}

func TestHostileValuesStayText(t *testing.T) {
	d := loadTrip(t).New()
	fill(d, `<script>alert("x")</script>`, []stop{{`"><img src=x onerror=alert(1)>`, "/ok"}})
	d.errList = nil // fill is valid; overwrite two slots with worse values below
	d.Text("notes", `</textarea><script>alert(2)</script>`)
	d.Attr("headcount", "title", `" onmouseover="alert(3)`)
	out := render(t, d)

	for _, bad := range []string{"<script>alert", "<img src=x", `onmouseover="alert`, "</textarea><script>"} {
		if strings.Contains(out, bad) {
			t.Errorf("hostile markup reached the page: %q\n%s", bad, out)
		}
	}
	for _, want := range []string{
		"&lt;script&gt;alert(&#34;x&#34;)&lt;/script&gt;",
		"&lt;/textarea&gt;&lt;script&gt;alert(2)&lt;/script&gt;",
		`title="&#34; onmouseover=&#34;alert(3)"`,
		"&#34;&gt;&lt;img src=x onerror=alert(1)&gt;",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("expected escaped text %q\n%s", want, out)
		}
	}
}

func TestUnsafeLinksAreDroppedNotRendered(t *testing.T) {
	d := loadTrip(t).New()
	fill(d, "Ada", []stop{{"Bad", "javascript:alert(1)"}, {"Worse", "JaVaScRiPt:alert(1)"}, {"Leaves", "//evil.example/x"}})
	d.errList = nil
	if d.PayURL("pay-link", "http://pay.example.com/m/123") {
		t.Error("PayURL accepted http")
	}
	out := render(t, d)
	for _, bad := range []string{"javascript", "JaVaScRiPt", "evil.example", "#sample", "pay.example.com"} {
		if strings.Contains(out, bad) {
			t.Errorf("%q reached the page\n%s", bad, out)
		}
	}
	if n := strings.Count(out, `aria-disabled="true"`); n != 3 {
		t.Errorf("%d rows marked disabled, want 3", n)
	}
}

func TestSetterMistakesStopTheRender(t *testing.T) {
	cases := map[string]func(d *Doc){
		"event handler":       func(d *Doc) { d.Attr("traveler", "onclick", "alert(1)") },
		"style":               func(d *Doc) { d.Attr("traveler", "style", "x") },
		"href through Attr":   func(d *Doc) { d.Attr("pay-link", "href", "/x") },
		"slot attribute":      func(d *Doc) { d.Attr("traveler", "data-slot", "x") },
		"upper case name":     func(d *Doc) { d.Attr("traveler", "Title", "x") },
		"unknown bool":        func(d *Doc) { d.Bool("headcount", "onload", true) },
		"URL on a style attr": func(d *Doc) { d.URL("pay-link", "style", "/x") },
		"text in a void":      func(d *Doc) { d.Text("headcount", "4") },
		"unknown slot":        func(d *Doc) { d.Text("no-such-slot", "x") },
		"unknown repeat":      func(d *Doc) { d.Repeat("no-such-repeat", 1, nil) },
		"bad class":           func(d *Doc) { d.Class("traveler", "a b", true) },
		"row slot from page":  func(d *Doc) { d.Text("stop-name", "x") },
	}
	for name, mistake := range cases {
		d := loadTrip(t).New()
		fill(d, "Ada", []stop{{"A", "/a"}})
		mistake(d)
		if b, err := d.Bytes(); err == nil {
			t.Errorf("%s: rendered anyway:\n%s", name, b)
		}
	}
}

func TestEverySlotMustBeHandled(t *testing.T) {
	d := loadTrip(t).New()
	fill(d, "Ada", []stop{{"A", "/a"}})
	if _, err := d.Bytes(); err != nil {
		t.Fatalf("complete fill failed: %v", err)
	}

	d = loadTrip(t).New() // nothing filled
	_, err := d.Bytes()
	if err == nil {
		t.Fatal("an unfilled page rendered")
	}
	for _, want := range []string{`slot "trip-title" was never filled`, `repeat "stops" was never filled`, `slot "footer-note"`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error lacks %q: %v", want, err)
		}
	}

	d = loadTrip(t).New()
	fill(d, "Ada", nil)
	d.errList = nil
	d.Repeat("stops", 1, func(int, *Row) {}) // already filled once
	if _, err := d.Bytes(); err == nil || !strings.Contains(err.Error(), "already filled") {
		t.Errorf("second Repeat not refused: %v", err)
	}
}

func TestRowSlotsMustBeFilled(t *testing.T) {
	d := loadTrip(t).New()
	d.Text("footer-note", "x")
	d.Text("trip-title", "x")
	d.Text("traveler", "x")
	d.Text("notes", "x")
	d.PayURL("pay-link", "https://pay.example.com/1")
	d.Attr("headcount", "value", "1")
	d.Remove("empty")
	d.Repeat("stops", 1, func(_ int, r *Row) { r.Text("stop-name", "only the name") })
	_, err := d.Bytes()
	if err == nil || !strings.Contains(err.Error(), `slot "stop-link" was never filled`) {
		t.Errorf("unfilled row slot not caught: %v", err)
	}
}

func TestClassToggle(t *testing.T) {
	d := loadTrip(t).New()
	fill(d, "Ada", nil)
	d.Class("traveler", "is-vip", true)
	d.Class("traveler", "is-vip", true) // idempotent
	d.Class("trip-title", "big", true)
	d.Class("trip-title", "big", false)
	out := render(t, d)
	if !strings.Contains(out, `class="is-vip"`) || strings.Count(out, "is-vip") != 1 {
		t.Errorf("class not added once:\n%s", out)
	}
	if strings.Contains(out, "big") {
		t.Errorf("class not removed:\n%s", out)
	}
}

func TestFragment(t *testing.T) {
	d := loadTrip(t).New()
	fill(d, "Ada", nil)
	b, err := d.Fragment("traveler")
	if err != nil {
		t.Fatal(err)
	}
	if got := string(b); got != `<p data-slot="traveler">Ada</p>` {
		t.Errorf("Fragment = %s", got)
	}
}

// The data race this package exists to prevent: many requests filling the same page at
// once. Run under -race (CI does). Each output must hold its own value and no other.
func TestConcurrentFillsDoNotShare(t *testing.T) {
	tmpl := loadTrip(t)
	before := renderTemplate(t, tmpl)

	const n = 64
	outs := make([]string, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Go(func() {
			d := tmpl.New()
			fill(d, fmt.Sprintf("traveler-%03d", i), []stop{{fmt.Sprintf("stop-%03d", i), "/s"}})
			d.Class("traveler", fmt.Sprintf("c%03d", i), true)
			b, err := d.Bytes()
			if err != nil {
				t.Error(err)
				return
			}
			outs[i] = string(b)
		})
	}
	wg.Wait()

	for i, out := range outs {
		if !strings.Contains(out, fmt.Sprintf("traveler-%03d", i)) {
			t.Errorf("output %d lacks its own value", i)
		}
		if c := strings.Count(out, "traveler-"); c != 1 {
			t.Errorf("output %d carries %d traveler values, want 1", i, c)
		}
		if c := strings.Count(out, `class="c`); c != 1 {
			t.Errorf("output %d carries %d added classes, want 1", i, c)
		}
	}
	if after := renderTemplate(t, tmpl); after != before {
		t.Errorf("the parsed page changed after filling copies:\nbefore %s\nafter  %s", before, after)
	}
}

// Two layers keep requests apart: every setter builds a new attribute slice, and New copies
// every slice too. This pins the second layer on its own, so losing either one fails a test
// (htmlx's RemoveAttr, finding 3, is exactly the in-place write the first layer avoids).
func TestNewCopiesEveryNodeAndAttributeSlice(t *testing.T) {
	tmpl := loadTrip(t)
	d := tmpl.New()
	var walk func(a, b *html.Node)
	walk = func(a, b *html.Node) {
		if a == b {
			t.Fatalf("node <%s> is shared between the template and a copy", a.Data)
		}
		if len(a.Attr) > 0 && &a.Attr[0] == &b.Attr[0] {
			t.Fatalf("<%s> shares its attribute slice with the template", a.Data)
		}
		ca, cb := a.FirstChild, b.FirstChild
		for ca != nil && cb != nil {
			walk(ca, cb)
			ca, cb = ca.NextSibling, cb.NextSibling
		}
		if ca != nil || cb != nil {
			t.Fatalf("<%s> copy has a different shape", a.Data)
		}
	}
	walk(tmpl.root, d.root)
}

func renderTemplate(t *testing.T, tmpl *Template) string {
	t.Helper()
	var b bytes.Buffer
	if err := html.Render(&b, tmpl.root); err != nil {
		t.Fatal(err)
	}
	return b.String()
}
