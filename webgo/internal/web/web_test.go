package web

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

func doc(t *testing.T) *page.Doc {
	t.Helper()
	fsys := fstest.MapFS{"p.html": {Data: []byte(`<!DOCTYPE html><html><head><title>T</title></head><body><p data-slot="greeting">Hi</p></body></html>`)}}
	set, err := page.Load(fsys, page.Spec{File: "p.html", Slots: []string{"greeting"}})
	if err != nil {
		t.Fatal(err)
	}
	tmpl, _ := set.Template("p.html")
	return tmpl.New()
}

func quiet() (*slog.Logger, *bytes.Buffer) {
	var b bytes.Buffer
	return slog.New(slog.NewJSONHandler(&b, nil)), &b
}

func TestRenderCacheHeaders(t *testing.T) {
	log, _ := quiet()
	for _, c := range []struct {
		name   string
		cache  Cache
		status int
		cookie bool
		want   string
	}{
		{"gated page", Private, 200, false, NoStore},
		{"public page", Shared, 200, false, PublicCacheControl},
		{"public 404 is not cached", Shared, 404, false, NoStore},
		{"public page that set a cookie", Shared, 200, true, NoStore},
	} {
		t.Run(c.name, func(t *testing.T) {
			d := doc(t)
			d.Text("greeting", "Hello")
			rec := httptest.NewRecorder()
			if c.cookie {
				http.SetCookie(rec, &http.Cookie{Name: "x", Value: "1"})
			}
			Render(rec, log, d, c.status, c.cache)
			if rec.Code != c.status {
				t.Errorf("status %d", rec.Code)
			}
			if got := rec.Header().Get("Cache-Control"); got != c.want {
				t.Errorf("Cache-Control = %q, want %q", got, c.want)
			}
			if rec.Header().Get("Content-Type") != "text/html; charset=utf-8" {
				t.Error("not HTML")
			}
		})
	}
}

func TestRenderSendsNothingOfABrokenPage(t *testing.T) {
	log, logs := quiet()
	d := doc(t) // "greeting" never filled
	rec := httptest.NewRecorder()
	Render(rec, log, d, http.StatusOK, Shared)
	if rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "Hi") {
		t.Errorf("a half-filled page got through: %d %q", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") != NoStore {
		t.Error("an error must not be cached")
	}
	if !strings.Contains(logs.String(), "greeting") {
		t.Error("the log should name the unfilled slot")
	}
}

var flashSaved = NewFlash("test.saved", "Your changes are saved.")

func TestFlashShowsOnceAndOnlyRegisteredText(t *testing.T) {
	rec := httptest.NewRecorder()
	SetFlash(rec, flashSaved, true)
	c := rec.Result().Cookies()[0]
	if c.Name != "__Host-sta-flash" || c.Value != "test.saved" || !c.HttpOnly || !c.Secure || c.Path != "/" || c.Domain != "" || c.SameSite != http.SameSiteLaxMode {
		t.Errorf("flash cookie = %+v", c)
	}
	if strings.Contains(c.Value, "saved.") {
		t.Error("the cookie must carry the key, never the sentence")
	}

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.AddCookie(c)
	rec2 := httptest.NewRecorder()
	if got := TakeFlash(rec2, req, true); got != "Your changes are saved." {
		t.Errorf("TakeFlash = %q", got)
	}
	if cleared := rec2.Result().Cookies(); len(cleared) != 1 || cleared[0].MaxAge >= 0 {
		t.Error("the flash cookie is not cleared after it shows")
	}

	// Chosen text in the cookie shows nothing.
	forged := httptest.NewRequest(http.MethodGet, "/x", nil)
	forged.AddCookie(&http.Cookie{Name: SecureFlashCookie, Value: "Call 555-0100 to verify your account"})
	if got := TakeFlash(httptest.NewRecorder(), forged, true); got != "" {
		t.Errorf("an unregistered flash showed %q", got)
	}
	if got := TakeFlash(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x", nil), true); got != "" {
		t.Error("no cookie, no flash")
	}
	// Without the prefix (a sibling subdomain's cookie) a secure server shows nothing.
	planted := httptest.NewRequest(http.MethodGet, "/x", nil)
	planted.AddCookie(&http.Cookie{Name: FlashCookie, Value: "test.saved"})
	if got := TakeFlash(httptest.NewRecorder(), planted, true); got != "" {
		t.Errorf("an unprefixed flash cookie showed %q on a secure server", got)
	}
	// A local http:// server cannot use __Host-, and reads the plain name.
	local := httptest.NewRecorder()
	SetFlash(local, flashSaved, false)
	if c := local.Result().Cookies()[0]; c.Name != FlashCookie || c.Secure {
		t.Errorf("local flash cookie = %+v", c)
	}
}

func TestNewFlashRefusesBadKeys(t *testing.T) {
	for _, key := range []string{"test.saved", "Bad Key", ""} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("NewFlash(%q) did not panic", key)
				}
			}()
			NewFlash(key, "x")
		}()
	}
}

func post(body, ctype string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/x?q=from-the-url", strings.NewReader(body))
	r.Header.Set("Content-Type", ctype)
	return r
}

