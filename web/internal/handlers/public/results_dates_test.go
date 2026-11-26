package public

import (
	"regexp"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/handlers/public/search"
)

// The two native date inputs are the whole of the date cell before any JavaScript runs
// (§4.9), so their min and max are the only thing stopping a stay that cannot be booked. The
// check-out input's floor is the night after the check-in, as DateRangePicker.tsx writes it.
//
// This is worth a test of its own because the server is forgiving where the browser is loud:
// ParseStay drops a pair shorter than a night without saying so, which costs the visitor the
// stay they typed AND drops them out of Hotels back into the curated catalog. The browser
// refusing to submit is the only place they are told.
func TestTheCheckOutInputCannotBeOnOrBeforeTheCheckIn(t *testing.T) {
	in, out := soon()
	html := resultsBody(t, "/explore/results?mode=hotels&dest=Aruba&in="+in+"&out="+out)

	night, ok := search.AddDays(in, 1)
	if !ok {
		t.Fatalf("AddDays(%q, 1) failed", in)
	}
	for _, prefix := range []string{"pill", "stacked"} {
		checkIn := attrsOf(t, html, prefix+"-in")
		checkOut := attrsOf(t, html, prefix+"-out")
		if got := attr(checkIn, "min"); got != today() {
			t.Errorf("%s-in min = %q, want today %q", prefix, got, today())
		}
		if got := attr(checkOut, "min"); got != night {
			t.Errorf("%s-out min = %q, want the night after the check-in %q", prefix, got, night)
		}
		if attr(checkIn, "max") == "" || attr(checkOut, "max") != attr(checkIn, "max") {
			t.Errorf("%s: the two inputs should share one booking horizon", prefix)
		}
	}
}

// With no stay typed yet there is nothing to count from, so both inputs floor at today.
func TestAnEmptyDateCellFloorsAtToday(t *testing.T) {
	html := resultsBody(t, "/explore/results?dest=Aruba")
	for _, slot := range []string{"pill-in", "pill-out", "stacked-in", "stacked-out"} {
		if got := attr(attrsOf(t, html, slot), "min"); got != today() {
			t.Errorf("%s min = %q, want today %q", slot, got, today())
		}
	}
}

// today is the date the page was built against, read the way the handler reads it.
func today() string { return (&site{}).today() }

// attrsOf returns the tag carrying this slot.
func attrsOf(t *testing.T, html, slot string) string {
	t.Helper()
	re := regexp.MustCompile(`<[^<>]*data-slot="` + regexp.QuoteMeta(slot) + `"[^<>]*>`)
	tag := re.FindString(html)
	if tag == "" {
		t.Fatalf("no element carries data-slot=%q", slot)
	}
	return tag
}

// attr reads one attribute out of a tag.
func attr(tag, name string) string {
	_, rest, ok := strings.Cut(tag, name+`="`)
	if !ok {
		return ""
	}
	value, _, _ := strings.Cut(rest, `"`)
	return value
}
