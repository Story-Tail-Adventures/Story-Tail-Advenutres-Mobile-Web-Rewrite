package public_test

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/server"
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

// The Go replacement for .github/scripts/check_public_prerender.py (docs/GO-MIGRATION.md
// §4.7). Next proved a page static from its prerender manifest; here every cached public URL
// is fetched through the whole server, the way Cloudflare would, and must answer 200 with the
// public cache header, set no cookie, and cost no call to Supabase.
func TestPublicPagesAreCacheableAndCallNothing(t *testing.T) {
	for _, env := range []config.Env{config.Development, config.Production} {
		t.Run(string(env), func(t *testing.T) {
			rec := &outbound{}
			supa := httptest.NewServer(rec)
			t.Cleanup(supa.Close)
			cfg := config.Config{Env: env, Port: "8080", SiteURL: "https://app.story-tail.com",
				SupabaseURL: supa.URL, SupabaseAnonKey: "anon"}
			h, err := server.New(cfg, pages.FS, assets.FS, slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil)))
			if err != nil {
				t.Fatal(err)
			}
			for _, path := range public.CachedPaths(content.Get()) {
				w := httptest.NewRecorder()
				h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
				res := w.Result()
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
			if len(rec.calls) > 0 {
				t.Errorf("public pages called Supabase: %v", rec.calls)
			}
		})
	}
}

// An unknown slug is the public not-found page, 404 and never cached, as Next's
// `dynamicParams = false` made it.
func TestUnknownSlugIsANotFoundPage(t *testing.T) {
	cfg := config.Config{Env: config.Development, Port: "8080", SiteURL: "http://localhost:8080"}
	h, err := server.New(cfg, pages.FS, assets.FS, slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil)))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/legal/nope", "/legal/PRIVACY"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
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
