package content

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestTopicsKeepKeyOrderThroughJSON(t *testing.T) {
	// Reverse alphabetical on purpose: a map would come back sorted.
	in := `{"honeymoons":{"order":6,"tagline":"Nassau"},"cruises":{"order":2},"caribbean":{"order":3,"badge":"Gyasi's pick"}}`
	var got Topics
	if err := json.Unmarshal([]byte(in), &got); err != nil {
		t.Fatal(err)
	}
	want := []Topic{Honeymoons, Cruises, Caribbean}
	if len(got) != len(want) {
		t.Fatalf("decoded %d entries, want %d", len(got), len(want))
	}
	for i, e := range got {
		if e.Topic != want[i] {
			t.Errorf("entry %d is %s, want %s", i, e.Topic, want[i])
		}
	}
	if p, ok := got.Placement(Honeymoons); !ok || p.Order != 6 || p.Tagline == nil || *p.Tagline != "Nassau" {
		t.Errorf("Placement(honeymoons) = %+v, %v", p, ok)
	}
	if _, ok := got.Placement("nowhere"); ok {
		t.Error("Placement found a topic that is not listed")
	}

	out, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != in {
		t.Errorf("marshal changed the object:\n got %s\nwant %s", out, in)
	}
	var again Topics
	if err := json.Unmarshal(out, &again); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(again, got) {
		t.Errorf("round trip changed the topics: %+v", again)
	}
}

func TestTopicsInsideATrip(t *testing.T) {
	var tr struct {
		Topics Topics `json:"topics"`
	}
	if err := json.Unmarshal([]byte(`{"topics":{"cruises":{"order":1},"caribbean":{"order":4}}}`), &tr); err != nil {
		t.Fatal(err)
	}
	if len(tr.Topics) != 2 || tr.Topics[0].Topic != Cruises || tr.Topics[1].Topic != Caribbean {
		t.Errorf("topics = %+v", tr.Topics)
	}
	empty, err := json.Marshal(Topics(nil))
	if err != nil || string(empty) != "{}" {
		t.Errorf("empty topics marshal to %s, %v", empty, err)
	}
}

func TestTopicsRefuseBadInput(t *testing.T) {
	tests := []struct {
		name, in, wantErr string
	}{
		{"listed twice", `{"cruises":{"order":1},"cruises":{"order":2}}`, "listed twice"},
		{"unknown placement field", `{"cruises":{"order":1,"ordr":2}}`, "unknown field"},
		{"not an object", `["cruises"]`, "want a JSON object"},
		{"order is not a number", `{"cruises":{"order":"1"}}`, "cannot unmarshal"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got Topics
			err := json.Unmarshal([]byte(tt.in), &got)
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("error = %v, want one containing %q", err, tt.wantErr)
			}
		})
	}
}

func TestTopicsNullLeavesTheValueAlone(t *testing.T) {
	got := Topics{{Topic: Cruises, Placement: TopicPlacement{Order: 1}}}
	if err := json.Unmarshal([]byte(`null`), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Errorf("null changed the value to %+v", got)
	}
}
