package money

import (
	"context"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// What app/(agent)/layout.tsx does before any agent page renders, and the frame every page
// in this sub-area shares: the §5 states around the page's own content.
//
// Every page file carries the same slots at the top of its <main>:
//
//	no-access  AdminNoAccess, in place of the page (an admin has no desk here)
//	page       the page column (PAGE_SX), holding the two below
//	retry      RetryState: a read failed. "Try again" is a link to this same URL
//	body       the page itself
//
// so a page fills exactly one of them and the others leave the tree. The trips and people
// sub-areas carry the same frame in their own files: each sub-area owns its files
// (docs/GO-MIGRATION.md Phase 5), so these are deliberate twins rather than one shared
// helper three sessions would be editing at once.

// frameSlots are the frame's own, added to every Spec in this package.
var frameSlots = []string{"no-access", "page", "retry", "retry-again", "body"}

// defaultZone is agentIdentity's fallback: platform_user.time_zone defaults to it, and an
// unrecognised IANA name falls back to it rather than failing the page.
const defaultZone = "America/Chicago"

// visit is what one request knows about its advisor.
type visit struct {
	st session.State
	// signedIn is false only when there is no session at all, which happens in local
	// development with no Supabase configured (the gate's skipAuth). Every read fails then,
	// as the Next app's do with authChecksDisabledForLocalDev, so the page shows RetryState.
	signedIn bool
	// noAccess: an admin, who gets AdminNoAccess in place of every agent page.
	noAccess bool
	// zoneName is the advisor's IANA zone, for the labels read off the clock rather than off
	// an accessor's as_of_date.
	zoneName string
	chrome   shell.Chrome
}

type identityRow struct {
	DisplayName *string `json:"display_name"`
	TimeZone    *string `json:"time_zone"`
}

// begin runs the (agent) layout's checks. done is true when it has already answered (a
// redirect); the handler returns at once.
func begin(w http.ResponseWriter, r *http.Request, d handlers.Deps) (v visit, done bool) {
	v.zoneName = defaultZone
	st, ok := session.From(r.Context())
	if !ok {
		// No gate state at all: the development server with no Supabase.
		v.chrome = shell.Chrome{Flash: web.TakeFlash(w, r, d.SecureCookies)}
		return v, false
	}
	if !st.SignedIn {
		web.SeeOther(w, r, web.SignInURL(r))
		return v, true
	}
	v.st, v.signedIn = st, true

	status := shell.LoadStatus(r.Context(), d.Supa, st.AccessToken, d.Log)
	switch dec := shell.AgentDecision(status); dec.Kind {
	case shell.Redirect:
		// A null status redirects to the CLIENT shell rather than rendering this one; that
		// asymmetry is the security property (lib/agent/role.ts).
		web.SeeOther(w, r, dec.To)
		return v, true
	case shell.Unauthorized:
		v.noAccess = true
	default:
		// Agent MFA is required and the server enforces it below aal2, so finish signing in
		// first rather than render a shell every read of which will refuse.
		if to := shell.AgentMFARedirect(st.AAL2, st.HasFactor); to != "" {
			web.SeeOther(w, r, to)
			return v, true
		}
		row, found, err := supa.MaybeOne[identityRow](r.Context(), d.Supa, st.AccessToken, "platform_user",
			supa.Q().Select("display_name,time_zone"))
		if err != nil {
			d.Log.Warn("agent identity read failed", "err", err)
		}
		if found {
			if row.DisplayName != nil {
				v.chrome.Initials = shell.AgentInitials(*row.DisplayName)
			}
			if row.TimeZone != nil && strings.TrimSpace(*row.TimeZone) != "" {
				v.zoneName = *row.TimeZone
			}
		}
	}
	v.chrome.Flash = web.TakeFlash(w, r, d.SecureCookies)
	return v, false
}

// canRead: there is an advisor to read as. An admin's page reads nothing (it renders
// AdminNoAccess), and with no session every read would fail anyway.
func (v visit) canRead() bool { return v.signedIn && !v.noAccess }

// state is which of the frame's states a page renders.
type state int

const (
	stateBody state = iota
	stateRetry
	stateNoAccess
)

// fillFrame fills the shell and the frame for st. It returns true when the body should be
// filled; otherwise the body has already left the tree.
func fillFrame(d *page.Doc, r *http.Request, v visit, st state) bool {
	shell.FillAgent(d, r.URL.Path, v.chrome)
	if v.noAccess {
		st = stateNoAccess
	}
	switch st {
	case stateNoAccess:
		d.Keep("no-access")
		d.Remove("page")
		return false
	case stateRetry:
		d.Remove("no-access")
		d.Keep("page")
		d.Keep("retry")
		// A plain reload of the same page: the reads run again.
		if !d.URL("retry-again", "href", r.URL.RequestURI()) {
			d.URL("retry-again", "href", r.URL.Path)
		}
		d.Remove("body")
		return false
	}
	d.Remove("no-access")
	d.Keep("page")
	d.Remove("retry")
	d.Keep("body")
	return true
}

// withFrame adds the frame's slots to a page's own.
func withFrame(slots ...string) []string {
	return append(append([]string{}, frameSlots...), slots...)
}

// renderState answers with one of the frame's states and nothing else. A failed read is a
// 503: it is an outage, and nothing that caches or indexes should keep it as the page.
func (a *app) renderState(w http.ResponseWriter, r *http.Request, tmpl *page.Template, v visit, st state) {
	doc := tmpl.New()
	fillFrame(doc, r, v, st)
	status := http.StatusOK
	if st == stateRetry {
		status = http.StatusServiceUnavailable
	}
	web.Render(w, a.d.Log, doc, status, web.Private)
}

// reads runs several agent reads at once, as Promise.all did, and reports the first failure.
type reads struct {
	ctx context.Context
	st  session.State
	sb  *supa.Client
	log *slog.Logger
	wg  sync.WaitGroup
	mu  sync.Mutex
	err error
}

func (a *app) reads(ctx context.Context, v visit) *reads {
	return &reads{ctx: ctx, st: v.st, sb: a.d.Supa, log: a.d.Log}
}

// read queues one named read into out. Call wait before using any result.
func read[T any](rs *reads, name string, args any, out *[]T) {
	rs.wg.Go(func() {
		rows, err := agentread.Call[T](rs.ctx, rs.sb, rs.st, name, args, rs.log)
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

func (rs *reads) wait() error {
	rs.wg.Wait()
	return rs.err
}

// parseIntJS is Number.parseInt(s, 10): leading whitespace, an optional sign, then as many
// digits as there are. ok is false where JS gives NaN.
func parseIntJS(s string) (int, bool) {
	s = strings.TrimLeft(s, " \t\n\r\f\v")
	neg := false
	if s != "" && (s[0] == '-' || s[0] == '+') {
		neg = s[0] == '-'
		s = s[1:]
	}
	i := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	if i == 0 {
		return 0, false
	}
	n, err := strconv.Atoi(s[:i])
	if err != nil {
		// Past int: JS still has a (huge) number, which the page cap turns into the last
		// page. Never a small one that would be accepted in its place.
		n = math.MaxInt
	}
	if neg {
		n = -n
	}
	return n, true
}

// itoa is strconv.Itoa under a shorter name, for the counts these pages print.
func itoa(n int) string { return strconv.Itoa(n) }

// textOrRemove fills a slot, or takes it out when there is nothing to say.
func textOrRemove(f interface {
	Text(slot, text string)
	Remove(slot string)
}, slot, text string) {
	if text == "" {
		f.Remove(slot)
		return
	}
	f.Text(slot, text)
}

// str reads an optional text column: a missing value is "", never "<nil>".
func str(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

// clock is time.Now, indirected so a test can pin the dates these pages read off it.
var clock = time.Now
