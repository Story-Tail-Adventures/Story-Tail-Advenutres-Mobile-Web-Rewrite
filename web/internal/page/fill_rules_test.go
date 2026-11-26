package page

import (
	"strings"
	"testing"
	"testing/fstest"
)

// One page with a slot of each kind the fill rules treat differently.
const rulesHTML = `<!DOCTYPE html><html><head><title>t</title></head><body><main>
<a data-slot="pay" href="https://placeholder.example/sample">Pay the supplier</a>
<p data-slot="note">Sample note</p>
<input data-slot="count" type="number" value="2">
<img data-slot="photo" src="/sample.jpg" alt="Sample">
<form data-slot="form" action="/sample"><button data-slot="go" formaction="/sample-go">Go</button></form>
<a data-slot="outer" href="#outer"><span data-slot="inner">Inner sample</span></a>
<textarea data-slot="box">sample</textarea>
</main></body></html>`

var rulesSpec = Spec{
	File:  "rules.html",
	Slots: []string{"pay", "note", "count", "photo", "form", "go", "outer", "inner", "box"},
}

func rulesDoc(t *testing.T) *Doc {
	t.Helper()
	set, err := Load(fstest.MapFS{"rules.html": {Data: []byte(rulesHTML)}}, rulesSpec)
	if err != nil {
		t.Fatal(err)
	}
	tmpl, err := set.Template("rules.html")
	if err != nil {
		t.Fatal(err)
	}
	return tmpl.New()
}

// fillAllBut handles every slot except the ones named, the way a correct handler would.
func fillAllBut(d *Doc, skip ...string) {
	do := map[string]func(){
		"pay":   func() { d.PayURL("pay", "https://pay.example.com/1") },
		"note":  func() { d.Text("note", "A real note") },
		"count": func() { d.Attr("count", "value", "4") },
		"photo": func() { d.URL("photo", "src", "https://images.example.com/a.jpg") },
		"form":  func() { d.URL("form", "action", "/trips/1/notes") },
		"go":    func() { d.URL("go", "formaction", "/trips/1/go") },
		"outer": func() { d.URL("outer", "href", "/trips/1") },
		"inner": func() { d.Text("inner", "Trip one") },
		"box":   func() { d.Text("box", "typed") },
	}
	for name, f := range do {
		if !strings.Contains(" "+strings.Join(skip, " ")+" ", " "+name+" ") {
			f()
		}
	}
}

func TestCompleteFillRenders(t *testing.T) {
	d := rulesDoc(t)
	fillAllBut(d)
	b, err := d.Bytes()
	if err != nil {
		t.Fatal(err)
	}
	for _, gone := range []string{"placeholder.example", "sample", "Sample note", "Inner sample", "#outer"} {
		if strings.Contains(string(b), gone) {
			t.Errorf("%q shipped:\n%s", gone, b)
		}
	}
}

// The review's hard fail: one setter used to mark a whole slot handled, so Text alone on a
// pay link shipped the sample href. Every partial fill below must stop the render.
func TestPartialFillsDoNotCount(t *testing.T) {
	cases := []struct {
		name, slot string
		do         func(d *Doc)
		want       string
	}{
		{"Text alone on a link keeps the sample href", "pay", func(d *Doc) { d.Text("pay", "Pay now") }, `slot "pay" still has its placeholder href`},
		{"Class alone", "pay", func(d *Doc) { d.Class("pay", "primary", true) }, `slot "pay" was never filled`},
		{"Bool alone", "note", func(d *Doc) { d.Bool("note", "hidden", true) }, `slot "note" was never filled`},
		{"Attr alone on a non-void element", "note", func(d *Doc) { d.Attr("note", "aria-label", "x") }, `slot "note" was never filled`},
		{"Text alone on an img is refused", "photo", func(d *Doc) { d.Text("photo", "x") }, "cannot hold text"},
		{"Attr alone on an img keeps the sample src", "photo", func(d *Doc) { d.Attr("photo", "alt", "A photo") }, `slot "photo" still has its placeholder src`},
		{"a form whose action was never set", "form", func(d *Doc) { d.Attr("form", "data-x", "1") }, `slot "form" still has its placeholder action`},
	}
	for _, c := range cases {
		d := rulesDoc(t)
		fillAllBut(d, c.slot)
		c.do(d)
		_, err := d.Bytes()
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, want mention of %q", c.name, err, c.want)
		}
	}
}

func TestFullFillsCount(t *testing.T) {
	cases := map[string]func(d *Doc){
		// Static link text is copy; the href is the only placeholder.
		"PayURL alone on a link": func(d *Doc) { d.PayURL("pay", "https://pay.example.com/1") },
		"a refused PayURL still handles it": func(d *Doc) {
			if d.PayURL("pay", "http://pay.example.com/1") {
				t.Error("http accepted")
			}
		},
		"Keep, deliberately as written": func(d *Doc) { d.Keep("pay") },
		"Remove":                        func(d *Doc) { d.Remove("pay") },
	}
	for name, do := range cases {
		d := rulesDoc(t)
		fillAllBut(d, "pay")
		do(d)
		if _, err := d.Bytes(); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}

	d := rulesDoc(t)
	fillAllBut(d, "count")
	d.Attr("count", "value", "7") // void element: attributes are its content
	if _, err := d.Bytes(); err != nil {
		t.Errorf("Attr on a void element: %v", err)
	}
}

func TestURLChecksTheTag(t *testing.T) {
	cases := map[string]func(d *Doc){
		"href on a <p>":              func(d *Doc) { d.URL("note", "href", "/x") },
		"src on an <a>":              func(d *Doc) { d.URL("pay", "src", "/x") },
		"action on a <button>":       func(d *Doc) { d.URL("go", "action", "/x") },
		"formaction on a <form>":     func(d *Doc) { d.URL("form", "formaction", "/x") },
		"PayURL on an <img>":         func(d *Doc) { d.PayURL("photo", "https://pay.example.com/1") },
		"PayURL on a <textarea>":     func(d *Doc) { d.PayURL("box", "https://pay.example.com/1") },
		"URL on a non-URL attribute": func(d *Doc) { d.URL("pay", "style", "/x") },
	}
	for name, mistake := range cases {
		d := rulesDoc(t)
		fillAllBut(d)
		mistake(d)
		if b, err := d.Bytes(); err == nil {
			t.Errorf("%s: rendered anyway:\n%s", name, b)
		}
	}
}

// Text on a slot that holds another slot would drop the inner one, and a later fill of the
// inner slot would vanish silently.
func TestTextRefusesASlotHoldingSlots(t *testing.T) {
	d := rulesDoc(t)
	fillAllBut(d, "outer", "inner")
	d.URL("outer", "href", "/trips/1")
	d.Text("outer", "flattened")
	_, err := d.Bytes()
	if err == nil || !strings.Contains(err.Error(), `slot "outer" holds slot "inner"`) {
		t.Errorf("err = %v", err)
	}

	d = rulesDoc(t)
	fillAllBut(d, "inner")
	d.Remove("outer") // removing the outer handles the inner
	if _, err := d.Bytes(); err != nil {
		t.Errorf("Remove(outer) did not handle inner: %v", err)
	}
}
