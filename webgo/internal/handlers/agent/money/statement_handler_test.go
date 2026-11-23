package money

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// §3.7.5 / §3.7.6 against the mounted sub-area.

const sampleImportID = "0195a2c0-1a00-7000-8000-00000000aa01"
const sampleRowID = "0195a2c0-1a00-7000-8000-00000000bb01"

func importRow(over map[string]any) map[string]any {
	row := map[string]any{
		"import_id": sampleImportID, "original_filename": "april.csv", "status": "review",
		"headers":        []string{"Ref", "Supplier", "Amount"},
		"column_map":     map[string]int{"reference": 0, "received": 2},
		"statement_date": nil, "total_rows": 38,
		"period_start": "2026-04-01", "period_end": "2026-04-30", "version": 4,
		"reconciled_on":   nil,
		"confirmed_count": 30, "suggested_count": 2, "unmatched_count": 1,
		"duplicate_count": 0, "unreadable_count": 0,
		"already_recorded_count": 2, "to_create_count": 3, "ignored_count": 0,
		"sample_rows": [][]string{{"SRB-1", "Sandals", "540.00"}},
		"as_of_date":  "2026-11-22",
	}
	for k, v := range over {
		row[k] = v
	}
	return row
}

func importLineRow(over map[string]any) map[string]any {
	row := map[string]any{
		"row_id": sampleRowID, "row_number": 1, "state": "suggested", "match_basis": "supplier_and_traveler",
		"reference": "SRB-220119", "supplier_text": "Sandals Resorts", "traveler_text": "M Hayes",
		"gross_cents": "1140000", "received_cents": "136800", "fee_cents": "0",
		"paid_on": "2027-02-21", "currency": "USD", "parse_error": nil,
		"line_id":         "0195a2c0-1a00-7000-8000-00000000cc01",
		"line_trip_title": "Anniversary Week in Negril", "line_client_name": "Jordan Hayes",
		"line_supplier_name": "Sandals Resorts", "line_status": "expected",
		"line_gross_cents": "1140000", "line_commission_pct": 12, "line_expected_cents": "136800",
		"line_received_cents": nil,
	}
	for k, v := range over {
		row[k] = v
	}
	return row
}

func statementWorld(t *testing.T, st map[string]any, rows []map[string]any) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.rpc["agent_commission_import"] = mustJSON([]map[string]any{st})
	wd.fake.rpc["agent_commission_import_rows"] = mustJSON(rows)
	wd.fake.rpc["agent_commission_imports"] = mustJSON([]map[string]any{})
	return wd
}

func TestImportListPage(t *testing.T) {
	t.Run("draws the upload card and the statements already uploaded", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_imports"] = mustJSON([]map[string]any{{
			"import_id": sampleImportID, "original_filename": "april.csv", "status": "review",
			"total_rows": 38, "matched_rows": 30,
			"period_start": "2026-04-01", "period_end": "2026-04-30", "created_on": "2026-05-02",
		}})
		rec := wd.get("/agent/commission/import")
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, wd.logs.String())
		}
		body := rec.Body.String()
		has(t, body,
			"Step 1 · Upload", "Step 2 · Map columns", "Choose your statement",
			`enctype="multipart/form-data"`, `accept=".csv,text/csv"`,
			"April 2026 statement", "april.csv · 38 rows · May 2, 2026",
			"/agent/commission/import/"+sampleImportID,
		)
		lacks(t, body, "No statements yet")
	})

	t.Run("nothing uploaded yet says so", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_imports"] = "[]"
		has(t, wd.get("/agent/commission/import").Body.String(), "No statements yet.")
	})

	t.Run("a failed list keeps the upload card, which is the point of the page", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.failing["agent_commission_imports"] = true
		rec := wd.get("/agent/commission/import")
		if rec.Code != http.StatusOK {
			t.Errorf("status %d: a failed list is not an outage for this page", rec.Code)
		}
		has(t, rec.Body.String(), "Upload statement")
		lacks(t, rec.Body.String(), "No statements yet")
	})
}

