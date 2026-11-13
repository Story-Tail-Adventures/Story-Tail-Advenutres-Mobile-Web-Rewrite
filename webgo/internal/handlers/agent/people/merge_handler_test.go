package people

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// The merge page's handlers (Screens 3.9.7 / 3.3.11), against the fake Supabase. What
// ClientMergeForm.test.tsx checks moves here too: the picker sends exactly the flips, the
// confirm step says what moves and that there is no undo or email, a success opens the kept
// record, and a refusal stays in the dialog.

const (
	keepID   = "0195a2c0-1a00-7000-8000-0000000000a1"
	otherID  = "0195a2c0-1a00-7000-8000-0000000000b2"
	mergeURL = "/agent/clients/" + keepID + "/merge"
)

func mergeWorld(t *testing.T) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.factor = true
	wd.fake.aal = "aal2"
	return wd
}

func summaryJSON(id, first, last string, version int, trips int, signIn string) map[string]any {
	s := map[string]any{
		"clientId": id, "firstName": first, "lastName": last, "email": strings.ToLower(first) + "@example.com",
		"createdAt": "2024-03-05T12:00:00+00:00", "archived": false, "version": version, "address": nil,
		"counts": map[string]any{"trips": trips, "conversations": 2, "notes": 5, "companions": 0, "documents": 0, "travelDocuments": 0, "commissions": 0},
		"signIn": nil,
	}
	if signIn != "" {
		s["signIn"] = map[string]any{"accountId": "acc", "email": signIn, "locked": false}
	}
	return s
}

func previewJSON(blocked any) string {
	return mustJSON(map[string]any{
		"needsMfa": false,
		"client":   summaryJSON(keepID, "Maya", "Carter", 3, 1, ""),
		"preview": map[string]any{
			"keep":        summaryJSON(keepID, "Maya", "Carter", 3, 1, ""),
			"retire":      summaryJSON(otherID, "Maya", "Carter-Reyes", 7, 3, "m@example.com"),
			"signInPlan":  "move",
			"pinnedEmail": "m@example.com",
			"blocked":     blocked,
			"fields": []map[string]any{
				{"field": "phone", "source": "client", "keepValue": "305-555-0100", "retireValue": "305-555-0199", "default": "keep", "pinned": false, "same": false},
				{"field": "email", "source": "client", "keepValue": "maya@example.com", "retireValue": "m@example.com", "default": "retire", "pinned": true, "same": false},
				{"field": "budget_band", "source": "preference", "keepValue": "premium", "retireValue": "premium", "default": "keep", "pinned": false, "same": true},
				{"field": "notes", "source": "client", "keepValue": nil, "retireValue": "Prefers aisle seats", "default": "retire", "pinned": false, "same": false},
			},
		},
	})
}