func TestParseForm(t *testing.T) {
	v, err := ParseForm(httptest.NewRecorder(), post("name=Jordan&q=from-the-body", "application/x-www-form-urlencoded"))
	if err != nil {
		t.Fatal(err)
	}
	if v.Get("name") != "Jordan" || v.Get("q") != "from-the-body" {
		t.Errorf("values = %v", v)
	}

	for _, c := range []struct {
		name string
		r    *http.Request
		want int
	}{
		{"too big", post("note="+strings.Repeat("a", MaxFormBytes), "application/x-www-form-urlencoded"), http.StatusRequestEntityTooLarge},
		{"json", post(`{"a":1}`, "application/json"), http.StatusUnsupportedMediaType},
		{"no type", post("a=1", ""), http.StatusUnsupportedMediaType},
		{"a GET", httptest.NewRequest(http.MethodGet, "/x?a=1", nil), http.StatusMethodNotAllowed},
	} {
		rec := httptest.NewRecorder()
		if _, ok := Form(rec, c.r); ok || rec.Code != c.want {
			t.Errorf("%s: ok=%v status %d, want %d", c.name, ok, rec.Code, c.want)
		}
	}
}

func TestFromResult(t *testing.T) {
	outage := "Something went sideways on our end. Try again in a moment."
	for _, c := range []struct {
		name string
		res  api.Result
		want Outcome
	}{
		{"ok", api.Result{OK: true}, Outcome{OK: true}},
		{"signed out", api.Result{Kind: api.Unauthenticated}, Outcome{SignIn: true}},
		{"rejected with detail", api.Result{Kind: api.Rejected, Detail: "That trip has already started."},
			Outcome{Status: 422, Message: "That trip has already started."}},
		{"rejected without detail uses the page's sentence", api.Result{Kind: api.Rejected},
			Outcome{Status: 422, Message: "We couldn't save that."}},
		{"the optimistic lock", api.Result{Kind: api.Rejected, Detail: "This trip moved since you opened it.", Conflict: true},
			Outcome{Status: 409, Message: "This trip moved since you opened it.", Conflict: true}},
		{"unavailable", api.Result{Kind: api.Unavailable}, Outcome{Status: 503, Message: outage}},
	} {
		if got := FromResult(c.res, "We couldn't save that."); got != c.want {
			t.Errorf("%s: %+v, want %+v", c.name, got, c.want)
		}
	}
	if got := FromResult(api.Result{Kind: api.Rejected}, ""); got.Message != outage {
		t.Errorf("no detail and no fallback = %q", got.Message)
	}
}

func TestSignInURL(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/agent/trips/a%3Fb/notes?x=1", nil)
	if got := SignInURL(r); got != "/login?next=%2Fagent%2Ftrips%2Fa%253Fb%2Fnotes" {
		t.Errorf("SignInURL = %q", got)
	}
}

// Cases from web/lib/auth-errors.test.ts's mapAuthError.
func TestMapAuthError(t *testing.T) {
	for _, c := range []struct {
		code   string
		status int
		want   AuthErrorKind
	}{
		{"invalid_credentials", 400, InvalidCredentials},
		{"invalid_grant", 400, InvalidCredentials},
		{"email_not_confirmed", 400, EmailNotConfirmed},
		{"over_request_rate_limit", 429, RateLimited},
		{"over_email_send_rate_limit", 429, RateLimited},
		{"user_banned", 400, AccountLocked},
		{"weak_password", 422, WeakPassword},
		{"user_already_exists", 422, EmailTaken},
		{"email_exists", 422, EmailTaken},
		{"email_address_invalid", 400, EmailInvalid},
		{"signup_disabled", 422, NotConfigured},
		{"", 429, RateLimited},
		{"", 0, Network},
		{"", 401, InvalidCredentials},
		{"", 500, Unknown},
	} {
		if got := MapAuthError(c.code, c.status); got.Kind != c.want {
			t.Errorf("MapAuthError(%q, %d) = %s, want %s", c.code, c.status, got.Kind, c.want)
		}
	}
	if _, ok := AuthErrorFromParam("<script>"); ok {
		t.Error("an unknown ?error= value mapped to a message")
	}
	if m, ok := AuthErrorFromParam("rate_limited"); !ok || m.Kind != RateLimited {
		t.Error("a known ?error= value did not map")
	}
}

// Every sentence and action is web/lib/auth-errors.ts's, word for word, while web/ exists.
func TestAuthCopyMatchesTheWebApp(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "web", "lib", "auth-errors.ts"))
	if os.IsNotExist(err) {
		t.Skip("web/ is gone (Phase 6)")
	}
	if err != nil {
		t.Fatal(err)
	}
	ts := string(b)
	for kind, m := range authMessages {
		// Each kind's block in BY_KIND: from `kind: {` to the next `},` at the same depth.
		start := strings.Index(ts, "\n  "+string(kind)+": {")
		if start < 0 {
			t.Errorf("kind %s is not in auth-errors.ts", kind)
			continue
		}
		block := ts[start : start+strings.Index(ts[start:], "\n  },")]
		msg := regexp.MustCompile(`message:\s*"([^"]*)"`).FindStringSubmatch(block)
		if msg == nil || msg[1] != m.Message {
			t.Errorf("%s message = %q, auth-errors.ts has %v", kind, m.Message, msg)
		}
		act := regexp.MustCompile(`action:\s*\{\s*label:\s*"([^"]*)",\s*href:\s*"([^"]*)"`).FindStringSubmatch(block)
		switch {
		case act == nil && m.Action != nil:
			t.Errorf("%s has an action auth-errors.ts does not", kind)
		case act != nil && (m.Action == nil || m.Action.Label != act[1] || m.Action.Href != act[2]):
			t.Errorf("%s action = %+v, auth-errors.ts has %q %q", kind, m.Action, act[1], act[2])
		}
	}
	if n := strings.Count(ts[strings.Index(ts, "const BY_KIND"):strings.Index(ts, "export function mapAuthError")], "kind: \""); n != len(authMessages) {
		t.Errorf("auth-errors.ts has %d kinds, Go has %d", n, len(authMessages))
	}
}
