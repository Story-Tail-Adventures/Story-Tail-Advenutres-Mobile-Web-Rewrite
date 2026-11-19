package money

import (
	"encoding/json"
	"testing"
)

// §3.7.2's view model, a port of the ledger half of web/lib/agent/commission.test.ts.
//
//  4. AN ARCHIVED TRIP'S LINE STAYS, but its title is not a link into a page that will not open.
//  5. `total_count` IS READ OFF A ROW and survives an empty page.

const ledgerRowJSON = `{
  "commission_id": "01a0b1c2-d300-7000-8000-000000000077",
  "trip_id": "0195a2c0-1a00-7000-8000-000000000302",
  "trip_title": "Getaway #2",
  "trip_archived": false,
  "client_id": "c1",
  "client_display_name": "Noah Castillo",
  "supplier_id": "0195a2c0-1a00-7000-8000-000000000030",
  "supplier_name": "Sandals Resorts",
  "start_date": "2026-06-29",
  "end_date": "2026-07-06",
  "gross_booking_cents": "270000",
  "commission_pct": 12,
  "expected_commission_cents": "32400",
  "processing_fee_cents": "0",
  "received_commission_cents": "32400",
  "currency": "USD",
  "status": "received",
  "received_at": "2026-09-04",
  "inteletravel_reference": "ITV-2026-1188",
  "as_of_date": "2026-10-11",
  "total_count": 19
}`

func line(t *testing.T, overrides map[string]any) ledgerRowData {
	t.Helper()
	var raw map[string]any
	if err := json.Unmarshal([]byte(ledgerRowJSON), &raw); err != nil {
		t.Fatal(err)
	}
	for k, v := range overrides {
		raw[k] = v
	}
	b, err := json.Marshal(raw)
	if err != nil {
		t.Fatal(err)
	}
	var row ledgerRowData
	if err := json.Unmarshal(b, &row); err != nil {
		t.Fatal(err)
	}
	return row
}

func TestToLedgerRow(t *testing.T) {
	t.Run("formats a line", func(t *testing.T) {
		got := toLedgerRow(line(t, nil))
		want := ledgerRow{
			CommissionID:    "01a0b1c2-d300-7000-8000-000000000077",
			LineHref:        "/agent/commission/ledger/01a0b1c2-d300-7000-8000-000000000077",
			TripTitle:       "Getaway #2",
			TripHref:        "/agent/trips/0195a2c0-1a00-7000-8000-000000000302",
			TripArchived:    false,
			ClientName:      "Noah Castillo",
			SupplierName:    "Sandals Resorts",
			TravelLabel:     "Jun 29, 2026",
			GrossLabel:      "$2,700",
			RateLabel:       "12%",
			CommissionLabel: "$324",
			Status:          "received",
			StatusChip:      "booked",
			StatusLabel:     "Received",
		}
		if got != want {
			t.Fatalf("row is %+v,\nwant %+v", got, want)
		}
	})

	t.Run("keeps an archived trip's line but does not link it", func(t *testing.T) {
		got := toLedgerRow(line(t, map[string]any{"trip_archived": true}))
		if got.TripHref != "" || !got.TripArchived {
			t.Fatalf("archived row is %+v", got)
		}
	})

	t.Run("shows an unknown status as itself on a colourless chip", func(t *testing.T) {
		got := toLedgerRow(line(t, map[string]any{"status": "written_off"}))
		if got.StatusLabel != "written_off" || got.StatusChip != "unknown" {
			t.Fatalf("chip is %q / %q", got.StatusChip, got.StatusLabel)
		}
	})

	t.Run("draws an undated trip as undated rather than as the epoch", func(t *testing.T) {
		if got := toLedgerRow(line(t, map[string]any{"start_date": nil})).TravelLabel; got != "" {
			t.Fatalf("travel label is %q", got)
		}
	})
}

func TestCeilDiv(t *testing.T) {
	for _, c := range []struct{ total, want int }{{0, 0}, {1, 1}, {25, 1}, {26, 2}, {19, 1}, {50, 2}, {51, 3}} {
		if got := ceilDiv(c.total, ledgerPageSize); got != c.want {
			t.Errorf("%d lines fill %d pages, want %d", c.total, got, c.want)
		}
	}
}
