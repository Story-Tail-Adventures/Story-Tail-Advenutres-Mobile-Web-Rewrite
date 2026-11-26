package edge

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

func TestDecodeClaims(t *testing.T) {
	enc := base64.RawURLEncoding.EncodeToString
	if v := decodeClaims("h." + enc([]byte(`{"aal":"aal2","amr":[]}`)) + ".s"); v.Get("aal").IsUndefined() {
		t.Error("claims not read")
	}
	for _, bad := range []string{"", "onlyone", "h..s", "h.!!!.s", "h." + enc([]byte("not json")) + ".s"} {
		if v := decodeClaims(bad); !v.IsPlainObject() || v.Get("aal").Kind() != js.Undefined {
			t.Errorf("%q should read as {}", bad)
		}
	}
}

func TestReadObjectRefusesWithTheModulesSentence(t *testing.T) {
	for _, body := range []string{"", "null", "[]", "1", "{", `"x"`} {
		r := httptest.NewRequest("POST", "/", strings.NewReader(body))
		_, err := ReadObject(r, SendJSONObject)
		p, ok := problem.As(err)
		if !ok || p.Status != 400 || p.Detail != "Send a JSON object." {
			t.Errorf("%q: %v", body, err)
		}
	}
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"op":"x"}`))
	v, err := ReadObject(r, ExpectedJSONObject)
	if s, _ := v.Get("op").Str(); err != nil || s != "x" {
		t.Errorf("good body: %v %v", v, err)
	}
}

func TestWriteJSONIsJSONStringify(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSON(rec, slog.New(slog.NewJSONHandler(io.Discard, nil)), "f", "", &Reply{Status: 201,
		Body: js.O("note", "<b>&", "n", 1), Header: http.Header{"Cache-Control": {"no-store"}}})
	if rec.Code != 201 || rec.Body.String() != `{"note":"<b>&","n":1}` || rec.Header().Get("Cache-Control") != "no-store" ||
		rec.Header().Get("Vary") != "Origin" {
		t.Errorf("%d %s %v", rec.Code, rec.Body, rec.Header())
	}
}

func TestProblemShape(t *testing.T) {
	cases := []struct {
		err  error
		code int
		body string
	}{
		{problem.Conflict("This trip changed since you opened it. Reload and try again."), 409,
			`{"type":"about:blank","title":"Conflict","status":409,"detail":"This trip changed since you opened it. Reload and try again."}`},
		{problem.New(429, "Too Many Requests", ""), 429, `{"type":"about:blank","title":"Too Many Requests","status":429}`},
		{fmt.Errorf("x failed: %w", &service.Error{Code: "22P02", Message: `invalid input syntax for type uuid: "banana"`}), 500,
			`{"type":"about:blank","title":"Internal Server Error","status":500}`},
	}
	for _, c := range cases {
		var logs bytes.Buffer
		rec := httptest.NewRecorder()
		WriteProblem(rec, slog.New(slog.NewJSONHandler(&logs, nil)), "f", "", c.err)
		if rec.Code != c.code || rec.Body.String() != c.body || rec.Header().Get("Content-Type") != "application/problem+json" {
			t.Errorf("%v: %d %s", c.err, rec.Code, rec.Body)
		}
		if strings.Contains(logs.String(), "banana") {
			t.Errorf("a 500 logged an input value: %s", logs.String())
		}
		if c.code == 500 && !strings.Contains(logs.String(), `"db_code":"22P02"`) {
			t.Errorf("a 500 should log the database code: %s", logs.String())
		}
	}
	p := problem.New(429, "Too Many Requests", "Slow down.")
	p.Header = http.Header{"Retry-After": {"30"}}
	rec := httptest.NewRecorder()
	WriteProblem(rec, slog.New(slog.NewJSONHandler(io.Discard, nil)), "f", "", p)
	if rec.Header().Get("Retry-After") != "30" {
		t.Error("Retry-After not sent")
	}
}

func TestCronSecret(t *testing.T) {
	r := httptest.NewRequest("POST", "/", nil)
	r.Header.Set("Authorization", "Bearer s3cret-value")
	if !CronSecretOK(r, "s3cret-value") || CronSecretOK(r, "other") || CronSecretOK(r, "") {
		t.Error("cron secret comparison wrong")
	}
	r.Header.Set("Authorization", "bearer s3cret-value")
	if CronSecretOK(r, "s3cret-value") {
		t.Error("the scheme is case-sensitive, as requireUser's was")
	}
}

func TestLogLabelFindsTheDatabaseError(t *testing.T) {
	err := errors.Join(fmt.Errorf("a: %w", &service.Error{Code: "P0001", Status: 400}))
	got := fmt.Sprint(logLabel(err))
	if !strings.Contains(got, "a") {
		t.Errorf("%s", got)
	}
}