func TestMergeGateAndPick(t *testing.T) {
	t.Run("before aal2 the page is only the gate, which comes back here", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = `{"needsMfa":true,"agentHasFactor":true}`
		rec := wd.get(mergeURL + "?with=" + otherID)
		if rec.Code != http.StatusOK {
			t.Fatalf("gate = %d", rec.Code)
		}
		b := rec.Body.String()
		has(t, b, "Merge duplicate records", "Two-step sign-in first", accGateBodyVerify,
			`href="/login/mfa?next=`+url.QueryEscape(mergeURL+"?with="+otherID)+`"`)
		lacks(t, b, "Which record is the duplicate?", "Which details to keep", "ppl-back")
	})

	t.Run("an advisor with no second factor is sent to set one up", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = `{"needsMfa":true,"agentHasFactor":false}`
		has(t, wd.get(mergeURL).Body.String(), accGateSetUp, `href="/mfa/setup?next=`)
	})

	t.Run("likely duplicates, each a link to the pair", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = mustJSON(map[string]any{
			"needsMfa": false, "client": summaryJSON(keepID, "Maya", "Carter", 3, 1, ""),
			"candidates": []map[string]any{
				{"clientId": otherID, "firstName": "Maya", "lastName": "Carter-Reyes", "email": "m@example.com", "archived": true, "trips": 3, "createdAt": "2024-04-01T00:00:00+00:00", "reason": "email"},
			},
		})
		b := wd.get(mergeURL).Body.String()
		has(t, b, "Which record is the duplicate?", "These could be the same person as Maya Carter.",
			"Maya Carter-Reyes · m@example.com", "Same email · 3 trips · joined Apr 2024", ">Archived<",
			`href="`+mergeURL+`?with=`+otherID+`"`, `aria-label="Merge with this record: Maya Carter-Reyes"`,
			`href="/agent/clients/`+keepID+`"`)
		lacks(t, b, mergeNoCandidates, "Which details to keep", "merge-dialog")
		var args map[string]any
		_ = json.Unmarshal([]byte(wd.fake.rpcArgs["agent_client_merge_view"]), &args)
		if args["p_client_id"] != keepID || args["p_other_id"] != nil || args["p_search"] != nil {
			t.Errorf("args = %v", args)
		}
	})

	t.Run("a search goes to the read trimmed, and says when nothing matches", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = mustJSON(map[string]any{"needsMfa": false, "client": summaryJSON(keepID, "Maya", "Carter", 3, 1, ""), "candidates": []any{}})
		b := wd.get(mergeURL + "?q=" + url.QueryEscape("  reyes ")).Body.String()
		has(t, b, mergeNoResults, `value="reyes"`)
		if !strings.Contains(wd.fake.rpcArgs["agent_client_merge_view"], `"p_search":"reyes"`) {
			t.Errorf("args = %s", wd.fake.rpcArgs["agent_client_merge_view"])
		}
		b = wd.get(mergeURL).Body.String()
		has(t, b, mergeNoCandidates)
	})

	t.Run("a malformed id, or none of theirs, is no such client", func(t *testing.T) {
		wd := mergeWorld(t)
		for _, target := range []string{"/agent/clients/c-imani/merge", mergeURL + "?with=nope", mergeURL + "?with="} {
			if rec := wd.get(target); rec.Code != http.StatusNotFound {
				t.Errorf("%s = %d", target, rec.Code)
			}
		}
		if _, ok := wd.fake.rpcArgs["agent_client_merge_view"]; ok {
			t.Error("a malformed id still read")
		}
		wd.fake.rpc["agent_client_merge_view"] = `null`
		if rec := wd.get(mergeURL); rec.Code != http.StatusNotFound {
			t.Errorf("null = %d", rec.Code)
		}
		wd.fake.failing["agent_client_merge_view"] = true
		if rec := wd.get(mergeURL); rec.Code != http.StatusServiceUnavailable {
			t.Errorf("failed read = %d", rec.Code)
		}
	})

	t.Run("a pair the SQL will not merge", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = mustJSON(map[string]any{"needsMfa": false, "client": summaryJSON(keepID, "Maya", "Carter", 3, 1, ""), "preview": nil})
		b := wd.get(mergeURL + "?with=" + otherID).Body.String()
		has(t, b, "Those two records can&#39;t be merged.", `href="`+mergeURL+`"`)
	})
}

