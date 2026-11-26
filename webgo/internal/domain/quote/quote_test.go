package quote

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Ported from supabase/functions/_shared/quote_test.ts, one test per Deno.test.
//
// The failures worth pinning: a retry becoming a second trip, an indicative Google price
// becoming a cost the platform appears to have quoted, and a client-supplied blob reaching
// trip_component.payload unfiltered.

func s(v string) js.Value  { return js.StringValue(v) }
func n(v float64) js.Value { return js.NumberValue(v) }

func base(now time.Time) js.Value {
	return js.ObjectValue(
		"tripId", s(uuid.NewAt(now)),
		"kind", s("hotel"),
		"name", s("Bucuti & Tara Beach Resort"),
		"location", s("Aruba"),
		"checkIn", s("2026-10-19"),
		"checkOut", s("2026-10-26"),
		"travelers", n(2),
	)
}

// with is `{ ...base, key: value, ... }`: an existing key keeps its place, a new one goes last.
func with(b js.Value, kv ...any) js.Value {
	o, _ := b.Object()
	all := make([]any, 0, 2*o.Len()+len(kv))
	for _, k := range o.Keys() {
		all = append(all, k, o.Get(k))
	}
	return js.ObjectValue(append(all, kv...)...)
}

func parse(t *testing.T, payload js.Value, now time.Time) QuoteInput {
	t.Helper()
	q, err := ParseBody(payload, now)
	if err != nil {
		t.Fatalf("ParseBody: %v", err)
	}
	return q
}

// refused is assertThrows: the Deno tests only ask for a throw; the sentence is pinned too.
func refused(t *testing.T, payload js.Value, now time.Time, detail string) {
	t.Helper()
	_, err := ParseBody(payload, now)
	p, ok := problem.As(err)
	if !ok || p.Status != http.StatusBadRequest {
		t.Fatalf("got %v, want a 400", err)
	}
	if p.Detail != detail {
		t.Fatalf("detail %q, want %q", p.Detail, detail)
	}
}

func uuidV4() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	h := hex.EncodeToString(b[:])
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

// Deno.test("trip type defaults from the kind, and the caller may refine it")
func TestTripTypeDefaultsFromKind(t *testing.T) {
	now := time.Now()
	// A live hotel result tells us nothing about board basis, so 'custom' is the honest
	// default. The curated catalog DOES know a Sandals week is all-inclusive, so it may say so.
	if got := parse(t, base(now), now).TripType; got != "custom" {
		t.Fatalf("got %q", got)
	}
	if got := parse(t, with(base(now), "kind", s("cruise")), now).TripType; got != "cruise" {
		t.Fatalf("got %q", got)
	}
	if got := parse(t, with(base(now), "tripType", s("all_inclusive")), now).TripType; got != "all_inclusive" {
		t.Fatalf("got %q", got)
	}
	// Not a real trip_type: falls back rather than reaching the enum and erroring at insert.
	if got := parse(t, with(base(now), "tripType", s("spaceship")), now).TripType; got != "custom" {
		t.Fatalf("got %q", got)
	}
}

// Deno.test("every component kind a public search can produce is accepted")
func TestEveryPublicKindAccepted(t *testing.T) {
	now := time.Now()
	for _, kind := range []string{"hotel", "cruise", "excursion", "custom"} {
		if got := parse(t, with(base(now), "kind", s(kind)), now).Kind; got != kind {
			t.Fatalf("got %q, want %q", got, kind)
		}
	}
	// A curated catalog trip sends its component kind, not the word "trip": the bug a browser
	// caught: the page rendered, the send failed, and the traveler saw only "that didn't send".
	refused(t, with(base(now), "kind", s("trip")), now, "kind must be one of: hotel, cruise, excursion, custom.")
	refused(t, with(base(now), "kind", s("flight")), now, "kind must be one of: hotel, cruise, excursion, custom.")
}

// Deno.test("the title carries the destination, and both are capped")
func TestTitleCarriesDestination(t *testing.T) {
	now := time.Now()
	input := parse(t, base(now), now)
	if input.Title != "Bucuti & Tara Beach Resort \U000000B7 Aruba" {
		t.Fatalf("title %q", input.Title)
	}
	if !reflect.DeepEqual(input.Destinations, []string{"Aruba"}) {
		t.Fatalf("destinations %v", input.Destinations)
	}
	long := parse(t, with(base(now), "name", s(strings.Repeat("x", 400))), now)
	if js.Len(long.Title) > 120 {
		t.Fatalf("title is %d long", js.Len(long.Title))
	}
}

// Deno.test("the trip id must be a recent v7, so a retry is idempotent")
func TestTripIDMustBeRecentV7(t *testing.T) {
	now := time.Now()
	// A client-generated id is what makes "send" twice create one trip rather than two.
	refused(t, with(base(now), "tripId", s("not-a-uuid")), now, "tripId must be a recent UUID v7: Not a UUID v7: not-a-uuid")
	v4 := uuidV4()
	refused(t, with(base(now), "tripId", s(v4)), now, "tripId must be a recent UUID v7: Not a UUID v7: "+v4)
}

