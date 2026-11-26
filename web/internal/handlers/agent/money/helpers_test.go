package money

import (
	"encoding/json"
	"testing"
)

// mustRow turns a fixture map into the row type, through JSON, so the tags are exercised the
// way PostgREST exercises them: bigint arrives as a STRING, numeric as a number.
func mustRow(t *testing.T, row map[string]any) commissionLineRow {
	t.Helper()
	var out commissionLineRow
	if err := json.Unmarshal([]byte(mustJSON(row)), &out); err != nil {
		t.Fatal(err)
	}
	return out
}
