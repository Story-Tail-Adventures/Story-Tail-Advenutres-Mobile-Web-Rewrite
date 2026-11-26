// Package server wires the HTTP handler: routes, security headers, the cross-origin check,
// request logging and panic recovery.
//
// Phase 1 (docs/GO-MIGRATION.md §8) serves /healthz, the /functions/v1 registry (every name
// passed through to Supabase), and a plain 404 for everything else. In development it adds
// the /_demo page and, with Supabase configured, the sign-in harness. Every route goes
// through gate.Router, so none can exist without choosing a gate.
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
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/demo"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/devauth"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// CSP is the Content Security Policy every response carries, set strictly from day one
// because retrofitting one later is much harder. No inline script or style at all yet; the
// theme pre-paint script joins script-src by its hash in Phase 2. img-src allows https: for
// the Unsplash photos the public pages use.
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
func New(cfg config.Config, pagesFS fs.FS, log *slog.Logger) (http.Handler, error) {
	dev := cfg.Env == config.Development
	devAuth := dev && cfg.SupabaseConfigured()

	var specs []page.Spec
	if dev {
		specs = append(specs, demo.Spec)
	}
	if devAuth {
		specs = append(specs, devauth.Specs...)
	}
	set, err := page.Load(pagesFS, specs...)
	if err != nil {
		return nil, fmt.Errorf("loading pages: %w", err)
	}

	auth := supa.New(cfg.SupabaseURL, cfg.SupabaseAnonKey, nil)
	// Secure everywhere but a local http:// server, where browsers would drop the cookie.
	secure := cfg.Env == config.Production || strings.HasPrefix(cfg.SiteURL, "https://")
	sessions := session.NewManager(auth, secure, log)

	mux := http.NewServeMux()
	rt := gate.NewRouter(mux, sessions, cfg.AuthChecksDisabledForLocalDev(), log)

	rt.Public("GET /healthz", http.HandlerFunc(healthz))

	// The backend door. Public at the gate because it carries its own bearer token (mobile,
	// pg_cron) and never reads the session cookie.
	rt.Public("/functions/v1/{name}", api.New(api.Config{
		SupabaseURL: cfg.SupabaseURL,
		AnonKey:     cfg.SupabaseAnonKey,
		LeadFormKey: cfg.LeadFormKey,
		SearchToken: cfg.HotelSearchToken,
	}, nil, log))

	if dev {
		h, err := demo.Handler(set, log)
		if err != nil {
			return nil, err
		}
		rt.Public("GET /_demo", h)
	}
	if devAuth {
		if err := devauth.Mount(rt, set, auth, sessions, log); err != nil {
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
