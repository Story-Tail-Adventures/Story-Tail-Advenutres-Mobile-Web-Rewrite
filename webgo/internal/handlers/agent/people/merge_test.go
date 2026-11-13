package people

import (
	"encoding/json"
	"reflect"
	"testing"
)

// Ported from web/lib/agent/mergeView.test.ts (§3.9.7 / §3.3.11, ruled 2026-10-16). The SQL
// decides every default and the sign-in plan; this checks the words, and that only the
// advisor's flips are sent back.

func mergeSummary(t *testing.T, over map[string]any) mergeSummaryRow {
	t.Helper()
	row := map[string]any{
		"clientId": "k", "firstName": "Maya", "lastName": "Carter", "email": "maya@example.com",
		"createdAt": "2024-03-05T12:00:00Z", "archived": false, "version": 3, "address": nil,
		"counts": map[string]any{"trips": 0, "conversations": 0, "notes": 0, "companions": 0, "documents": 0, "travelDocuments": 0, "commissions": 0},
		"signIn": nil,
	}
	for k, v := range over {
		row[k] = v
	}
	var s mergeSummaryRow
	if err := json.Unmarshal([]byte(mustJSON(row)), &s); err != nil {
		t.Fatal(err)
	}
	return s
}

func counts(over map[string]int64) mergeCounts {
	c := mergeCounts{}
	c.Trips, c.Conversations, c.Notes = over["trips"], over["conversations"], over["notes"]
	c.Companions, c.Documents, c.TravelDocuments = over["companions"], over["documents"], over["travelDocuments"]
	return c
}

func mergePreviewFixture(t *testing.T) mergeViewRow {
	t.Helper()
	var fields []mergeFieldRow
	if err := json.Unmarshal([]byte(`[
		{"field":"last_name","source":"client","keepValue":"Carter","retireValue":"Carter-Reyes","default":"keep","pinned":false,"same":false},
		{"field":"email","source":"client","keepValue":"maya@example.com","retireValue":"maya.r@example.com","default":"retire","pinned":true,"same":false},
		{"field":"phone","source":"client","keepValue":"305-555-0100","retireValue":"305-555-0100","default":"keep","pinned":false,"same":true},
		{"field":"mailing_address_id","source":"client","keepValue":null,"retireValue":"addr-1","default":"retire","pinned":false,"same":false}
	]`), &fields); err != nil {
		t.Fatal(err)
	}
	keep := mergeSummary(t, map[string]any{"counts": map[string]any{"trips": 1}})
	retire := mergeSummary(t, map[string]any{
		"clientId": "r", "lastName": "Carter-Reyes", "version": 7, "address": "12 Rua Augusta, Lisbon",
		"counts": map[string]any{"trips": 3, "conversations": 2, "notes": 5},
		"signIn": map[string]any{"accountId": "a", "email": "maya.r@example.com", "locked": false},
	})
	client := mergeSummary(t, nil)
	pinned := "maya.r@example.com"
	return mergeViewRow{
		Client: &client,
		Preview: &mergePreviewRow{
			Keep: keep, Retire: retire, SignInPlan: "move", PinnedEmail: &pinned, Fields: fields,
		},
	}
}