// upload posts a file the way a browser does.
func (wd *world) upload(name string, content []byte) *httptest.ResponseRecorder {
	wd.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", name)
	if err != nil {
		wd.t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		wd.t.Fatal(err)
	}
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/agent/commission/import", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(wd.cookie())
	rec := httptest.NewRecorder()
	wd.h.ServeHTTP(rec, req)
	return rec
}

func TestUploadStatement(t *testing.T) {
	t.Run("sends the file as base64 and lands on the new statement", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_imports"] = "[]"
		wd.fake.functions["POST commission-import"] = reply{
			Status: 200, Body: `{"outcome":"uploaded","importId":"` + sampleImportID + `"}`,
		}
		rec := wd.upload("april.csv", []byte("Ref,Supplier,Amount\nSRB-1,Sandals,540.00\n"))
		if rec.Code != http.StatusSeeOther {
			t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Location"); got != "/agent/commission/import/"+sampleImportID {
			t.Errorf("landed on %q", got)
		}
		body := wd.fake.calls[0].Body
		if got := strings.TrimSpace(string(body["op"])); got != `"upload"` {
			t.Errorf("op = %s", got)
		}
		// Base64 of the CSV, not the CSV: the function decodes it.
		if got := string(body["fileBase64"]); !strings.HasPrefix(got, `"UmVmLFN1cHBsaWVy`) {
			t.Errorf("fileBase64 = %s", got)
		}
		if got := string(body["filename"]); got != `"april.csv"` {
			t.Errorf("filename = %s", got)
		}
	})

	t.Run("a spreadsheet is named before it is read, and names the fix", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_imports"] = "[]"
		rec := wd.upload("april.xlsx", []byte("PK\x03\x04binary"))
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("status %d, want 422", rec.Code)
		}
		has(t, rec.Body.String(), "save it as CSV and upload that")
		if len(wd.fake.calls) != 0 {
			t.Error("a spreadsheet was sent to the function")
		}
	})

	t.Run("an empty file is refused without a round trip", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_imports"] = "[]"
		rec := wd.upload("april.csv", nil)
		has(t, rec.Body.String(), copyNoFile)
		if len(wd.fake.calls) != 0 {
			t.Error("an empty file was sent to the function")
		}
	})

	t.Run("a file over the cap never reaches the function", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_imports"] = "[]"
		rec := wd.upload("april.csv", bytes.Repeat([]byte("a"), maxStatementBytes+1))
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("status %d, want 422", rec.Code)
		}
		has(t, rec.Body.String(), "larger than 512 KB")
		if len(wd.fake.calls) != 0 {
			t.Error("an oversized file was sent to the function")
		}
	})

	t.Run("a file already imported offers the statement it became", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_imports"] = "[]"
		wd.fake.functions["POST commission-import"] = reply{
			Status: 200, Body: `{"outcome":"duplicate_file","importId":"` + sampleImportID + `"}`,
		}
		rec := wd.upload("april.csv", []byte("Ref\n1\n"))
		body := rec.Body.String()
		has(t, body, "already imported this file", "Open that statement", "/agent/commission/import/"+sampleImportID)
	})
}

