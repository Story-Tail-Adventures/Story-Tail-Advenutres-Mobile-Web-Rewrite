// Package server wires the HTTP handler: routes, security headers, the cross-origin check,
// request logging and panic recovery.
//
// It serves /healthz, the hashed assets under /assets/, the /functions/v1 registry (every name
// passed through to Supabase until it is ported), the five page areas, and a plain 404 for
// everything else. In development it adds /_styleguide and, with Supabase
// configured, the sign-in harness. Every route goes through gate.Router, so none can exist
// without choosing a gate.
package server

import (
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/auth"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/client"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/devauth"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/onboarding"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/styleguide"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/static"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// area is one page area: its page files and its routes. Each lives in its own package under
// internal/handlers, built by its own session; this list is the one place they are wired.
type area struct {
	name  string
	specs []page.Spec
	mount func(*gate.Router, handlers.Deps) error
}

var areas = []area{
	{"public", public.Specs, public.Mount},
	{"auth", auth.Specs, auth.Mount},
	{"onboarding", onboarding.Specs, onboarding.Mount},
	{"client", client.Specs, client.Mount},
	{"agent", agent.Specs, agent.Mount},
}

// CSP is the Content Security Policy every response carries, set strictly from day one
// because retrofitting one later is much harder. No inline script or style at all: the
// pre-paint scripts are files (webgo/assets/js), and the page loader refuses a page with an
// inline script, a <style>, a style="" or an on* handler at startup. img-src allows https: for
// the Unsplash photos the public pages use, and data: for the checkbox tick in ui.css.
const CSP = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self'; " +
	"img-src 'self' data: https:; " +
	"font-src 'self'; " +
	"connect-src 'self'; " +
	"object-src 'none'; " +
	"base-uri 'none'; " +
	"form-action 'self'; " +
	"frame-ancestors 'none'"

// New builds the whole handler. It loads and checks every page first, so a broken page file
// stops the server from starting.
func New(cfg config.Config, pagesFS, assetsFS fs.FS, log *slog.Logger) (http.Handler, error) {
	dev := cfg.Env == config.Development
	devAuth := dev && cfg.SupabaseConfigured()

	// Assets first: every page's <link>, <script>, <img> and <use> is pointed at a hashed
	// asset as it loads, and an unknown one stops the boot.
	assetSet, err := static.Build(assetsFS, static.Bundles)
	if err != nil {
		return nil, fmt.Errorf("building assets: %w", err)
	}

	var specs []page.Spec
	for _, a := range areas {
		specs = append(specs, a.specs...)
	}
	if dev {
		specs = append(specs, styleguide.Specs...)
	}
	if devAuth {
		specs = append(specs, devauth.Specs...)
	}
	set, err := page.LoadWith(pagesFS, page.Options{Assets: assetSet.Lookup}, specs...)
	if err != nil {
		return nil, fmt.Errorf("loading pages: %w", err)
	}

	sc := supa.New(cfg.SupabaseURL, cfg.SupabaseAnonKey, nil)
	// Secure everywhere but a local http:// server, where browsers would drop the cookie.
	secure := cfg.Env == config.Production || strings.HasPrefix(cfg.SiteURL, "https://")
	sessions := session.NewManager(sc, secure, log)

	mux := http.NewServeMux()
	rt := gate.NewRouter(mux, sessions, cfg.AuthChecksDisabledForLocalDev(), log)

	rt.Public("GET /healthz", http.HandlerFunc(healthz))
	// Hashed names only; reads no cookie and calls nothing.
	rt.Public("GET "+static.Prefix+"{path...}", assetSet)

	// The backend door. Public at the gate because it carries its own bearer token (mobile,
	// pg_cron) and never reads the session cookie.
	registry := api.New(api.Config{
		SupabaseURL: cfg.SupabaseURL,
		AnonKey:     cfg.SupabaseAnonKey,
		LeadFormKey: cfg.LeadFormKey,
		SearchToken: cfg.HotelSearchToken,
	}, nil, log)
	rt.Public("/functions/v1/{name}", registry)

	deps := handlers.Deps{
		Pages:         set,
		Supa:          sc,
		Sessions:      sessions,
		API:           registry,
		Config:        cfg,
		Log:           log,
		SecureCookies: secure,
	}
	for _, a := range areas {
		if err := a.mount(rt, deps); err != nil {
			return nil, fmt.Errorf("mounting the %s pages: %w", a.name, err)
		}
	}

	if dev {
		if err := styleguide.Mount(rt, set, log); err != nil {
			return nil, err
		}
	}
	// After the areas, so the harness steps aside from any route a real page has taken.
	if devAuth {
		if err := devauth.Mount(rt, set, sc, sessions, log); err != nil {
			return nil, err
		}
	}

	// Everything else, any method: a plain 404 that reads no cookie and calls nothing. Bots
	// probing /wp-login.php and /.env land here, and must cost next to nothing.
	rt.Public("/", http.HandlerFunc(notFound))

	var h http.Handler = mux
	h = http.NewCrossOriginProtection().Handler(h)
	h = securityHeaders(h, cfg.Env == config.Production)
	h = recoverPanics(h, log)
	h = logRequests(h, log)
	return h, nil
}

func healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte("ok\n"))
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte("Not found\n"))
}

// securityHeaders sets the headers every response carries, before the handler runs, so a
// 404, a 403 from the cross-origin check and a 500 all get them.
func securityHeaders(next http.Handler, production bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", CSP)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if production {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}

// recoverPanics turns a panic into a bare 500. The log line names the path, never the
// request body, a header value or the panic's arguments beyond their text.
func recoverPanics(next http.Handler, log *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v) // the server's own signal to drop the connection
				}
				// The panic's type and the stack, never its message: a message can carry
				// whatever value the handler was holding (a name, an address, a note).
				log.Error("handler panicked",
					"method", r.Method,
					"path", r.URL.Path,
					"panic_type", fmt.Sprintf("%T", v),
					"stack", string(debug.Stack()),
				)
				http.Error(w, "Something went wrong.", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// statusRecorder remembers the status and size for the request log.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	if s.status == 0 {
		s.status = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// logRequests writes one line per request: method, path, status, size, time. Never the
// query string (it can hold an email or a search), a body, a cookie or a header value.
func logRequests(next http.Handler, log *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if rec.status == 0 {
			rec.status = http.StatusOK
		}
		log.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"bytes", rec.bytes,
			"ms", time.Since(start).Milliseconds(),
		)
	})
}
