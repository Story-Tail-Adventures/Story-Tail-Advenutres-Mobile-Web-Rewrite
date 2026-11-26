package cruisesearch

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from _shared/cruise/public_test.ts (3 Deno tests), then parseBody's cases.

// fakeDB answers the two reads searchSailings makes: the rpc, then the port calls.
type fakeDB struct {
	calls []portCall
	args  searchArgs
}

func (f *fakeDB) sailings(_ context.Context, a searchArgs) ([]sailingRow, error) {
	f.args = a
	nights := int64(7)
	line := "Royal Caribbean"
	title := "7 Night Western Caribbean"
	return []sailingRow{{
		ID: "s1", Title: &title, DepartureDate: "2027-01-10", DurationNights: &nights,
		Destinations: []*string{ptr("Caribbean")}, CruiseLine: &lineRow{Name: &line},
	}}, nil
}

func (f *fakeDB) portCalls(context.Context, []string) ([]portCall, error) { return f.calls, nil }

func ptr(s string) *string { return &s }

func call(name string, seq int64) portCall {
	return portCall{SailingID: "s1", PortName: ptr(name), Sequence: seq}
}

// "sea days are not ports of call"
func TestSeaDaysAreNotPortsOfCall(t *testing.T) {
	db := &fakeDB{calls: []portCall{
		call("Fort Lauderdale", 1), call("At Sea", 2), call("Perfect Day CocoCay", 3), call("Fun Day At Sea", 4),
		call("Cruising", 5), call("Cozumel, Mexico", 6), call("At Sea", 7), call("Fort Lauderdale", 8),
	}}
	got, err := searchSailings(context.Background(), db, query{Limit: 24})
	if err != nil {
		t.Fatal(err)
	}
	// The round trip's home port stays at both ends.
	want := []string{"Fort Lauderdale", "Perfect Day CocoCay", "Cozumel, Mexico", "Fort Lauderdale"}
	if !reflect.DeepEqual(got[0].Ports, want) {
		t.Errorf("ports = %v", got[0].Ports)
	}
}

// "a sea day between two calls at one port still collapses to one"
func TestSeaDayBetweenTwoCallsCollapses(t *testing.T) {
	db := &fakeDB{calls: []portCall{call("Nassau, Bahamas", 1), call("At Sea", 2), call("Nassau, Bahamas", 3)}}
	got, _ := searchSailings(context.Background(), db, query{Limit: 24})
	if !reflect.DeepEqual(got[0].Ports, []string{"Nassau, Bahamas"}) {
		t.Errorf("ports = %v", got[0].Ports)
	}
}

// "only exact sea-day names are dropped, never a port that merely contains the words"
func TestOnlyExactSeaDayNames(t *testing.T) {
	for _, name := range []string{"At Sea", "at sea", " Fun Day At Sea ", "CRUISING", "Day at  Sea", "Sea Day"} {
		if !isSeaDay(name) {
			t.Errorf("%q should be a sea day", name)
		}
	}
	for _, name := range []string{"Perfect Day CocoCay", "Perfect Day at CocoCay", "Seattle, Washington",
		"Hubbard Glacier", "Inside Passage", "Scenic Cruising Tracy Arm"} {
		if isSeaDay(name) {
			t.Errorf("%q is a port", name)
		}
	}
}

func parse(t *testing.T, body string) (query, error) {
	t.Helper()
	v, err := js.Parse([]byte(body))
	if err != nil {
		v = js.NullValue() // req.json().catch(() => null)
	}
	return parseBody(v)
}

func TestParseBody(t *testing.T) {
	q, err := parse(t, `{"destination":"  Bahamas\u0007 \t cruise ","from":"2027-01-01","to":"2027-02-01","minNights":3.5,"maxNights":61,"limit":0}`)
	if err != nil {
		t.Fatal(err)
	}
	if q.Destination == nil || *q.Destination != "Bahamas cruise" || q.From != "2027-01-01" || q.To != "2027-02-01" {
		t.Errorf("q = %+v", q)
	}
	if q.MinNights == nil || *q.MinNights != 4 || q.MaxNights != nil || q.Limit != 24 {
		t.Errorf("counts = %v %v %d (Math.round(3.5) is 4; 61 is out of range; limit 0 defaults)", q.MinNights, q.MaxNights, q.Limit)
	}
	for _, body := range []string{`not json`, `null`, `"text"`, `[1]`, `{}`} {
		q, err := parse(t, body)
		if err != nil || q.Limit != 24 || q.Destination != nil || q.From != "" {
			t.Errorf("%s: %+v %v", body, q, err)
		}
	}
	// Impossible and pre-1900 dates are dropped, not refused (Date.UTC maps years 0-99 to 19xx).
	for _, d := range []string{"2027-02-30", "2027-13-01", "0099-01-01", "2027-1-01", "tomorrow"} {
		if q, _ := parse(t, `{"from":"`+d+`"}`); q.From != "" {
			t.Errorf("from %s kept", d)
		}
	}
	_, err = parse(t, `{"from":"2027-02-01","to":"2027-01-01"}`)
	if p, ok := problem.As(err); !ok || p.Status != 400 || p.Detail != "`to` must not be before `from`." {
		t.Errorf("to before from: %v", err)
	}
	long := strings.Repeat("a", 70)
	if q, _ := parse(t, `{"destination":"`+long+`"}`); q.Destination == nil || len(*q.Destination) != 60 {
		t.Errorf("destination not cut to 60")
	}
	if q, _ := parse(t, `{"destination":" \u0001 "}`); q.Destination != nil {
		t.Errorf("blank destination kept: %v", *q.Destination)
	}
}

// What reaches the rpc: undefined arguments are left out, so Postgres uses its defaults.
func TestRPCArgumentsLeaveOutWhatWasNotAsked(t *testing.T) {
	db := &fakeDB{}
	_, _ = searchSailings(context.Background(), db, query{Limit: 5})
	b, _ := js.Marshal(db.args.object())
	if string(b) != `{"max_rows":5}` {
		t.Errorf("args = %s", b)
	}
}

// The ship photo is dropped when its credit is missing, never served bare.
func TestShipImageNeedsItsCredit(t *testing.T) {
	if mapShipImage(&shipRow{ImageURL: ptr("https://x/a.jpg")}) != nil {
		t.Error("photo served without credit")
	}
	img := mapShipImage(&shipRow{ImageURL: ptr(" https://x/a.jpg "), ImageCredit: ptr("A / Commons, CC BY-SA 4.0"), ImageLicense: ptr(" ")})
	if img == nil || img.URL != "https://x/a.jpg" || img.License != nil || img.SourceURL != nil {
		t.Errorf("img = %+v", img)
	}
}