func TestStatementMappingPage(t *testing.T) {
	t.Run("a statement with no columns yet draws the map", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping", "column_map": nil}), nil)
		rec := wd.get("/agent/commission/import/" + sampleImportID)
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, wd.logs.String())
		}
		body := rec.Body.String()
		has(t, body,
			"Uploaded: april.csv · 38 rows found",
			"Use a different file",
			`name="col-0"`, `name="col-1"`, `name="col-2"`,
			`value="3"`,       // the header count the form posts back
			"Commission paid", // the field options
			"Paid on, for every row",
		)
		// Nothing is mapped yet, so no option is marked.
		lacks(t, body, "Back to the statement", "Changing the columns clears")
	})

	t.Run("the stored map is shown as the chosen options", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
		body := wd.get("/agent/commission/import/" + sampleImportID).Body.String()
		has(t, body, `value="reference" data-slot="opt-reference" selected=""`,
			`value="received" data-slot="opt-received" selected=""`)
	})

	t.Run("a paid-on column takes the fallback date away", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{
			"status": "mapping", "column_map": map[string]int{"received": 1, "paid_on": 2},
		}), nil)
		lacks(t, wd.get("/agent/commission/import/"+sampleImportID).Body.String(), "Paid on, for every row")
	})

	t.Run("?step=map on a statement in review warns that it clears the decisions", func(t *testing.T) {
		wd := statementWorld(t, importRow(nil), nil)
		body := wd.get("/agent/commission/import/" + sampleImportID + "?step=map").Body.String()
		has(t, body, "Changing the columns clears", "Back to the statement")
		// Starting over would discard a statement that is already in review.
		lacks(t, body, "Use a different file")
	})

	t.Run("?step=map is ignored on a reconciled statement", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "reconciled", "reconciled_on": "2026-05-02"}), nil)
		body := wd.get("/agent/commission/import/" + sampleImportID + "?step=map").Body.String()
		lacks(t, body, "Save columns")
		has(t, body, "Reconciled May 2, 2026")
	})
}

func TestStatementReviewPage(t *testing.T) {
	t.Run("draws the counts, the rows and Resolve where one is needed", func(t *testing.T) {
		wd := statementWorld(t, importRow(nil), []map[string]any{importLineRow(nil)})
		rec := wd.get("/agent/commission/import/" + sampleImportID)
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, wd.logs.String())
		}
		body := rec.Body.String()
		has(t, body,
			"Reconcile · April 2026 statement",
			"38 imported · 35 matched · 3 to resolve",
			"SRB-220119 · Sandals Resorts · M Hayes",
			"$1,368.00", "Feb 21, 2027",
			"/agent/commission/import/"+sampleImportID+"/rows/"+sampleRowID,
			"Change columns", "Discard statement", "Mark as reconciled",
		)
		// Three rows still need the advisor, so reconciling is refused with its reason.
		has(t, body, "disabled", "Resolve 3 more rows to reconcile.")
	})

	t.Run("nothing left to resolve enables Mark as reconciled", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{
			"suggested_count": 0, "unmatched_count": 1, "duplicate_count": 0, "unreadable_count": 0,
		}), []map[string]any{importLineRow(map[string]any{"state": "confirmed", "match_basis": "reference"})})
		body := wd.get("/agent/commission/import/" + sampleImportID).Body.String()
		has(t, body, "Resolve 1 more row to reconcile.")

		wd2 := statementWorld(t, importRow(map[string]any{
			"suggested_count": 0, "unmatched_count": 0, "duplicate_count": 0, "unreadable_count": 0,
		}), []map[string]any{importLineRow(map[string]any{"state": "confirmed", "match_basis": "reference"})})
		body2 := wd2.get("/agent/commission/import/" + sampleImportID).Body.String()
		lacks(t, body2, "more rows to reconcile", "more row to reconcile")
		has(t, body2, "Auto-matched")
	})

	t.Run("a reconciled statement has no actions and says what it did", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{
			"status": "reconciled", "reconciled_on": "2026-05-02",
			"suggested_count": 0, "unmatched_count": 0,
		}), []map[string]any{importLineRow(map[string]any{"state": "confirmed", "match_basis": "reference"})})
		body := wd.get("/agent/commission/import/" + sampleImportID).Body.String()
		has(t, body, "Reconciled May 2, 2026: 30 payments recorded, 3 new lines.")
		lacks(t, body, "Mark as reconciled", "Discard statement", "Change columns", "Resolve</a>")
	})

	t.Run("a bad id is a bad link, and asks Postgres nothing", func(t *testing.T) {
		wd := statementWorld(t, importRow(nil), nil)
		rec := wd.get("/agent/commission/import/not-a-uuid")
		if rec.Code != http.StatusNotFound {
			t.Errorf("status %d, want 404", rec.Code)
		}
		has(t, rec.Body.String(), "Statement not found")
		if _, asked := wd.fake.rpcArgs["agent_commission_import"]; asked {
			t.Error("a malformed id reached PostgREST")
		}
	})

	t.Run("a failed read is an outage", func(t *testing.T) {
		wd := statementWorld(t, importRow(nil), nil)
		wd.fake.failing["agent_commission_import"] = true
		if rec := wd.get("/agent/commission/import/" + sampleImportID); rec.Code != http.StatusServiceUnavailable {
			t.Errorf("status %d, want 503", rec.Code)
		}
	})
}