func TestMergePreview(t *testing.T) {
	wd := mergeWorld(t)
	wd.fake.rpc["agent_client_merge_view"] = previewJSON(nil)
	rec := wd.get(mergeURL + "?with=" + otherID)
	if rec.Code != http.StatusOK {
		t.Fatalf("preview = %d", rec.Code)
	}
	b := rec.Body.String()
	has(t, b,
		"Maya Carter-Reyes", "3 trips · joined Mar 2024", "Signs in as m@example.com", "Hasn&#39;t set up a sign-in",
		`href="/agent/clients/`+otherID+`/merge?with=`+keepID+`"`, // Keep this one instead
		`aria-label="Phone: use 305-555-0100"`, `aria-label="Phone: use 305-555-0199"`,
		`aria-label="Notes: use Prefers aisle seats"`, `aria-label="Notes: use Blank"`,
		"Matches their sign-in email", "1 more detail is the same on both.",
		`name="keepVersion" value="3"`, `name="otherVersion" value="7"`,
		`action="`+mergeURL+`?with=`+otherID+`"`,
		"Merge into Maya Carter?", "Moving over from Maya Carter-Reyes&#39;s record: 3 trips, 2 conversations, 5 notes.",
		"Maya&#39;s sign-in moves over, so they sign in the same way as before.", "There&#39;s no undo button.", "Nothing is emailed to the client.")
	// The email is fixed to the sign-in: no choice to make.
	lacks(t, b, `name="pick-email"`, `name="pick-budget_band"`)
	if !checkedRadio(b, "Phone: use 305-555-0100") || checkedRadio(b, "Phone: use 305-555-0199") {
		t.Error("the phone row does not start on the kept value")
	}
	if !checkedRadio(b, "Notes: use Prefers aisle seats") {
		t.Error("a blank kept detail does not start on the other value")
	}
	if dialogOpen(b, "merge-dialog") {
		t.Error("the confirm step opened on arrival")
	}

	// Review without JS: the dialog opens on the advisor's picks.
	rec = wd.post(mergeURL+"?with="+otherID, url.Values{"intent": {"review"}, "keepVersion": {"3"}, "otherVersion": {"7"}, "pick-phone": {"retire"}, "pick-notes": {"retire"}})
	b = rec.Body.String()
	if rec.Code != http.StatusOK || !dialogOpen(b, "merge-dialog") {
		t.Fatalf("review = %d, open %v", rec.Code, dialogOpen(b, "merge-dialog"))
	}
	if !checkedRadio(b, "Phone: use 305-555-0199") {
		t.Error("review lost the pick")
	}
	if got := ddValue(b, "phone"); got != "305-555-0199" {
		t.Errorf("the record you'll have: phone = %q", got)
	}
	if got := ddValue(b, "email"); got != "m@example.com" {
		t.Errorf("the record you'll have: email = %q", got)
	}
	if len(wd.fake.callsTo("account-admin")) != 0 {
		t.Error("review wrote")
	}
}

// ddValue is the confirm step's value for one detail.
func ddValue(body, field string) string {
	i := strings.Index(body, `data-merge-value="`+field+`"`)
	if i < 0 {
		return ""
	}
	start := i + strings.Index(body[i:], ">") + 1
	return body[start : start+strings.Index(body[start:], "</dd>")]
}

func checkedRadio(body, label string) bool {
	i := strings.Index(body, `aria-label="`+label+`"`)
	if i < 0 {
		return false
	}
	start := strings.LastIndex(body[:i], "<input")
	end := i + strings.Index(body[i:], ">")
	return strings.Contains(body[start:end], "checked")
}

