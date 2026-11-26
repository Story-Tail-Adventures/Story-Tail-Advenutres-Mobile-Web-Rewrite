package money

import (
	"net/url"
	"slices"
	"testing"
)

// §3.7.2's URL contract, a port of web/lib/agent/commissionFilters.test.ts.
//
// THE INVARIANT THAT MATTERS MOST: anything malformed is DROPPED, never passed on. A uuid
// column handed "abc", or a date column handed "2026-02-31", makes PostgREST answer 400 —
// and on this screen a failed read is the retry state, so one typo in a shared link would
// read as "the ledger is down".

const (
	tripUUID    = "0195a2c0-1a00-7000-8000-000000000040"
	sandalsUUID = "0195a2c0-1a00-7000-8000-000000000030"
)

func params(pairs ...[2]string) url.Values {
	v := url.Values{}
	for _, p := range pairs {
		v.Add(p[0], p[1])
	}
	return v
}

func TestLedgerQueryFrom(t *testing.T) {
	t.Run("opens on every status, no filters, page 1", func(t *testing.T) {
		q := ledgerQueryFrom(url.Values{})
		if len(q.Statuses) != 0 || q.SupplierID != "" || q.TripID != "" || q.TravelFrom != "" || q.TravelTo != "" || q.Page != 1 {
			t.Fatalf("empty query is %+v", q)
		}
	})

	t.Run("keeps known statuses, drops unknown ones, and de-duplicates", func(t *testing.T) {
		q := ledgerQueryFrom(params([2]string{"status", "lost"}, [2]string{"status", "paid"},
			[2]string{"status", "received"}, [2]string{"status", "lost"}))
		if !slices.Equal(q.Statuses, []string{"lost", "received"}) {
			t.Fatalf("statuses are %v", q.Statuses)
		}
		if q := ledgerQueryFrom(params([2]string{"status", "disputed"})); !slices.Equal(q.Statuses, []string{"disputed"}) {
			t.Fatalf("statuses are %v", q.Statuses)
		}
	})

	t.Run("accepts a uuid for supplier and trip, and drops anything that is not one", func(t *testing.T) {
		q := ledgerQueryFrom(params([2]string{"supplier", sandalsUUID}, [2]string{"trip", tripUUID}))
		if q.SupplierID != sandalsUUID || q.TripID != tripUUID {
			t.Fatalf("ids are %q and %q", q.SupplierID, q.TripID)
		}
		bad := ledgerQueryFrom(params([2]string{"supplier", "sandals"}, [2]string{"trip", "40; drop table"}))
		if bad.SupplierID != "" || bad.TripID != "" {
			t.Fatalf("kept %q and %q", bad.SupplierID, bad.TripID)
		}
	})

	t.Run("drops a date that is shaped right but does not exist", func(t *testing.T) {
		for _, c := range []struct{ in, want string }{
			{"2026-02-31", ""},
			{"2026-2-3", ""},
			{"2026-02-28", "2026-02-28"},
		} {
			if got := ledgerQueryFrom(params([2]string{"from", c.in})).TravelFrom; got != c.want {
				t.Errorf("from=%q kept %q, want %q", c.in, got, c.want)
			}
		}
	})

	t.Run("swaps a range typed backwards rather than returning nothing", func(t *testing.T) {
		q := ledgerQueryFrom(params([2]string{"from", "2026-12-31"}, [2]string{"to", "2026-01-01"}))
		if q.TravelFrom != "2026-01-01" || q.TravelTo != "2026-12-31" {
			t.Fatalf("range is %q..%q", q.TravelFrom, q.TravelTo)
		}
	})

	t.Run("refuses year 0000, which Postgres does not have", func(t *testing.T) {
		if got := ledgerQueryFrom(params([2]string{"to", "0000-01-01"})).TravelTo; got != "" {
			t.Fatalf("kept %q", got)
		}
	})

	t.Run("caps the page so the SQL offset cannot overflow an integer", func(t *testing.T) {
		if got := ledgerQueryFrom(params([2]string{"page", "99999999999"})).Page; got != maxLedgerPage {
			t.Fatalf("page is %d", got)
		}
	})

	t.Run("treats a missing, zero or junk page as page 1", func(t *testing.T) {
		for in, want := range map[string]int{"0": 1, "-3": 1, "two": 1, "3": 3} {
			if got := ledgerQueryFrom(params([2]string{"page", in})).Page; got != want {
				t.Errorf("page=%q is %d, want %d", in, got, want)
			}
		}
	})

	t.Run("reads an empty supplier select as 'all suppliers'", func(t *testing.T) {
		// The select's "All suppliers" option submits `supplier=`, which must not filter.
		if got := ledgerQueryFrom(params([2]string{"supplier", ""})).SupplierID; got != "" {
			t.Fatalf("kept %q", got)
		}
	})
}

