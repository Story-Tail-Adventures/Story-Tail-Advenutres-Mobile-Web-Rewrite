// Package devauth is a development-only sign-in harness: /login, /dashboard and
// /account/sign-out on their real paths and real gates, so the session cookie, the refresh,
// the chrome flag and every gate rule can be exercised against the local Supabase stack
// before Phase 3 builds the real screens. It is mounted only when STA_ENV=development and
// Supabase is configured, and Phases 3 and 4 delete it.
package devauth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Layout is the shared frame.
var Layout = &page.Layout{File: "layout/base.html"}

// Specs are the two dev pages.
var Specs = []page.Spec{
	{File: "dev/login.html", Layout: Layout, Slots: []string{"error", "next", "email"}},
	{File: "dev/dashboard.html", Layout: Layout, Slots: []string{"email", "user-id", "assurance"}},
}

// SignIn is the part of GoTrue the harness needs (*supa.Client).
type SignIn interface {
	SignInWithPassword(ctx context.Context, email, password string, who supa.Caller) (supa.Tokens, error)
}

// Sessions is the part of the session manager the harness needs (*session.Manager).
type Sessions interface {
	Start(w http.ResponseWriter, t supa.Tokens)
	End(w http.ResponseWriter, r *http.Request)
}

// Mount registers the harness on rt.
func Mount(rt *gate.Router, set *page.Set, auth SignIn, sessions Sessions, log *slog.Logger) error {
	login, err := set.Template("dev/login.html")
	if err != nil {
		return err
	}
	dash, err := set.Template("dev/dashboard.html")
	if err != nil {
		return err
	}

	renderLogin := func(w http.ResponseWriter, status int, errText, email, next string) {
		d := login.New()
		if errText == "" {
			d.Remove("error")
		} else {
			d.Text("error", errText)
		}
		d.Attr("next", "value", next)
		d.Attr("email", "value", email)
		write(w, log, d, status)
	}

	rt.AuthOnly("GET /login", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		renderLogin(w, http.StatusOK, "", "", gate.SafeNext(r.URL.Query().Get("next"), "/dashboard"))
	}))

	rt.AuthOnly("POST /login", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		email, next := r.PostForm.Get("email"), gate.SafeNext(r.PostForm.Get("next"), "/dashboard")
		tok, err := auth.SignInWithPassword(r.Context(), email, r.PostForm.Get("password"), session.Who(r))
		switch {
		case errors.Is(err, supa.ErrInvalidCredentials):
			renderLogin(w, http.StatusUnprocessableEntity, "That email and password don't match.", email, next)
			return
		case err != nil:
			log.Warn("dev sign-in unavailable", "err", err) // never the email or password
			renderLogin(w, http.StatusServiceUnavailable, "We couldn't reach sign-in just now. Please try again in a moment.", email, next)
			return
		}
		sessions.Start(w, tok)
		http.Redirect(w, r, next, http.StatusSeeOther)
	}))

	rt.Protected("GET /dashboard", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, _ := session.From(r.Context())
		d := dash.New()
		d.Text("email", st.User.Email)
		d.Text("user-id", st.User.ID)
		d.Text("assurance", gate.AssuranceOf(st).String())
		write(w, log, d, http.StatusOK)
	}))

	rt.Protected("POST /account/sign-out", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessions.End(w, r)
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	}))
	return nil
}

func write(w http.ResponseWriter, log *slog.Logger, d *page.Doc, status int) {
	body, err := d.Bytes()
	if err != nil {
		log.Error("dev page did not render", "err", err)
		http.Error(w, "Something went wrong.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