func TestMergeWrite(t *testing.T) {
	post := func(wd *world, picks url.Values) *http.Response {
		form := url.Values{"intent": {"merge"}, "keepVersion": {"3"}, "otherVersion": {"7"}}
		for k, v := range picks {
			form[k] = v
		}
		return wd.post(mergeURL+"?with="+otherID, form).Result()
	}

	t.Run("sends only the flip, then opens the kept record", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = previewJSON(nil)
		wd.fake.functions["POST account-admin"] = reply{200, `{"outcome":"merged"}`}
		res := post(wd, url.Values{"pick-phone": {"retire"}, "pick-notes": {"retire"}, "pick-email": {"keep"}})
		if res.StatusCode != http.StatusSeeOther || res.Header.Get("Location") != "/agent/clients/"+keepID {
			t.Fatalf("merge = %d %q", res.StatusCode, res.Header.Get("Location"))
		}
		c := wd.fake.callsTo("account-admin")[0]
		if string(c.Body["op"]) != `"merge"` || string(c.Body["clientId"]) != `"`+keepID+`"` || string(c.Body["otherClientId"]) != `"`+otherID+`"` ||
			string(c.Body["keepVersion"]) != "3" || string(c.Body["otherVersion"]) != "7" || string(c.Body["choices"]) != `{"phone":"retire"}` {
			t.Errorf("body = %v", c.Body)
		}
	})

	t.Run("no flips is an empty choice set", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = previewJSON(nil)
		wd.fake.functions["POST account-admin"] = reply{200, `{"outcome":"merged"}`}
		post(wd, nil)
		if c := wd.fake.callsTo("account-admin")[0]; string(c.Body["choices"]) != `{}` {
			t.Errorf("choices = %s", c.Body["choices"])
		}
	})

	t.Run("a refusal stays in the dialog, with the picks", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = previewJSON(nil)
		for _, c := range []struct {
			reply reply
			want  string
		}{
			{reply{200, `{"outcome":"refused","reason":"Those records belong to different advisors."}`}, "Those records belong to different advisors."},
			{reply{200, `{"outcome":"refused"}`}, mergeFailed},
			{reply{200, `{"outcome":"what"}`}, mergeFailed},
			{reply{422, `{"detail":"Action requires multi-factor authentication within 10 minutes"}`}, accMfaStale},
			{reply{422, `{"detail":"Pick keep or retire for phone."}`}, "Pick keep or retire for phone."},
			{reply{500, `{"detail":"boom"}`}, mergeFailed},
			// The two-step rule is a 403, which api reports as Unauthenticated with no detail.
			{reply{403, `{"detail":"MFA was verified 3600s ago; this action requires it within 900s."}`}, accMfaStale},
		} {
			wd.fake.functions["POST account-admin"] = c.reply
			res := wd.post(mergeURL+"?with="+otherID, url.Values{"intent": {"merge"}, "keepVersion": {"3"}, "otherVersion": {"7"}, "pick-phone": {"retire"}})
			b := res.Body.String()
			if res.Code == http.StatusSeeOther || !dialogOpen(b, "merge-dialog") {
				t.Errorf("%s: %d, dialog open %v", c.reply.Body, res.Code, dialogOpen(b, "merge-dialog"))
				continue
			}
			has(t, b, strings.ReplaceAll(c.want, "'", "&#39;"))
			if !checkedRadio(b, "Phone: use 305-555-0199") {
				t.Errorf("%s: the pick was lost", c.reply.Body)
			}
		}
	})

	t.Run("a stale pair is drawn fresh, with the sentence", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = previewJSON(nil)
		wd.fake.functions["POST account-admin"] = reply{200, `{"outcome":"stale"}`}
		res := wd.post(mergeURL+"?with="+otherID, url.Values{"intent": {"merge"}, "keepVersion": {"3"}, "otherVersion": {"7"}, "pick-phone": {"retire"}})
		b := res.Body.String()
		if res.Code != http.StatusConflict || !dialogOpen(b, "merge-dialog") {
			t.Fatalf("stale = %d", res.Code)
		}
		has(t, b, "One of these records changed since you opened this page.")
		if !checkedRadio(b, "Phone: use 305-555-0100") {
			t.Error("a stale answer kept the old picks")
		}
	})

	t.Run("a mangled form never reaches the function", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = previewJSON(nil)
		res := wd.post(mergeURL+"?with="+otherID, url.Values{"intent": {"merge"}, "keepVersion": {"3.5"}, "otherVersion": {"7"}})
		if res.Code != http.StatusUnprocessableEntity || len(wd.fake.callsTo("account-admin")) != 0 {
			t.Errorf("bad version = %d, calls %d", res.Code, len(wd.fake.callsTo("account-admin")))
		}
		if rec := wd.post(mergeURL, url.Values{"intent": {"merge"}}); rec.Code != http.StatusNotFound {
			t.Errorf("no ?with= = %d", rec.Code)
		}
	})

	t.Run("a blocked merge cannot be reviewed or sent", func(t *testing.T) {
		wd := mergeWorld(t)
		wd.fake.rpc["agent_client_merge_view"] = previewJSON("kept_archived")
		b := wd.get(mergeURL + "?with=" + otherID).Body.String()
		has(t, b, "Restore the record you&#39;re keeping before merging into it.")
		i := strings.Index(b, "data-merge-review")
		if i < 0 || !strings.Contains(b[strings.LastIndex(b[:i], "<button"):i+strings.Index(b[i:], ">")], "disabled") {
			t.Error("Review is not disabled on a blocked pair")
		}
		res := wd.post(mergeURL+"?with="+otherID, url.Values{"intent": {"merge"}, "keepVersion": {"3"}, "otherVersion": {"7"}})
		if res.Code != http.StatusUnprocessableEntity || len(wd.fake.callsTo("account-admin")) != 0 || dialogOpen(res.Body.String(), "merge-dialog") {
			t.Errorf("blocked post = %d", res.Code)
		}
	})
}