func TestToMergeView(t *testing.T) {
	t.Run("before aal2 it is only the gate", func(t *testing.T) {
		v := toMergeView(mergeViewRow{NeedsMfa: true, AgentHasFactor: true}, true)
		if v.Kind != "needs-mfa" || !v.AgentHasFactor {
			t.Errorf("gate = %+v", v)
		}
	})

	t.Run("draws only the details that differ and counts the rest", func(t *testing.T) {
		v := toMergeView(mergePreviewFixture(t), true)
		if v.Kind != "preview" {
			t.Fatal(v.Kind)
		}
		var names []string
		for _, f := range v.Fields {
			names = append(names, f.Field)
		}
		if !reflect.DeepEqual(names, []string{"last_name", "email", "mailing_address_id"}) {
			t.Errorf("fields = %v", names)
		}
		if v.SameCount != 1 {
			t.Errorf("sameCount = %d", v.SameCount)
		}
		if f := v.Fields[2]; f.Keep != mergeBlank || f.Retire != "12 Rua Augusta, Lisbon" || f.Pick != "retire" {
			t.Errorf("address row = %+v", f)
		}
	})

	t.Run("says what moves in the ruling's words, and what happens to the sign-in", func(t *testing.T) {
		v := toMergeView(mergePreviewFixture(t), true)
		if v.Moves != "3 trips, 2 conversations, 5 notes" {
			t.Errorf("moves = %q", v.Moves)
		}
		if v.Plan != mergePlanMove("Maya") {
			t.Errorf("plan = %q", v.Plan)
		}
		if v.Retire.SignIn != "Signs in as maya.r@example.com" {
			t.Errorf("signIn = %q", v.Retire.SignIn)
		}
		if v.Keep.Line != "1 trip · joined Mar 2024" {
			t.Errorf("line = %q", v.Keep.Line)
		}
	})

	t.Run("a pair the SQL will not merge is its own state", func(t *testing.T) {
		row := mergePreviewFixture(t)
		row.Preview = nil
		if v := toMergeView(row, true); v.Kind != "not-mergeable" {
			t.Errorf("kind = %s", v.Kind)
		}
	})

	t.Run("names a block in words", func(t *testing.T) {
		row := mergePreviewFixture(t)
		b := "companion_cap"
		row.Preview.Blocked = &b
		if v := toMergeView(row, true); v.Blocked != mergeBlockedCompanions {
			t.Errorf("blocked = %q", v.Blocked)
		}
	})

	// Go-only: the plan's other two branches and the pick list, which Next's test leaves to
	// the component.
	t.Run("a locked sign-in that moves, and two sign-ins", func(t *testing.T) {
		row := mergePreviewFixture(t)
		row.Preview.Retire.SignIn.Locked = true
		if v := toMergeView(row, true); v.Plan != mergePlanMoveLocked("Maya") {
			t.Errorf("plan = %q", v.Plan)
		}
		row.Preview.SignInPlan = "lock_retired"
		if v := toMergeView(row, true); v.Plan != mergePlanLock("Maya") {
			t.Errorf("plan = %q", v.Plan)
		}
		row.Preview.SignInPlan = "keep"
		if v := toMergeView(row, true); v.Plan != "" {
			t.Errorf("plan = %q", v.Plan)
		}
	})

	t.Run("the pick list names each match's reason", func(t *testing.T) {
		row := mergePreviewFixture(t)
		email := "maya.c@example.com"
		row.Candidates = []mergeCandidateRow{
			{ClientID: "c1", FirstName: "Maya", LastName: "Carter ", Email: &email, Trips: 2, CreatedAt: "2025-01-09T10:00:00+00:00", Reason: "email"},
			{ClientID: "c2", FirstName: "Maia", LastName: "Carter", Archived: true, Trips: 1, CreatedAt: "2025-02-01T10:00:00+00:00", Reason: "who-knows"},
		}
		v := toMergeView(row, false)
		if v.Kind != "pick" || len(v.Candidates) != 2 {
			t.Fatalf("pick = %+v", v)
		}
		if c := v.Candidates[0]; c.Name != "Maya Carter" || c.Email != email || c.Reason != mergeReasonEmail || c.Line != "2 trips · joined Jan 2025" {
			t.Errorf("first = %+v", c)
		}
		if c := v.Candidates[1]; c.Reason != mergeReasonName || !c.Archived || c.Line != "1 trip · joined Feb 2025" {
			t.Errorf("second = %+v", c)
		}
	})
}

