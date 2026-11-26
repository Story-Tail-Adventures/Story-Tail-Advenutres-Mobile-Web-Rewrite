package trips

import (
	"slices"
	"testing"
)

// Ported from web/lib/agent/queries.test.ts, "pipeline column totals".

func TestPipelineColumns(t *testing.T) {
	col := func(b pipelineBoard, status string) pipelineColumn {
		for _, c := range b.columns {
			if c.status == status {
				return c
			}
		}
		t.Fatalf("no %s column", status)
		return pipelineColumn{}
	}

	// Sums every card in the column.
	b := buildPipeline([]boardRow{
		{TripID: "a", Status: "proposal", TotalValueCents: 1000000},
		{TripID: "b", Status: "proposal", TotalValueCents: 4000000},
	})
	if p := col(b, "proposal"); p.totalLabel != "$50,000" || p.count != 2 || len(p.cards) != 2 {
		t.Errorf("proposal = %+v", p)
	}
	if i := col(b, "inquiry"); i.totalLabel != "$0" || i.count != 0 {
		t.Errorf("an empty column = %+v", i)
	}

	// The five stages in order, each with its own card and total.
	var trips []boardRow
	for _, st := range pipelineStages {
		trips = append(trips, boardRow{TripID: "t-" + st.status, Status: st.status, TotalValueCents: 100000, Version: 3})
	}
	b = buildPipeline(trips)
	var order, totals []string
	for _, c := range b.columns {
		order = append(order, c.status)
		totals = append(totals, c.totalLabel)
		if len(c.cards) != 1 || c.cards[0].version != 3 || c.cards[0].valueLabel != "$1,000" {
			t.Errorf("%s cards = %+v", c.status, c.cards)
		}
	}
	if !slices.Equal(order, []string{"inquiry", "proposal", "booked", "in_progress", "completed"}) {
		t.Errorf("order = %v", order)
	}
	if !slices.Equal(totals, []string{"$1,000", "$1,000", "$1,000", "$1,000", "$1,000"}) {
		t.Errorf("totals = %v", totals)
	}

	// Cancelled is counted beneath, never columned.
	b = buildPipeline([]boardRow{{TripID: "live", Status: "booked"}, {TripID: "gone", Status: "cancelled"}})
	var ids []string
	for _, c := range b.columns {
		for _, card := range c.cards {
			ids = append(ids, card.tripID)
		}
	}
	if b.cancelled != 1 || !slices.Equal(ids, []string{"live"}) {
		t.Errorf("cancelled = %d, cards = %v", b.cancelled, ids)
	}
}

func TestPipelineStageAndNote(t *testing.T) {
	for in, want := range map[string]string{"booked": "booked", "": "inquiry", "cancelled": "inquiry", "<b>": "inquiry"} {
		if got := selectedStage(in); got != want {
			t.Errorf("selectedStage(%q) = %q", in, got)
		}
	}
	if cancelledNote(1) != "1 cancelled trip is not on the board. Cancelled is a status, not a stage." ||
		cancelledNote(3) != "3 cancelled trips are not on the board. Cancelled is a status, not a stage." {
		t.Error(cancelledNote(1), cancelledNote(3))
	}
	// The column chip's tone comes from the one mapper; the word stays the stage's.
	for status, want := range map[string]string{"inquiry": "inquiry", "proposal": "proposal", "booked": "booked", "in_progress": "traveling", "completed": "past"} {
		if chip, _ := statusPresentation(status, "", ""); chip != want {
			t.Errorf("%s tone = %s", status, chip)
		}
	}
}
