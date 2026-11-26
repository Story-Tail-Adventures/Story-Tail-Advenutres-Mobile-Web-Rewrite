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

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/clientaddr"
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
//	page       the page column (PAGE_SX), holding the rest
//	body       the view strip and the page header, which a failed read KEEPS
//	retry      RetryState: a read failed. "Try again" is a link to this same URL
//	content    what the reads fill, and the only part a failure takes away
//
// THE HEADER SURVIVES A FAILED READ, because the Next pages render it above RetryState
// rather than instead of it (commission/page.tsx, ledger/page.tsx): the Dashboard / Ledger /
// Statements / Forecast strip, the title, and Export and Add line with the current filters
// still on them. An advisor whose read fell over can still move somewhere else.
//
// The trips and people sub-areas carry a frame of their own in their own files: each
// sub-area owns its files (docs/GO-MIGRATION.md Phase 5), so these are deliberate twins
// rather than one shared helper three sessions would be editing at once.

// frameSlots are the frame's own, added to every Spec in this package.
var frameSlots = []string{"no-access", "page", "body", "retry", "retry-again", "content"}

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
		// NO FILTER, AND THAT IS DELIBERATE. platform_user carries a unique index on
		// account_id (initial.sql) and its only SELECT policy is
		// `account_id = auth.uid()` (auth_bridge.sql), so a signed-in visitor can see
		// exactly their own row and MaybeOne can never find a second. Adding an .Eq()
		// here would need the account id, which this request does not carry.
		//
		// This is the sub-area's ONLY PostgREST table read; everything else goes through
		// agentread, where the Postgres function scopes itself by current_agent_id(). The
		// test double applies eq. filters (harness_test.go's matching), so a read added
		// here later that forgets its filter will be caught.
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

// fillFrame fills the shell and the frame for st. It returns true when the CONTENT should be
// filled; otherwise the content has already left the tree. The page's own header slots are
// filled either way, so a caller fills them before asking.
func fillFrame(d *page.Doc, r *http.Request, v visit, st state) bool {
	shell.FillAgent(d, r.URL.Path, v.chrome)
	if v.noAccess {
		st = stateNoAccess
	}
	if st == stateNoAccess {
		d.Keep("no-access")
		d.Remove("page")
		return false
	}
	d.Remove("no-access")
	d.Keep("page")
	d.Keep("body")
	if st == stateRetry {
		d.Keep("retry")
		// A plain reload of the same page: the reads run again.
		if !d.URL("retry-again", "href", r.URL.RequestURI()) {
			d.URL("retry-again", "href", r.URL.Path)
		}
		d.Remove("content")
		return false
	}
	d.Remove("retry")
	d.Keep("content")
	return true
}

// withFrame adds the frame's slots to a page's own.
func withFrame(slots ...string) []string {
	return append(append([]string{}, frameSlots...), slots...)
}

// statusFor is the answer's status. A failed read is a 503: it is an outage, and nothing
// that caches or indexes should keep it as the page. (Next answers 200 with the same card;
// the words on the screen are identical either way.)
func statusFor(st state) int {
	if st == stateRetry {
		return http.StatusServiceUnavailable
	}
	return http.StatusOK
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

// call runs a function as the advisor, for a write: the visitor's own token, and their
// address for the functions that record it.
func (a *app) call(r *http.Request, v visit, name string, body any) api.Result {
	visitor, _ := clientaddr.From(r.Header)
	return a.d.API.Call(r.Context(), name, v.st.AccessToken,
		api.Input{Method: http.MethodPost, Body: body, Visitor: visitor})
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

// itoa64 prints a cents figure for a data attribute. bigint stays an integer all the way to
// the markup: a float64 on the way would round a figure the whole area is exact about.
func itoa64(n int64) string { return strconv.FormatInt(n, 10) }
