package quoterequest

import (
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
	"unicode/utf16"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/quote"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

var now = time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)

const emoji = "\U0001F600"

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(nil, httptest.NewRequest("GET", "/functions/v1/quote-request", nil))
	p, ok := problem.As(err)
	if !ok || p.Status != 400 || p.Detail != "Use POST." {
		t.Errorf("%v", err)
	}
}

func parsed(t *testing.T, kv ...any) (js.Value, quote.QuoteInput) {
	t.Helper()
	o := js.O("tripId", uuid.NewAt(now), "kind", "hotel")
	for i := 0; i+1 < len(kv); i += 2 {
		o = o.Set(kv[i].(string), kv[i+1])
	}
	b, _ := js.Marshal(o)
	v, err := js.ParseObject(b)
	if err != nil {
		t.Fatal(err)
	}
	in, err := quote.ParseBody(v, now)
	if err != nil {
		t.Fatal(err)
	}
	return v, in
}

func raw(v any) string {
	switch t := v.(type) {
	case json.RawMessage:
		return string(t)
	default:
		b, _ := js.Marshal(t)
		return string(b)
	}
}

// With no emoji across a cut, every value is the domain's own.
func TestCutsLeaveWholeTextAlone(t *testing.T) {
	v, in := parsed(t, "name", "  Bucuti &\n Tara ", "location", "Aruba", "note", strings.Repeat(emoji, 1000),
		"apiReference", "ref", "snapshot", js.O("photoUrl", "https://x/y.jpg", "amenities", []string{emoji, "pool"}, "rating", 4.5))
	c := denoCuts(v, in)
	if !reflect.DeepEqual(c.title, in.Title) || !reflect.DeepEqual(c.displayName, in.DisplayName) ||
		!reflect.DeepEqual(c.location, in.Location) || !reflect.DeepEqual(c.destinations, in.Destinations) ||
		!reflect.DeepEqual(c.notes, in.Note) || !reflect.DeepEqual(c.apiReference, in.APIReference) ||
		!reflect.DeepEqual(c.snapshot, in.Snapshot) {
		t.Errorf("cuts changed whole text: %+v", c)
	}
}

// Where the TypeScript's .slice() stranded half an emoji, the write carries the same lone
// surrogate JSON.stringify sent.
func TestCutsKeepTheLoneHalf(t *testing.T) {
	name := strings.Repeat("a", 119) + emoji
	v, in := parsed(t, "name", name, "location", strings.Repeat("b", 119)+emoji+"c")
	c := denoCuts(v, in)
	wantName := `"` + strings.Repeat("a", 119) + `\ud83d"`
	if raw(c.displayName) != wantName || raw(c.title) != wantName {
		t.Errorf("name %s, title %s", raw(c.displayName), raw(c.title))
	}
	wantLoc := `"` + strings.Repeat("b", 119) + `\ud83d"`
	if raw(c.location) != wantLoc || raw(c.destinations) != "["+wantLoc+"]" {
		t.Errorf("location %s, destinations %s", raw(c.location), raw(c.destinations))
	}

	// The title alone: a short name, and " \U000000B7 " plus a location cut through an emoji at 120.
	v, in = parsed(t, "name", "Sea", "location", strings.Repeat("b", 113)+emoji)
	c = denoCuts(v, in)
	if raw(c.title) != `"Sea `+"\U000000B7"+` `+strings.Repeat("b", 113)+`\ud83d"` {
		t.Errorf("title %s", raw(c.title))
	}
	if raw(c.location) != raw(in.Location) || raw(c.displayName) != raw(in.DisplayName) {
		t.Errorf("location %s or name %s changed", raw(c.location), raw(c.displayName))
	}

	v, in = parsed(t, "name", "x", "note", strings.Repeat("n", 1999)+emoji, "apiReference", strings.Repeat("r", 219)+emoji,
		"snapshot", js.O("propertyToken", strings.Repeat("p", 299)+emoji, "amenities", []any{1, strings.Repeat("m", 59) + emoji, "wifi"}))
	c = denoCuts(v, in)
	if raw(c.notes) != `"`+strings.Repeat("n", 1999)+`\ud83d"` || raw(c.apiReference) != `"`+strings.Repeat("r", 219)+`\ud83d"` {
		t.Errorf("note or reference: %s %s", raw(c.notes), raw(c.apiReference))
	}
	snap := raw(c.snapshot)
	if !strings.Contains(snap, `"propertyToken":"`+strings.Repeat("p", 299)+`\ud83d"`) ||
		!strings.Contains(snap, `"amenities":["`+strings.Repeat("m", 59)+`\ud83d","wifi"]`) ||
		!strings.HasSuffix(snap, `"capturedAt":"2026-11-06T12:00:00.000Z"}`) {
		t.Errorf("snapshot %s", snap)
	}
	if !strings.Contains(raw(in.Snapshot), "\U0000FFFD") {
		t.Error("the domain's own snapshot was changed")
	}
}

func TestJSONUnits(t *testing.T) {
	for in, want := range map[string]string{
		"plain":                  `"plain"`,
		"say \"hi\"\n<&>":        `"say \"hi\"\n<&>"`,
		emoji + "\U00002028\x7f": `"` + emoji + "\U00002028\x7f" + `"`,
	} {
		if got := string(jsonUnits(utf16Of(in))); got != want {
			t.Errorf("%q: %s, want %s", in, got, want)
		}
	}
	if got := string(jsonUnits([]uint16{'a', 0xdc00, 'b'})); got != `"a\udc00b"` {
		t.Errorf("lone low half: %s", got)
	}
}

func utf16Of(s string) []uint16 { return utf16.Encode([]rune(s)) }
