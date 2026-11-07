package people

import (
	"cmp"
	"context"
	"log/slog"
	"net/http"
	"sync"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// The (agent) layout's checks (app/(agent)/layout.tsx), run by every handler here before it
// reads or writes anything:
//
//  1. signed in (the gate has loaded the session; with none, sign in);
//  2. shell.LoadStatus + shell.AgentDecision: a null status or a client goes to /dashboard,
//     an admin gets the "no access" state inside the shell;
//  3. shell.AgentMFARedirect: an advisor below aal2 finishes signing in first;
//  4. the advisor's own platform_user row for the avatar's initials and the time zone every
//     date on these screens is read in (agentIdentity).

// visit is one request's advisor, after the checks.
type visit struct {
	st       session.State
	me       identity
	initials string
}

// app is this sub-area's handlers, with what they share.
type app struct {
	d            handlers.Deps
	noAccess     *page.Template
	failed       *page.Template
	worklist     *page.Template
	calendar     *page.Template
	clients      *page.Template
	clientNew    *page.Template
	clientEdit   *page.Template
	notFound     *page.Template
	clientDetail *page.Template
	merge        *page.Template
}

type identityRow struct {
	DisplayName *string `json:"display_name"`
	TimeZone    *string `json:"time_zone"`
}

// loadIdentity reads the advisor's own row, under RLS. A failed read falls back as Next's
// does (no name, Chicago): the greeting is wrong for a moment rather than the page missing.
func loadIdentity(ctx context.Context, sb *supa.Client, token string, log *slog.Logger) identity {
	row, _, err := supa.MaybeOne[identityRow](ctx, sb, token, "platform_user", supa.Q().Select("display_name,time_zone"))
	if err != nil {
		log.Warn("agent identity read failed", "err", err)
	}
	return identity{DisplayName: str(row.DisplayName), TimeZone: cmp.Or(str(row.TimeZone), defaultTimeZone)}
}

// guard runs the layout's checks. ok is false when it has already answered: a redirect, the
// no-access page, or an outage.
func (a *app) guard(w http.ResponseWriter, r *http.Request) (v visit, ok bool) {
	st, found := session.From(r.Context())
	if !found || !st.SignedIn || st.AccessToken == "" {
		// The gate sends a signed-out visitor to sign in before this runs; this covers the
		// local "auth checks off" mode, where no session was loaded at all.
		web.SeeOther(w, r, web.SignInURL(r))
		return v, false
	}
	status := shell.LoadStatus(r.Context(), a.d.Supa, st.AccessToken, a.d.Log)
	switch dec := shell.AgentDecision(status); dec.Kind {
	case shell.Redirect:
		web.SeeOther(w, r, dec.To)
		return v, false
	case shell.Unauthorized:
		a.renderNoAccess(w, r)
		return v, false
	}
	if to := shell.AgentMFARedirect(st.AAL2, st.HasFactor); to != "" {
		web.SeeOther(w, r, to)
		return v, false
	}
	me := loadIdentity(r.Context(), a.d.Supa, st.AccessToken, a.d.Log)
	return visit{st: st, me: me, initials: shell.AgentInitials(me.DisplayName)}, true
}

// chrome fills the agent shell for this page and takes the pending flash.
func (a *app) chrome(w http.ResponseWriter, r *http.Request, doc *page.Doc, v visit) {
	shell.FillAgent(doc, r.URL.Path, shell.Chrome{Initials: v.initials, Flash: web.TakeFlash(w, r, a.d.SecureCookies)})
}

// renderNoAccess is AdminNoAccess: an administrator has no desk on this side yet.
func (a *app) renderNoAccess(w http.ResponseWriter, r *http.Request) {
	doc := a.noAccess.New()
	shell.FillAgent(doc, r.URL.Path, shell.Chrome{})
	web.Render(w, a.d.Log, doc, http.StatusOK, web.Private)
}

// renderFailed is ErrorState inside the shell: a read failed, which is not an empty book.
// retry is RetryState's variant, whose way out is "Try again" (this same URL) rather than
// "Back to your trips".
func (a *app) renderFailed(w http.ResponseWriter, r *http.Request, v visit, retry bool) {
	doc := a.failed.New()
	a.chrome(w, r, doc, v)
	if retry {
		doc.URL("retry", "href", r.URL.RequestURI())
		doc.Remove("home")
	} else {
		doc.Remove("retry")
		doc.Keep("home")
	}
	web.Render(w, a.d.Log, doc, http.StatusServiceUnavailable, web.Private)
}

// reads runs several agent reads at once, as Promise.all did, and reports the first failure.
type reads struct {
	ctx context.Context
	a   *app
	v   visit
	wg  sync.WaitGroup
	mu  sync.Mutex
	err error
}

func (a *app) reads(ctx context.Context, v visit) *reads { return &reads{ctx: ctx, a: a, v: v} }

// read queues one named read into out. Call wait before using any result.
func read[T any](rs *reads, name string, args any, out *[]T) {
	rs.wg.Go(func() {
		rows, err := agentread.Call[T](rs.ctx, rs.a.d.Supa, rs.v.st, name, args, rs.a.d.Log)
		if err != nil {
			rs.mu.Lock()
			if rs.err == nil {
				rs.err = err
			}
			rs.mu.Unlock()
			return
		}
		*out = rows
	})
}

// agentreadCall is one named read on its own, as the visitor.
func agentreadCall[T any](ctx context.Context, a *app, v visit, name string, args any) ([]T, error) {
	return agentread.Call[T](ctx, a.d.Supa, v.st, name, args, a.d.Log)
}

func (rs *reads) wait() error {
	rs.wg.Wait()
	return rs.err
}
