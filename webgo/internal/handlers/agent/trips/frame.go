package trips

import (
	"context"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/clientaddr"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// What app/(agent)/layout.tsx does before any agent page renders, and the frame every page
// in this sub-area shares: the four §5 states around the page's own content.
//
// Every page file carries the same four slots at the top of its <main>:
//
//	no-access  AdminNoAccess, in place of the page (an admin has no desk here)
//	page       the page column (PAGE_SX), holding the two below
//	retry      RetryState: a read failed. "Try again" is a link to this same URL
//	body       the page itself
//
// so a page fills exactly one of them and the others leave the tree.

// frameSlots are the four, added to every Spec in this package.
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
	loc      *time.Location
	chrome   shell.Chrome
	// here is the page's own GET URL when the request is a POST to a path nobody can load
	// (/agent/trips/{id}/stage): "Try again" and the sign-in return go there, never to the
	// POST path.
	here string
}

type identityRow struct {
	DisplayName *string `json:"display_name"`
	TimeZone    *string `json:"time_zone"`
}

// begin runs the (agent) layout's checks. done is true when it has already answered (a
// redirect); the handler returns at once.
func begin(w http.ResponseWriter, r *http.Request, d handlers.Deps) (v visit, done bool) {
	v.loc = zone("")
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
	dec := shell.AgentDecision(status)
	switch dec.Kind {
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
			if row.TimeZone != nil {
				v.loc = zone(*row.TimeZone)
			}
		}
	}
	v.chrome.Flash = web.TakeFlash(w, r, d.SecureCookies)
	return v, false
}

var (
	zoneMu    sync.Mutex
	zoneCache = map[string]*time.Location{} // only names that loaded: a bad one is never kept
)

// zone loads an IANA zone once, falling back to America/Chicago for an empty or unknown
// name (agentIdentity's `data?.time_zone || "America/Chicago"`, and partOfDayIn's trade).
func zone(name string) *time.Location {
	if strings.TrimSpace(name) == "" {
		name = defaultZone
	}
	zoneMu.Lock()
	defer zoneMu.Unlock()
	if loc, ok := zoneCache[name]; ok {
		return loc
	}
	if loc, err := time.LoadLocation(name); err == nil {
		zoneCache[name] = loc
		return loc
	}
	if loc, ok := zoneCache[defaultZone]; ok {
		return loc
	}
	if loc, err := time.LoadLocation(defaultZone); err == nil {
		zoneCache[defaultZone] = loc
		return loc
	}
	return time.UTC
}

// canRead: there is an advisor to read as. An admin's page reads nothing (it renders
// AdminNoAccess), and with no session every read would fail anyway.
func (v visit) canRead() bool { return v.signedIn && !v.noAccess }

// today is the advisor's calendar date, for screens whose read carries no as_of_date.
func (v visit) today() string { return time.Now().In(v.loc).Format("2006-01-02") }

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
		again := r.URL.RequestURI()
		if v.here != "" {
			again = v.here
		}
		if !d.URL("retry-again", "href", again) {
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

// call runs a function as the advisor, for a write.
func call(ctx context.Context, d handlers.Deps, r *http.Request, v visit, name string, body any) api.Result {
	visitor, _ := clientaddr.From(r.Header)
	return d.API.Call(ctx, name, v.st.AccessToken, api.Input{Method: http.MethodPost, Body: body, Visitor: visitor})
}

// signIn sends a visitor whose session ended mid-write to sign in, back to the page they were
// on (v.here when the request came to a POST-only path).
func signIn(w http.ResponseWriter, r *http.Request, v visit) {
	if v.here == "" {
		web.SeeOther(w, r, web.SignInURL(r))
		return
	}
	web.SeeOther(w, r, "/login?next="+url.QueryEscape(v.here))
}

// lf is a posted textarea's value as the Next app sent it: browsers post line breaks as CRLF,
// a textarea's value (what React read) has LF. A note saved untouched must stay a no-op.
func lf(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\r", "\n")
}

// outcome maps a function result the way these screens' server actions did:
// `call.kind === "rejected" ? (call.detail ?? fallback) : fallback`. The 409 and the
// sign-in case keep FromResult's meaning; an outage says the page's own sentence.
func outcome(res api.Result, fallback string) web.Outcome {
	out := web.FromResult(res, fallback)
	if !out.OK && !out.SignIn && out.Status == http.StatusServiceUnavailable {
		out.Message = fallback
	}
	return out
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
		// Past int: JS still has a (huge) number, which the function refuses. Never a
		// small one that would be accepted in its place.
		n = math.MaxInt
	}
	if neg {
		n = -n
	}
	return n, true
}

// parallel runs fns at once and waits, as the pages' Promise.all reads do.
func parallel(fns ...func()) {
	var wg sync.WaitGroup
	for _, f := range fns {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f()
		}()
	}
	wg.Wait()
}

var agentLayout = shell.Agent