func TestMergeChoices(t *testing.T) {
	v := toMergeView(mergePreviewFixture(t), true)
	if v.Kind != "preview" {
		t.Fatal(v.Kind)
	}

	t.Run("sends only the flips, and never the pinned email", func(t *testing.T) {
		got := changedChoices(v.Fields, map[string]string{"last_name": "retire", "email": "keep", "mailing_address_id": "retire"})
		if !reflect.DeepEqual(got, map[string]string{"last_name": "retire"}) {
			t.Errorf("choices = %v", got)
		}
	})

	t.Run("the record you'll have follows the picks, with the email fixed", func(t *testing.T) {
		got := mergedValues(v.Fields, map[string]string{"last_name": "retire", "email": "keep"})
		want := []mergedValue{
			{Label: "Last name", Value: "Carter-Reyes"},
			{Label: "Email", Value: "maya.r@example.com"},
			{Label: "Mailing address", Value: "12 Rua Augusta, Lisbon"},
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("merged = %v", got)
		}
	})
}

func TestFormatMergeValue(t *testing.T) {
	t.Run("never shows a loyalty number", func(t *testing.T) {
		if got := formatMergeValue("loyalty_programs", json.RawMessage(`[{"program":"Delta SkyMiles","number":"9912345678"}]`), nil); got != "Delta SkyMiles" {
			t.Errorf("loyalty = %q", got)
		}
	})

	t.Run("reads jsonb defensively", func(t *testing.T) {
		for _, c := range []struct {
			field, raw, want string
		}{
			{"emergency_contact", `{"name":"Sam","relationship":"Spouse","phone":"305"}`, "Sam · Spouse · 305"},
			{"emergency_contact", `"nonsense"`, mergeBlank},
			{"important_dates", `[{"label":"Anniversary","date":"06-12"},4]`, "Anniversary 06-12"},
			{"tags", `[]`, mergeBlank},
			{"date_of_birth", `"1988-04-02"`, "Apr 2, 1988"},
			// Go-only: the rest of the shapes formatMergeValue reads.
			{"date_of_birth", `"not a date"`, "not a date"},
			{"emergency_contact", `{"relationship":"Spouse"}`, mergeBlank},
			{"emergency_contact", `{"name":"Sam","relationship":"","phone":7}`, "Sam"},
			{"important_dates", `"x"`, mergeBlank},
			{"loyalty_programs", `[{"number":"1"}]`, mergeBlank},
			{"tags", `["vip"," ",3,"honeymoon"]`, "vip, honeymoon"},
			{"notes", `"  "`, mergeBlank},
			{"notes", `" hi "`, " hi "},
			{"budget_band", `null`, mergeBlank},
			{"budget_band", ``, mergeBlank},
			{"first_name", `12.50`, "12.5"},
			{"first_name", `true`, "true"},
			{"first_name", `{"a":1}`, mergeBlank},
		} {
			if got := formatMergeValue(c.field, json.RawMessage(c.raw), nil); got != c.want {
				t.Errorf("formatMergeValue(%s, %s) = %q, want %q", c.field, c.raw, got, c.want)
			}
		}
	})

	t.Run("the mailing address is the record's address, when it has one", func(t *testing.T) {
		addr := "12 Rua Augusta, Lisbon"
		empty := ""
		for _, c := range []struct {
			raw  string
			addr *string
			want string
		}{
			{`"addr-1"`, &addr, addr},
			{`"addr-1"`, &empty, mergeBlank},
			{`"addr-1"`, nil, mergeBlank},
			{`null`, &addr, mergeBlank},
			{`""`, &addr, mergeBlank},
		} {
			if got := formatMergeValue("mailing_address_id", json.RawMessage(c.raw), c.addr); got != c.want {
				t.Errorf("address(%s) = %q, want %q", c.raw, got, c.want)
			}
		}
	})

	t.Run("the counts line drops what is not there", func(t *testing.T) {
		if got := movesLine(counts(map[string]int64{"trips": 1, "travelDocuments": 2})); got != "1 trip, 2 travel documents" {
			t.Errorf("moves = %q", got)
		}
		if got := movesLine(counts(nil)); got != "" {
			t.Errorf("empty moves = %q", got)
		}
	})
}