func TestLedgerHref(t *testing.T) {
	t.Run("is the bare route for the empty query", func(t *testing.T) {
		if got := (ledgerQuery{Page: 1}).href(); got != ledgerPath {
			t.Fatalf("href is %q", got)
		}
	})

	t.Run("round-trips every filter through the URL parser", func(t *testing.T) {
		q := ledgerQuery{
			Statuses:   []string{"received", "disputed"},
			SupplierID: sandalsUUID,
			TripID:     tripUUID,
			TravelFrom: "2026-01-01",
			TravelTo:   "2026-06-30",
			Page:       2,
		}
		u, err := url.Parse(q.href())
		if err != nil {
			t.Fatal(err)
		}
		back := ledgerQueryFrom(u.Query())
		if !slices.Equal(back.Statuses, q.Statuses) || back.SupplierID != q.SupplierID ||
			back.TripID != q.TripID || back.TravelFrom != q.TravelFrom ||
			back.TravelTo != q.TravelTo || back.Page != q.Page {
			t.Fatalf("round trip gave %+v, want %+v", back, q)
		}
	})

	t.Run("exports with the same filters, and every page", func(t *testing.T) {
		got := ledgerQuery{Statuses: []string{"lost"}, Page: 3}.exportHref()
		if got != ledgerExportPath+"?status=lost" {
			t.Fatalf("export href is %q", got)
		}
		if got := (ledgerQuery{Page: 1}).exportHref(); got != ledgerExportPath {
			t.Fatalf("export href is %q", got)
		}
	})

	t.Run("leaves page 1 out of the URL", func(t *testing.T) {
		got := ledgerQuery{TripID: tripUUID, Page: 1}.href()
		if got != ledgerPath+"?trip="+tripUUID {
			t.Fatalf("href is %q", got)
		}
	})
}

func TestIsFiltered(t *testing.T) {
	if (ledgerQuery{Page: 1}).isFiltered() {
		t.Error("the empty query is filtered")
	}
	if (ledgerQuery{Page: 4}).isFiltered() {
		t.Error("paging alone counts as filtered")
	}
	if !(ledgerQuery{Statuses: []string{"lost"}, Page: 1}).isFiltered() {
		t.Error("a status does not count as filtered")
	}
	if !(ledgerQuery{TravelTo: "2026-01-01", Page: 1}).isFiltered() {
		t.Error("a date does not count as filtered")
	}
}

func TestCommissionStatusFilters(t *testing.T) {
	// The prototype's chip row draws four. A Lost line would otherwise be unreachable.
	var values, chips []string
	for _, f := range commissionStatusFilters {
		values = append(values, f.Value)
		chips = append(chips, f.Chip)
	}
	if !slices.Equal(values, []string{"expected", "invoiced", "received", "disputed", "lost"}) {
		t.Fatalf("values are %v", values)
	}
	if !slices.Equal(chips, []string{"inquiry", "proposal", "booked", "due", "past"}) {
		t.Fatalf("chips are %v", chips)
	}
}