func TestMapStatement(t *testing.T) {
	good := func() url.Values {
		return url.Values{
			"op": {"map"}, "importId": {sampleImportID}, "version": {"4"}, "headerCount": {"3"},
			"col-0": {"reference"}, "col-1": {"supplier"}, "col-2": {"received"},
			"statementDate": {"2026-04-30"},
		}
	}

	t.Run("sends the map as field to index, with the statement's own date", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
		rec := wd.post("/agent/commission/import/"+sampleImportID, good())
		if rec.Code != http.StatusSeeOther {
			t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
		body := wd.fake.calls[0].Body
		if got := string(body["columnMap"]); got != `{"received":2,"reference":0,"supplier":1}` {
			t.Errorf("columnMap = %s", got)
		}
		if got := string(body["statementDate"]); got != `"2026-04-30"` {
			t.Errorf("statementDate = %s", got)
		}
		if got := strings.TrimSpace(string(body["expectedVersion"])); got != "4" {
			t.Errorf("expectedVersion = %s", got)
		}
	})

	t.Run("a paid-on column sends no date at all", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
		form := good()
		form.Set("col-1", "paid_on")
		wd.post("/agent/commission/import/"+sampleImportID, form)
		if got := string(wd.fake.calls[0].Body["statementDate"]); got != "null" {
			t.Errorf("statementDate = %s, want null", got)
		}
	})

	t.Run("no commission column is refused before the function", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
		form := good()
		form.Set("col-2", "")
		rec := wd.post("/agent/commission/import/"+sampleImportID, form)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("status %d, want 422", rec.Code)
		}
		has(t, rec.Body.String(), copyMapNeedsReceived)
		if len(wd.fake.calls) != 0 {
			t.Error("a refused map still called the function")
		}
	})

	t.Run("a refused map keeps what was chosen", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
		form := good()
		form.Set("col-0", "supplier") // supplier twice
		rec := wd.post("/agent/commission/import/"+sampleImportID, form)
		body := rec.Body.String()
		has(t, body, "Supplier is chosen for two columns. Pick one.")
		// The advisor's own choices are drawn again, not the stored ones.
		has(t, body, `value="supplier" data-slot="opt-supplier" selected=""`)
	})

	t.Run("a 409 is stale and does not refresh the version", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping", "version": 9}), nil)
		wd.fake.functions["POST commission-import"] = reply{Status: 409, Body: `{"detail":"nope"}`}
		rec := wd.post("/agent/commission/import/"+sampleImportID, good())
		if rec.Code != http.StatusConflict {
			t.Errorf("status %d, want 409: %s", rec.Code, wd.logs.String())
		}
		body := rec.Body.String()
		has(t, body, copyStatementStale)
		if strings.Contains(body, `value="9"`) {
			t.Error("the refused page handed back the server's version")
		}
	})
}