// Deno.test("dates are real calendar dates, in order")
func TestDatesRealAndInOrder(t *testing.T) {
	now := time.Now()
	refused(t, with(base(now), "checkIn", s("2026-02-30"), "checkOut", s("2026-03-05")), now, "checkIn must be a real date as YYYY-MM-DD.")
	refused(t, with(base(now), "checkIn", s("2026-10-26"), "checkOut", s("2026-10-19")), now, "checkOut must be after checkIn.")
	// Undated is allowed: "I like this place, when could we go?" is a real inquiry.
	undated := parse(t, with(base(now), "checkIn", js.UndefinedValue(), "checkOut", js.UndefinedValue()), now)
	if undated.CheckIn != nil || undated.CheckOut != nil {
		t.Fatalf("got %v, %v", undated.CheckIn, undated.CheckOut)
	}
}

// Deno.test("a nameless request is refused")
func TestNamelessRefused(t *testing.T) {
	now := time.Now()
	refused(t, with(base(now), "name", s("")), now, "Send the name of what you are asking about.")
	refused(t, with(base(now), "name", n(42)), now, "Send the name of what you are asking about.")
}

func snapshotKeys(o js.Ordered) []string {
	var keys []string
	for _, f := range o {
		keys = append(keys, f.Key)
	}
	return keys
}

// Deno.test("the snapshot is an allow-list, not a passthrough")
func TestSnapshotAllowList(t *testing.T) {
	now := time.Now()
	input := parse(t, with(base(now), "snapshot", js.ObjectValue(
		"propertyType", s("Resort"),
		"indicativeRateCents", n(41200),
		"hotelClass", n(5),
		"rating", n(4.8),
		"amenities", js.ArrayValue(s("Beach access"), s("Spa")),
		"photoUrl", s("https://lh3.googleusercontent.com/x"),
		// None of the below is on the list.
		"source", s("Booking.com"),
		"link", s("https://www.booking.com/hotel/aw/x.html"),
		"nested", js.ObjectValue("evil", js.BoolValue(true)),
		"huge", s(strings.Repeat("y", 10_000)),
	)), now)

	keys := snapshotKeys(input.Snapshot)
	slices.Sort(keys)
	want := []string{"amenities", "capturedAt", "hotelClass", "indicativeRateCents", "photoUrl", "propertyType", "rating"}
	if !reflect.DeepEqual(keys, want) {
		t.Fatalf("keys %v, want %v", keys, want)
	}
	// The same rule as the search boundary: a booking site must not reach our database either.
	b, err := js.Marshal(input.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "Booking") || strings.Contains(string(b), "booking.com") {
		t.Fatalf("snapshot %s", b)
	}
}

// Deno.test("the indicative rate stays in the snapshot and never becomes a cost")
func TestIndicativeRateNeverACost(t *testing.T) {
	now := time.Now()
	// QuoteInput has no cost field at all, so the handler cannot accidentally write one:
	// trip_component.cost_cents keeps its zero default. This asserts the shape that guarantees
	// it, because the money columns roll into trip.total_value_cents and commission forecasts.
	input := parse(t, with(base(now), "snapshot", js.ObjectValue("indicativeRateCents", n(41200))), now)
	var rate js.Value
	for _, f := range input.Snapshot {
		if f.Key == "indicativeRateCents" {
			rate, _ = f.Value.(js.Value)
		}
	}
	if v, ok := rate.Num(); !ok || v != 41200 {
		t.Fatalf("indicativeRateCents %v", rate)
	}
	typ := reflect.TypeFor[QuoteInput]()
	for i := 0; i < typ.NumField(); i++ {
		f := typ.Field(i)
		tag, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		for _, name := range []string{f.Name, tag} {
			if strings.EqualFold(name, "costCents") || name == "cost_cents" {
				t.Fatalf("QuoteInput has a cost field: %s", f.Name)
			}
		}
	}
}

// Deno.test("traveler count is clamped rather than trusted")
func TestTravelersClamped(t *testing.T) {
	now := time.Now()
	for _, c := range []struct {
		in   js.Value
		want int
	}{{n(999), 20}, {n(0), 1}, {s("lots"), 2}} {
		if got := parse(t, with(base(now), "travelers", c.in), now).Travelers; got != c.want {
			t.Fatalf("travelers %v: got %d, want %d", c.in, got, c.want)
		}
	}
}

// Deno.test("provenance is allow-listed, so it cannot be invented")
func TestProvenanceAllowListed(t *testing.T) {
	now := time.Now()
	for _, c := range []struct {
		payload js.Value
		want    string
	}{
		{base(now), "curated"},
		{with(base(now), "source", s("serpapi_google_hotels")), "serpapi_google_hotels"},
		// Anything off the list falls back to 'curated' rather than letting a caller claim a
		// request came from a supplier feed.
		{with(base(now), "source", s("hotelbeds")), "curated"},
		{with(base(now), "source", n(42)), "curated"},
	} {
		if got := parse(t, c.payload, now).APISource; got != c.want {
			t.Fatalf("got %q, want %q", got, c.want)
		}
	}
}
