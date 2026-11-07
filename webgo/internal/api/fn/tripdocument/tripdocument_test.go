package tripdocument

import (
	"math"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

var now = time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)

func body(t *testing.T, s string) js.Value {
	t.Helper()
	v, err := js.ParseObject([]byte(s))
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return v
}

func wantDetail(t *testing.T, err error, status int, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != status || p.Detail != detail {
		t.Errorf("got %v, want %d %q", err, status, detail)
	}
}

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(nil, httptest.NewRequest("GET", "/functions/v1/trip-document", nil))
	wantDetail(t, err, 400, "Use POST.")
}

const sizeSentence = "sizeBytes must be a positive integer up to 52428800."

func TestParseRefusals(t *testing.T) {
	id := uuid.NewAt(now)
	base := `"documentId":"` + id + `","tripId":"t","kind":"passport","filename":"scan.pdf","mimeType":"application/pdf"`
	with := func(rest string) string { return "{" + base + rest + "}" }
	for _, c := range []struct{ name, in, detail string }{
		{"no id", `{}`, "Send a documentId."},
		{"id number", `{"documentId":1}`, "Send a documentId."},
		{"not v7", `{"documentId":"x"}`, "documentId must be a recent UUID v7: Not a UUID v7: x"},
		{"old", `{"documentId":"` + uuid.NewAt(now.Add(-2*time.Hour)) + `"}`,
			"documentId must be a recent UUID v7: UUID v7 timestamp is more than 3600000ms old"},
		{"no trip", `{"documentId":"` + id + `"}`, "Send a tripId."},
		{"trip null", `{"documentId":"` + id + `","tripId":null}`, "Send a tripId."},
		{"kind missing", `{"documentId":"` + id + `","tripId":"t"}`, "kind must be one of: passport, visa, insurance_cert, photo."},
		{"agency kind", `{"documentId":"` + id + `","tripId":"t","kind":"supplier_confirmation"}`,
			"kind must be one of: passport, visa, insurance_cert, photo."},
		{"kind case", `{"documentId":"` + id + `","tripId":"t","kind":"Passport"}`,
			"kind must be one of: passport, visa, insurance_cert, photo."},
		{"no filename", `{"documentId":"` + id + `","tripId":"t","kind":"visa"}`, "Send a filename under 255 characters."},
		{"blank filename", `{"documentId":"` + id + `","tripId":"t","kind":"visa","filename":"   "}`, "Send a filename under 255 characters."},
		{"long filename", `{"documentId":"` + id + `","tripId":"t","kind":"visa","filename":"` + strings.Repeat("\U0001F600", 128) + `"}`,
			"Send a filename under 255 characters."},
		{"no mime", `{"documentId":"` + id + `","tripId":"t","kind":"photo","filename":"a"}`,
			"mimeType must be one of: application/pdf, image/jpeg, image/png, image/heic, image/webp."},
		{"gif", `{"documentId":"` + id + `","tripId":"t","kind":"photo","filename":"a","mimeType":"image/gif"}`,
			"mimeType must be one of: application/pdf, image/jpeg, image/png, image/heic, image/webp."},
		{"no size", with(``), sizeSentence},
		{"null size", with(`,"sizeBytes":null`), sizeSentence},
		{"zero", with(`,"sizeBytes":"0"`), sizeSentence},
		{"negative", with(`,"sizeBytes":-5`), sizeSentence},
		{"minus zero", with(`,"sizeBytes":"-0"`), sizeSentence},
		{"too big", with(`,"sizeBytes":52428801`), sizeSentence},
		{"words", with(`,"sizeBytes":"abc"`), sizeSentence},
		{"bool", with(`,"sizeBytes":true`), sizeSentence},
		{"object", with(`,"sizeBytes":{}`), sizeSentence},
		{"empty array", with(`,"sizeBytes":[]`), sizeSentence},
		{"hex", with(`,"sizeBytes":"0x10"`), sizeSentence},
		{"huge digits", with(`,"sizeBytes":"` + strings.Repeat("9", 400) + `"`), sizeSentence},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := parse(body(t, c.in), now)
			wantDetail(t, err, 400, c.detail)
		})
	}
}

func TestParseSizeLikeParseInt(t *testing.T) {
	id := uuid.NewAt(now)
	base := `"documentId":"` + id + `","tripId":"t","kind":"photo","filename":" a.jpg ","mimeType":"image/jpeg"`
	for in, want := range map[string]int64{
		`2048`:          2048,
		`"2048"`:        2048,
		`" 4096"`:       4096,
		`"12abc"`:       12,
		`1.9`:           1,
		`1e21`:          1, // String(1e21) is "1e+21"
		`[2048]`:        2048,
		`[[7],8]`:       7,
		`"+3"`:          3,
		`52428800`:      52428800,
		`"0052428800x"`: 52428800,
	} {
		got, err := parse(body(t, "{"+base+`,"sizeBytes":`+in+"}"), now)
		if err != nil || got.SizeBytes != want {
			t.Errorf("sizeBytes %s: %d, %v; want %d", in, got.SizeBytes, err, want)
		}
		if got.Filename != "a.jpg" || got.Kind != "photo" || got.MimeType != "image/jpeg" || got.TripID != "t" || got.DocumentID != id {
			t.Errorf("parsed %+v", got)
		}
	}
}

func TestJSString(t *testing.T) {
	for in, want := range map[string]string{
		`[1,null,"a",[2,[3]],true]`: "1,,a,2,3,true",
		`{"a":1}`:                   "[object Object]",
		`0.000001`:                  "0.000001",
		`1e-7`:                      "1e-7",
		`-0`:                        "0",
	} {
		v, _ := js.Parse([]byte(in))
		if got := jsString(v); got != want {
			t.Errorf("String(%s) = %q, want %q", in, got, want)
		}
	}
	if !math.IsNaN(parseInt10("  ")) || !math.IsNaN(parseInt10("-")) || parseInt10("\t\n 42") != 42 {
		t.Error("parseInt10")
	}
}