func TestReconcileAndDiscard(t *testing.T) {
	settled := importRow(map[string]any{"suggested_count": 0, "unmatched_count": 0, "duplicate_count": 0, "unreadable_count": 0})
	form := func(op string) url.Values {
		return url.Values{"op": {op}, "importId": {sampleImportID}, "version": {"4"}}
	}

	t.Run("reconciling is the one action that changes the ledger", func(t *testing.T) {
		wd := statementWorld(t, settled, nil)
		wd.fake.functions["POST commission-import"] = reply{Status: 200, Body: `{"outcome":"reconciled"}`}
		rec := wd.post("/agent/commission/import/"+sampleImportID, form("reconcile"))
		if rec.Code != http.StatusSeeOther {
			t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
		if got := strings.TrimSpace(string(wd.fake.calls[0].Body["op"])); got != `"reconcile"` {
			t.Errorf("op = %s", got)
		}
	})

	t.Run("a row that needs the advisor again says where it is", func(t *testing.T) {
		wd := statementWorld(t, settled, []map[string]any{importLineRow(nil)})
		wd.fake.functions["POST commission-import"] = reply{Status: 200, Body: `{"outcome":"needs_decisions"}`}
		rec := wd.post("/agent/commission/import/"+sampleImportID, form("reconcile"))
		has(t, rec.Body.String(), "A row needs you again. It&#39;s at the top of the table.")
	})

	t.Run("a call that never answered says only what is known", func(t *testing.T) {
		wd := statementWorld(t, settled, nil)
		// 500: the function may have committed before the answer was lost.
		wd.fake.functions["POST commission-import"] = reply{Status: 500, Body: `{}`}
		rec := wd.post("/agent/commission/import/"+sampleImportID, form("reconcile"))
		has(t, rec.Body.String(), "Reload the page to see where the statement stands")
		lacks(t, rec.Body.String(), "Nothing in your ledger changed")
	})

	t.Run("a refusal is certain, so it says nothing changed", func(t *testing.T) {
		wd := statementWorld(t, settled, nil)
		wd.fake.functions["POST commission-import"] = reply{Status: 422, Body: `{"detail":"no"}`}
		rec := wd.post("/agent/commission/import/"+sampleImportID, form("reconcile"))
		has(t, rec.Body.String(), "Nothing in your ledger changed")
	})

	t.Run("discarding goes back to the list", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
		wd.fake.functions["POST commission-import"] = reply{Status: 200, Body: `{"outcome":"discarded"}`}
		rec := wd.post("/agent/commission/import/"+sampleImportID, form("discard"))
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/commission/import" {
			t.Errorf("status %d, location %q", rec.Code, rec.Header().Get("Location"))
		}
	})

	t.Run("a statement already reconciled cannot change", func(t *testing.T) {
		wd := statementWorld(t, settled, nil)
		wd.fake.functions["POST commission-import"] = reply{Status: 200, Body: `{"outcome":"not_open"}`}
		rec := wd.post("/agent/commission/import/"+sampleImportID, form("discard"))
		has(t, rec.Body.String(), "already reconciled or discarded, so it can&#39;t change.")
	})
}

