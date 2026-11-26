// Package demo is a throwaway, development-only page that proves internal/page end to end:
// a layout, slots, a repeat with an unsafe link, an empty state, a pay link, and hostile
// values that must arrive as text. It is mounted only when STA_ENV=development, and it is
// deleted in Phase 2 when the first real page exists.
package demo

import (
	"log/slog"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Layout is the shared frame (pages/layout/base.html). It carries no slots yet.
var Layout = &page.Layout{File: "layout/base.html"}

// Spec declares everything the demo handler fills.
var Spec = page.Spec{
	File:    "demo/index.html",
	Layout:  Layout,
	Slots:   []string{"trip-title", "traveler", "no-stops", "pay-link", "notes"},
	Repeats: map[string][]string{"stops": {"stop-link", "stop-name"}},
}

type stop struct{ name, link string }

// Sample data, including values a real page must survive.
var (
	tripTitle = "Aruba in April"
	traveler  = `<script>alert("this must show as text")</script>`
	notes     = `</textarea><b>this must stay inside the box</b>`
	payLink   = "https://pay.example.com/milestone/123"
	stops     = []stop{
		{"Eagle Beach", "/trips/aruba/stops/eagle-beach"},
		{"A link that must be dropped", "javascript:alert(1)"},
		{"Oranjestad", "/trips/aruba/stops/oranjestad"},
	}
)

// Handler returns the demo page handler. It is built at startup, so a missing page fails
// the boot, not a request.
func Handler(set *page.Set, log *slog.Logger) (http.Handler, error) {
	tmpl, err := set.Template(Spec.File)
	if err != nil {
		return nil, err
	}
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		d := tmpl.New()
		d.Text("trip-title", tripTitle)
		d.Text("traveler", traveler)
		d.Repeat("stops", len(stops), func(i int, r *page.Row) {
			r.Text("stop-name", stops[i].name)
			if !r.URL("stop-link", "href", stops[i].link) {
				r.Attr("stop-link", "aria-disabled", "true")
			}
		})
		if len(stops) > 0 {
			d.Remove("no-stops")
		} else {
			d.Keep("no-stops")
		}
		d.PayURL("pay-link", payLink)
		d.Text("notes", notes)

		body, err := d.Bytes()
		if err != nil {
			log.Error("demo page did not render", "err", err)
			http.Error(w, "Something went wrong.", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(body)
	}), nil
}
