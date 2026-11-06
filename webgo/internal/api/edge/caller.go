package edge

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/clientaddr"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// verified is what the gate learned from GoTrue: whose token this is.
type verified struct {
	userID string
	jwt    string
}

// bearer reads `Authorization: Bearer <jwt>` exactly as requireUser did (case-sensitive).
func bearer(r *http.Request) (string, bool) {
	a := r.Header.Get("Authorization")
	if !strings.HasPrefix(a, "Bearer ") {
		return "", false
	}
	return a[len("Bearer "):], true
}

// Verify is the gate for a user route: what verify_jwt and the first half of requireUser
// did. A missing bearer token is 401 "Missing bearer token."; a token GoTrue refuses (or
// cannot check: supabase-js answered a network failure the same way) is 401 "Invalid or
// expired token.". On success the request carries the verified user, and RequireUser makes
// no second GoTrue call.
func Verify(d *Deps, r *http.Request) (*http.Request, error) {
	jwt, ok := bearer(r)
	if !ok {
		return nil, problem.Unauthorized("Missing bearer token.")
	}
	u, err := d.Auth.GetUser(r.Context(), jwt, supa.Caller{})
	if err != nil {
		return nil, problem.Unauthorized("Invalid or expired token.")
	}
	return r.WithContext(context.WithValue(r.Context(), verifiedKey, verified{userID: u.ID, jwt: jwt})), nil
}

// secondFactorMethods are the amr methods that are a SECOND factor. The first factor is
// "password" (or the OAuth provider); it must never satisfy requireRecentMfa.
var secondFactorMethods = map[string]bool{"totp": true, "mfa/totp": true, "phone": true, "mfa/sms": true, "webauthn": true}

type platformUserRow struct {
	ID       string          `json:"id"`
	Role     string          `json:"role"`
	AgentID  *string         `json:"agent_id"`
	ClientID *string         `json:"client_id"`
	Account  json.RawMessage `json:"account"`
}

type accountRow struct {
	LockedAt *string `json:"locked_at"`
}

// RequireUser is requireUser: the verified caller resolved to their platform_user row.
//
// 401 "Could not resolve the caller." when the lookup fails; 403 "This account has no
// platform user." when there is no row; 403 "This account is on hold." when the account is
// locked (§3.9.5: the second wall, in our own data, behind GoTrue's ban). aal and amr are
// read from the token's claims only AFTER GoTrue accepted it.
func RequireUser(d *Deps, r *http.Request) (*caller.Context, error) {
	v, ok := r.Context().Value(verifiedKey).(verified)
	if !ok {
		// Mounted without the user gate: check here rather than trust nothing.
		vr, err := Verify(d, r)
		if err != nil {
			return nil, err
		}
		v = vr.Context().Value(verifiedKey).(verified)
	}

	var pu platformUserRow
	found, err := d.DB.From("platform_user").
		Select("id, role, agent_id, client_id, account:account_id(locked_at)").
		Eq("account_id", v.userID).
		MaybeSingle(r.Context(), &pu)
	if err != nil {
		return nil, problem.Unauthorized("Could not resolve the caller.")
	}
	if !found {
		return nil, problem.Forbidden("This account has no platform user.")
	}
	if lockedAt(pu.Account) {
		return nil, problem.Forbidden("This account is on hold.")
	}

	claims := decodeClaims(v.jwt)
	c := &caller.Context{
		AccountID:      v.userID,
		PlatformUserID: pu.ID,
		Role:           pu.Role,
		AgentID:        pu.AgentID,
		ClientID:       pu.ClientID,
		AAL:            "aal1",
	}
	if s, _ := claims.Get("aal").Str(); s == "aal2" {
		c.AAL = "aal2"
	}
	if amr, ok := claims.Get("amr").Array(); ok {
		var best float64
		have := false
		for _, e := range amr {
			m, isStr := e.Get("method").Str()
			ts, isNum := e.Get("timestamp").Num()
			if isStr && secondFactorMethods[m] && isNum && (!have || ts > best) {
				best, have = ts, true
			}
		}
		if have && best != 0 { // `secondFactor ? ... : null`: 0 is falsy
			at := time.UnixMilli(int64(best * 1000)).UTC()
			c.SecondFactorAt = &at
		}
	}
	if addr, ok := clientaddr.From(r.Header); ok {
		c.IP = &addr
	}
	if _, ok := r.Header["User-Agent"]; ok {
		ua := r.Header.Get("User-Agent")
		c.UserAgent = &ua
	}
	return c, nil
}

// lockedAt reads account.locked_at from the embedded resource, which PostgREST returns as an
// object (or, for a to-many shape, an array).
func lockedAt(raw json.RawMessage) bool {
	var a accountRow
	if json.Unmarshal(raw, &a) == nil {
		return a.LockedAt != nil
	}
	var arr []accountRow
	if json.Unmarshal(raw, &arr) == nil && len(arr) > 0 {
		return arr[0].LockedAt != nil
	}
	return false
}

// decodeClaims reads a JWT's payload without checking it: only ever called on a token
// GoTrue has already accepted, for the aal and amr claims getUser does not return. Anything
// unreadable is an empty object, as the Deno version's catch returned {}.
func decodeClaims(jwt string) js.Value {
	parts := strings.Split(jwt, ".")
	if len(parts) < 2 || parts[1] == "" {
		return js.ObjectValue()
	}
	p := strings.NewReplacer("-", "+", "_", "/").Replace(parts[1])
	if pad := len(p) % 4; pad != 0 {
		p += strings.Repeat("=", 4-pad)
	}
	b, err := base64.StdEncoding.DecodeString(p)
	if err != nil {
		return js.ObjectValue()
	}
	v, err := js.Parse(b)
	if err != nil {
		return js.ObjectValue()
	}
	return v
}

// CronSecretOK checks `Authorization: Bearer <STA_CRON_SECRET>` in constant time (ruling 13).
// An unset secret refuses everything.
func CronSecretOK(r *http.Request, secret string) bool {
	if secret == "" {
		return false
	}
	got, ok := bearer(r)
	if !ok {
		return false
	}
	return constantTimeEqual(got, secret)
}
