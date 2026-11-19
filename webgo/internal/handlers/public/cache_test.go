package public_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/server"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// outbound records every request that reaches "Supabase". A public page must make none.
type outbound struct {
	mu    sync.Mutex
	calls []string
}

func (o *outbound) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	o.mu.Lock()
	o.calls = append(o.calls, r.Method+" "+r.URL.Path)
	o.mu.Unlock()
	w.WriteHeader(http.StatusTeapot)
}

func (o *outbound) taken() []string {
	o.mu.Lock()
	defer o.mu.Unlock()
	out := o.calls
	o.calls = nil
	return out
}

// publicServer builds the whole server with a fake Supabase that records any call.
func publicServer(t *testing.T, env config.Env) (http.Handler, *outbound) {
	t.Helper()
	rec := &outbound{}
	supa := httptest.NewServer(rec)
	t.Cleanup(supa.Close)
	cfg := config.Config{Env: env, Port: "8080", SiteURL: "https://app.story-tail.com",
		SupabaseURL: supa.URL, SupabaseAnonKey: "anon"}
	h, err := server.New(cfg, pages.FS, assets.FS, slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return h, rec
}

// sessionCookie builds the cookie value session.Manager stores, so Load gets past decoding
// and actually asks GoTrue about the token. A value it cannot decode is cleared without a
// network call, which would make the front-door test pass for the wrong reason.
func sessionCookie() string {
	raw, _ := json.Marshal(map[string]any{
		"a": "an-access-token",
		"r": "a-refresh-token",
		"e": time.Now().Add(time.Hour).Unix(),
	})
	return base64.RawURLEncoding.EncodeToString(raw)
}

// fetch gets path, carrying a session cookie when one is given.
func fetch(h http.Handler, path, sessionCookie string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	if sessionCookie != "" {
		r.AddCookie(&http.Cookie{Name: session.CookieName, Value: sessionCookie})
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

// The Go replacement for .github/scripts/check_public_prerender.py (docs/GO-MIGRATION.md
// §4.7). Next proved a page static from its prerender manifest; here every cached public URL
// is fetched through the whole server, the way Cloudflare would, and must answer 200 with the
// public cache header, set no cookie, and cost no call to Supabase.
func TestPublicPagesAreCacheableAndCallNothing(t *testing.T) {
	for _, env := range []config.Env{config.Development, config.Production} {
		t.Run(string(env), func(t *testing.T) {
			h, rec := publicServer(t, env)
			for _, path := range public.CachedPaths(content.Get()) {
				res := fetch(h, path, "").Result()
				if res.StatusCode != http.StatusOK {
					t.Errorf("%s: status %d", path, res.StatusCode)
				}
				if got := res.Header.Get("Cache-Control"); got != web.PublicCacheControl {
					t.Errorf("%s: Cache-Control %q, want %q", path, got, web.PublicCacheControl)
				}
				if c := res.Header.Values("Set-Cookie"); len(c) > 0 {
					t.Errorf("%s: sets a cookie on a cached page: %v", path, c)
				}
			}
			if calls := rec.taken(); len(calls) > 0 {
				t.Errorf("public pages called Supabase: %v", calls)
			}
		})
	}
}

// The test above fetches with no cookie, so on its own it cannot tell a page that ignores the
// visitor from one that quietly reads them: a handler that called Supabase only when a
// session cookie was present would pass it. So every cached page is fetched a second time
// with a session cookie and must answer exactly the same bytes, with the same header, and
// still call nothing.
//
// The front door is the one exception and is checked on its own below: rt.FrontDoor consults
// GoTrue for a cookie-bearing request by design.
func TestCachedPagesIgnoreTheVisitorsCookie(t *testing.T) {
	h, rec := publicServer(t, config.Production)
	for _, path := range public.CachedPaths(content.Get()) {
		if path == "/" {
			continue
		}
		anon := fetch(h, path, "")
		if calls := rec.taken(); len(calls) > 0 {
			t.Fatalf("%s: called Supabase with no cookie: %v", path, calls)
		}
		withCookie := fetch(h, path, sessionCookie())
		if calls := rec.taken(); len(calls) > 0 {
			t.Errorf("%s: reads the session cookie and calls Supabase: %v", path, calls)
		}
		if got := withCookie.Header().Get("Cache-Control"); got != web.PublicCacheControl {
			t.Errorf("%s: Cache-Control %q with a cookie, want %q", path, got, web.PublicCacheControl)
		}
		if c := withCookie.Header().Values("Set-Cookie"); len(c) > 0 {
			t.Errorf("%s: sets a cookie: %v", path, c)
		}
		if !bytes.Equal(anon.Body.Bytes(), withCookie.Body.Bytes()) {
			t.Errorf("%s: renders differently for a visitor carrying a session cookie", path)
		}
	}
}

// The front door is mounted with rt.FrontDoor, so a cookie-bearing request goes through
// GoTrue and could have been a 303 to /dashboard. That answer is this visitor's, so it must
// never be stored by a shared cache; the anonymous one still is.
func TestTheFrontDoorIsOnlyCachedForVisitorsWithNoSession(t *testing.T) {
	h, rec := publicServer(t, config.Production)

	anon := fetch(h, "/", "")
	if got := anon.Header().Get("Cache-Control"); got != web.PublicCacheControl {
		t.Errorf("anonymous /: Cache-Control %q, want %q", got, web.PublicCacheControl)
	}
	if calls := rec.taken(); len(calls) > 0 {
		t.Errorf("anonymous / called Supabase: %v", calls)
	}
	if got := anon.Header().Get("Vary"); got != "Cookie" {
		t.Errorf("anonymous /: Vary %q, want Cookie", got)
	}

	withCookie := fetch(h, "/", sessionCookie())
	if got := withCookie.Header().Get("Cache-Control"); got != web.NoStore {
		t.Errorf("/ with a session cookie: Cache-Control %q, want %q", got, web.NoStore)
	}
	if got := withCookie.Header().Get("Vary"); got != "Cookie" {
		t.Errorf("/ with a session cookie: Vary %q, want Cookie", got)
	}
	if calls := rec.taken(); len(calls) == 0 {
		t.Error("/ with a session cookie did not check the session at all")
	}
}

// An unknown slug is the public not-found page, 404 and never cached, as Next's
// `dynamicParams = false` made it.
func TestUnknownSlugIsANotFoundPage(t *testing.T) {
	h, _ := publicServer(t, config.Development)
	for _, path := range []string{"/legal/nope", "/legal/PRIVACY"} {
		w := fetch(h, path, "")
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", path, w.Code)
		}
		if !bytes.Contains(w.Body.Bytes(), []byte("We can&#39;t find that page.")) {
			t.Errorf("%s: not the public not-found page", path)
		}
		if got := w.Header().Get("Cache-Control"); got != web.NoStore {
			t.Errorf("%s: a 404 is cached: %q", path, got)
		}
	}
}