// A REFUSED REMAP MUST STAY ON THE MAP. The mode is read off ?step=map, so a form action
// without it sent the advisor to the reconciliation table with their choices gone and no
// sentence — the commonest refusal (forgetting the commission column) said nothing at all.
func TestARefusedRemapStaysOnTheMap(t *testing.T) {
	for _, c := range []struct {
		name string
		set  func(url.Values)
		want string
	}{
		{"no commission column", func(f url.Values) { f.Set("col-2", "") }, copyMapNeedsReceived},
		{"one field twice", func(f url.Values) { f.Set("col-0", "supplier") }, "chosen for two columns"},
		{"no paid-on and no date", func(f url.Values) { f.Set("statementDate", "") }, copyMapNeedsDate},
	} {
		t.Run(c.name, func(t *testing.T) {
			wd := statementWorld(t, importRow(nil), []map[string]any{importLineRow(nil)})
			form := url.Values{
				"op": {"map"}, "importId": {sampleImportID}, "version": {"4"}, "headerCount": {"3"},
				"col-0": {"reference"}, "col-1": {"supplier"}, "col-2": {"received"},
				"statementDate": {"2026-04-30"},
			}
			c.set(form)
			rec := wd.post("/agent/commission/import/"+sampleImportID+"?step=map", form)
			if rec.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status %d, want 422", rec.Code)
			}
			body := rec.Body.String()
			has(t, body, c.want, "Import 38 rows")
			// Not the reconciliation table, which has nothing to do with the refusal.
			lacks(t, body, "Mark as reconciled")
		})
	}

	t.Run("the map form posts back to ?step=map", func(t *testing.T) {
		wd := statementWorld(t, importRow(nil), nil)
		body := wd.get("/agent/commission/import/" + sampleImportID + "?step=map").Body.String()
		has(t, body, `action="/agent/commission/import/`+sampleImportID+`?step=map"`)
	})

	t.Run("a statement still being mapped needs no ?step=map", func(t *testing.T) {
		wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
		body := wd.get("/agent/commission/import/" + sampleImportID).Body.String()
		lacks(t, body, "?step=map\"")
	})
}

// A statement still being mapped draws no table, so a failure reading the rows is not its
// outage — it used to blank the whole page.
func TestAFailedRowsReadOnlyBlanksTheTable(t *testing.T) {
	wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
	wd.fake.failing["agent_commission_import_rows"] = true
	rec := wd.get("/agent/commission/import/" + sampleImportID)
	if rec.Code != http.StatusOK {
		t.Errorf("status %d: a rows failure blanked the map", rec.Code)
	}
	has(t, rec.Body.String(), "Import 38 rows")

	// On the screen that DOES draw them, the same failure is an outage.
	wd2 := statementWorld(t, importRow(nil), nil)
	wd2.fake.failing["agent_commission_import_rows"] = true
	if rec := wd2.get("/agent/commission/import/" + sampleImportID); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d, want 503", rec.Code)
	}
}

// The ledger-changing action and the one that deletes the uploaded file both ask twice.
func TestTheDestructiveActionsConfirm(t *testing.T) {
	wd := statementWorld(t, importRow(nil), []map[string]any{importLineRow(nil)})
	body := wd.get("/agent/commission/import/" + sampleImportID).Body.String()
	has(t, body,
		"Discard this statement?",
		"Nothing in your ledger has changed. You can upload the file again afterward.",
		"Mark this statement reconciled?",
	)
	// Each one is a disclosure, so the first click only opens it.
	if n := strings.Count(body, "mny-confirm-summary"); n != 2 {
		t.Errorf("%d confirmations on the review page, want 2", n)
	}

	wd2 := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
	body2 := wd2.get("/agent/commission/import/" + sampleImportID).Body.String()
	has(t, body2, "Use a different file", "Discard this statement?")
}

// The marker the intro promises: Auto is the stored guess still in place, Manual is a column
// the advisor has moved since.
func TestColumnsAreMarkedAutoOrManual(t *testing.T) {
	wd := statementWorld(t, importRow(map[string]any{"status": "mapping"}), nil)
	body := wd.get("/agent/commission/import/" + sampleImportID).Body.String()
	// reference and received are stored; the middle column is unmapped, so it is neither.
	if n := strings.Count(body, ">Auto<"); n != 2 {
		t.Errorf("%d columns marked Auto, want 2", n)
	}
	lacks(t, body, ">Manual<")

	// A posted selection that differs from the stored one is the advisor's own.
	form := url.Values{
		"op": {"map"}, "importId": {sampleImportID}, "version": {"4"}, "headerCount": {"3"},
		"col-0": {"reference"}, "col-1": {"traveler"}, "col-2": {""},
		"statementDate": {"2026-04-30"},
	}
	moved := wd.post("/agent/commission/import/"+sampleImportID, form).Body.String()
	has(t, moved, ">Manual<", ">Auto<")
}
