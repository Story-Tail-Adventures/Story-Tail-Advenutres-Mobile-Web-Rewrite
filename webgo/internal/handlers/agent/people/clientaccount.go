package people

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// §3.9 / §3.3 Account admin, the client page's seventh tab: ports of
// web/lib/agent/accountAdminView.ts, accountAdmin.ts, ClientAccountAdminTab and
// accountAdminAction. Every action is account-admin, which re-checks a RECENT two-step
// sign-in (requireRecentMfa); below aal2 the read answers {needsMfa} and the tab is a gate
// that links to the MFA challenge (or setup) and back here.

// readOne is a named read that answers ONE jsonb value rather than rows
// (agent_client_account_admin, agent_client_merge_view). agentread.Call decodes rows only, so
// this keeps its two rules (a fixed name from agentread.Names, the visitor's own token) for
// the single-object reads. The PR lists agentread.CallOne as the change that retires it.
func readOne[T any](ctx context.Context, a *app, v visit, name string, args any, out *T) error {
	if !slices.Contains(agentread.Names, name) {
		return fmt.Errorf("people: %q is not a known read", name)
	}
	if !v.st.SignedIn || v.st.AccessToken == "" {
		return agentread.ErrUnauthenticated
	}
	raw, err := supa.RPC[json.RawMessage](ctx, a.d.Supa, v.st.AccessToken, name, args)
	if err != nil {
		code := ""
		var se *supa.Error
		if errors.As(err, &se) {
			code = se.Code
		}
		a.d.Log.Warn("agent read failed", "read", name, "code", code)
		return fmt.Errorf("%w: %s", agentread.ErrUnavailable, name)
	}
	if t := bytes.TrimSpace(raw); len(t) > 0 && t[0] == '[' {
		// A set-returning shape: take its first row (Next's `Array.isArray(raw) ? raw[0]`).
		var rows []json.RawMessage
		if json.Unmarshal(t, &rows) != nil {
			return fmt.Errorf("%w: %s", agentread.ErrUnavailable, name)
		}
		if len(rows) == 0 {
			raw = json.RawMessage("null")
		} else {
			raw = rows[0]
		}
	}
	if err := json.Unmarshal(raw, out); err != nil {
		a.d.Log.Warn("agent read did not decode", "read", name)
		return fmt.Errorf("%w: %s", agentread.ErrUnavailable, name)
	}
	return nil
}

// accountRow is agent_client_account_admin's jsonb (AccountAdminRow). Present is false for a
// null answer: no such client for this advisor.
type accountRow struct {
	Present              bool    `json:"-"`
	NeedsMfa             bool    `json:"needsMfa"`
	AgentHasFactor       bool    `json:"agentHasFactor"`
	FirstName            *string `json:"firstName"`
	ClientEmail          *string `json:"clientEmail"`
	ClientArchived       bool    `json:"clientArchived"`
	DuplicateEmail       bool    `json:"duplicateEmail"`
	DuplicateClientID    *string `json:"duplicateEmailClientId"`
	SignInEmailsLastHour int64   `json:"signInEmailsLastHour"`
	HasSignIn            bool    `json:"hasSignIn"`
	AgentTimeZone        *string `json:"agentTimeZone"`
	SignInEmail          *string `json:"signInEmail"`
	EmailVerifiedAt      *string `json:"emailVerifiedAt"`
	InvitedAt            *string `json:"invitedAt"`
	HasPassword          bool    `json:"hasPassword"`
	Providers            []string
	MfaEnrolled          bool    `json:"mfaEnrolled"`
	LockedAt             *string `json:"lockedAt"`
	LockedReason         *string `json:"lockedReason"`
	BannedUntil          *string `json:"bannedUntil"`
	DuplicateSignInEmail bool    `json:"duplicateSignInEmail"`
	LastLoginAt          *string `json:"lastLoginAt"`
	Sessions             []struct {
		ID           string  `json:"id"`
		LastActiveAt string  `json:"lastActiveAt"`
		UserAgent    *string `json:"userAgent"`
		IP           *string `json:"ip"`
	} `json:"sessions"`
	Activity []struct {
		ID        string  `json:"id"`
		At        string  `json:"at"`
		UserAgent *string `json:"userAgent"`
		IP        *string `json:"ip"`
		Flagged   bool    `json:"flagged"`
	} `json:"activity"`
}

// UnmarshalJSON records whether the answer was an object at all.
func (r *accountRow) UnmarshalJSON(b []byte) error {
	if bytes.Equal(bytes.TrimSpace(b), []byte("null")) {
		*r = accountRow{}
		return nil
	}
	type plain accountRow
	var p struct {
		plain
		Providers []string `json:"providers"`
	}
	if err := json.Unmarshal(b, &p); err != nil {
		return err
	}
	*r = accountRow(p.plain)
	r.Providers = p.Providers
	r.Present = true
	return nil
}

func (r accountRow) missing() bool { return !r.Present }

// signInEmailsPerHour is SIGN_IN_EMAILS_PER_HOUR.
const signInEmailsPerHour = 3

type accountSession struct{ Device, IP, LastActive string }
type accountSignIn struct {
	ID, When, Device, IP string
	Flagged              bool
}

// accountView is AccountAdminView: Kind is "needs-mfa", "no-sign-in" or "account".
type accountView struct {
	Kind              string
	AgentHasFactor    bool
	FirstName, Email  string
	Archived          bool
	DuplicateAny      bool
	DuplicateClientID string
	SendsLeft         int64
	// account only
	EmailVerified, InvitePending, HasPassword, MfaOn, AddressMismatch bool
	SocialOnly                                                        string
	Locked                                                            bool
	LockedReason, LockedSince                                         string
	LastSignIn                                                        string
	Sessions                                                          []accountSession
	Activity                                                          []accountSignIn
}

var (
	uaApp        = regexp.MustCompile(`(?i)ktor[- ]client|supabase-kt`)
	uaIPhone     = regexp.MustCompile(`iPhone`)
	uaIPad       = regexp.MustCompile(`iPad`)
	uaAndroid    = regexp.MustCompile(`Android`)
	uaMac        = regexp.MustCompile(`Macintosh|Mac OS X`)
	uaWindows    = regexp.MustCompile(`Windows`)
	uaCrOS       = regexp.MustCompile(`CrOS`)
	uaLinux      = regexp.MustCompile(`Linux`)
	uaEdge       = regexp.MustCompile(`Edg/`)
	uaFirefox    = regexp.MustCompile(`Firefox/|FxiOS`)
	uaOpera      = regexp.MustCompile(`OPR/`)
	uaChrome     = regexp.MustCompile(`Chrome/|CriOS`)
	uaSafari     = regexp.MustCompile(`Safari/`)
	providerName = map[string]string{"google": "Google", "apple": "Apple"}
)

// deviceLabel ports deviceLabel: "iPhone · Safari", "Story-Tail app", "Unknown device".
func deviceLabel(ua string) string {
	if strings.TrimSpace(ua) == "" {
		return "Unknown device"
	}
	if uaApp.MatchString(ua) {
		return "Story-Tail app"
	}
	device := ""
	switch {
	case uaIPhone.MatchString(ua):
		device = "iPhone"
	case uaIPad.MatchString(ua):
		device = "iPad"
	case uaAndroid.MatchString(ua):
		device = "Android"
	case uaMac.MatchString(ua):
		device = "Mac"
	case uaWindows.MatchString(ua):
		device = "Windows"
	case uaCrOS.MatchString(ua):
		device = "Chromebook"
	case uaLinux.MatchString(ua):
		device = "Linux"
	}
	browser := ""
	switch {
	case uaEdge.MatchString(ua):
		browser = "Edge"
	case uaFirefox.MatchString(ua):
		browser = "Firefox"
	case uaOpera.MatchString(ua):
		browser = "Opera"
	case uaChrome.MatchString(ua):
		browser = "Chrome"
	case uaSafari.MatchString(ua):
		browser = "Safari"
	}
	switch {
	case device != "" && browser != "":
		return device + " · " + browser
	case device != "":
		return device
	case browser != "":
		return browser
	}
	return "Unknown device"
}

// whenLabel ports whenLabel: "Today · 10:30 AM", "Yesterday · …", "May 5 · …", "Dec 31,
// 2025 · …", in the advisor's zone (America/New_York when it will not load, as Intl did).
func whenLabel(iso, zone string, now time.Time) string {
	loc, ok := loadZone(zone)
	if !ok {
		loc, _ = loadZone("America/New_York")
	}
	if loc == nil {
		loc = time.UTC
	}
	at, ok := parseInstant(iso)
	if !ok {
		return ""
	}
	at, now = at.In(loc), now.In(loc)
	clock := at.Format("3:04 PM")
	day := at.Format(time.DateOnly)
	switch day {
	case now.Format(time.DateOnly):
		return "Today · " + clock
	case now.Add(-24 * time.Hour).Format(time.DateOnly):
		return "Yesterday · " + clock
	}
	if at.Year() == now.Year() {
		return at.Format("Jan 2") + " · " + clock
	}
	return at.Format("Jan 2, 2006") + " · " + clock
}

// toAccountView ports toAccountAdminView.
func toAccountView(row accountRow, now time.Time) accountView {
	if row.NeedsMfa {
		return accountView{Kind: "needs-mfa", AgentHasFactor: row.AgentHasFactor}
	}
	tz := str(row.AgentTimeZone)
	if tz == "" {
		tz = "America/New_York"
	}
	first := jsTrim(str(row.FirstName))
	if first == "" {
		first = "this client"
	}
	v := accountView{FirstName: first, DuplicateAny: row.DuplicateEmail, DuplicateClientID: str(row.DuplicateClientID),
		SendsLeft: max(0, signInEmailsPerHour-row.SignInEmailsLastHour)}
	if !row.HasSignIn {
		v.Kind, v.Email, v.Archived = "no-sign-in", str(row.ClientEmail), row.ClientArchived
		return v
	}
	v.Kind = "account"
	v.Email = str(row.SignInEmail)
	if row.SignInEmail == nil {
		v.Email = str(row.ClientEmail)
	}
	v.EmailVerified = row.EmailVerifiedAt != nil
	v.InvitePending = row.EmailVerifiedAt == nil && row.InvitedAt != nil
	v.HasPassword, v.MfaOn = row.HasPassword, row.MfaEnrolled
	if !row.HasPassword {
		for _, p := range row.Providers {
			if name, ok := providerName[p]; ok && p != "email" {
				v.SocialOnly = name
				break
			}
		}
	}
	switch {
	case row.LockedAt != nil:
		v.Locked, v.LockedReason, v.LockedSince = true, str(row.LockedReason), whenLabel(*row.LockedAt, tz, now)
	case row.BannedUntil != nil:
		if until, ok := parseInstant(*row.BannedUntil); ok && until.After(now) {
			v.Locked, v.LockedSince = true, whenLabel(*row.BannedUntil, tz, now)
		}
	}
	if row.LastLoginAt != nil {
		v.LastSignIn = whenLabel(*row.LastLoginAt, tz, now)
		if len(row.Activity) > 0 {
			v.LastSignIn += " · " + deviceLabel(str(row.Activity[0].UserAgent))
		}
	}
	for _, s := range row.Sessions {
		v.Sessions = append(v.Sessions, accountSession{Device: deviceLabel(str(s.UserAgent)), IP: str(s.IP), LastActive: whenLabel(s.LastActiveAt, tz, now)})
	}
	for _, a := range row.Activity {
		v.Activity = append(v.Activity, accountSignIn{ID: a.ID, When: whenLabel(a.At, tz, now), Device: deviceLabel(str(a.UserAgent)), IP: str(a.IP), Flagged: a.Flagged})
	}
	v.DuplicateAny = v.DuplicateAny || row.DuplicateSignInEmail
	clientEmail := str(row.ClientEmail)
	if row.ClientEmail == nil {
		clientEmail = str(row.SignInEmail)
	}
	v.AddressMismatch = strings.ToLower(str(row.SignInEmail)) != strings.ToLower(clientEmail)
	return v
}

// ── Copy (ACCOUNT_ADMIN_COPY) ─────────────────────────────────────────────────────────

const (
	accGateBodyNoFactor = "These tools can sign a client in or lock them out, so they need two-step sign-in on your account. It takes about a minute."
	accGateBodyVerify   = "These tools need a fresh two-step check. Verify with your authenticator app to keep going."
	accGateSetUp        = "Set up two-step sign-in"
	accGateVerify       = "Verify now"
	accStatusActive     = "Active"
	accStatusLocked     = "Locked"
	accStatusInviteSent = "Invite sent"
	accStatusVerified   = "Verified"
	accStatusNotVerif   = "Not verified"
	accStatusOn         = "On"
	accStatusOff        = "Off"
	accStatusNever      = "Not yet"
	accDuplicate        = "Another client record has this email. Merge them first."
	accLockedFirst      = "Unlock the account first."
	accAlreadyVerified  = "Already verified."
	accAddressMismatch  = "Their sign-in address and the one on their record are different. Fix the record first."
	accNoEmail          = "Add an email address to their record first."
	accArchivedFirst    = "Restore this client before inviting them."
	accVerifyBody       = "Only do this after you've confirmed it another way, like a phone call. It skips the usual email check."
	accLockBody         = "Signs them out everywhere and blocks new sign-ins until you unlock it. They won't get an email. If they try to sign in, they'll see their account is on hold."
	accUnlockBody       = "They can sign in again right away."
	accSignOutBody      = "Ends their sessions on every device. Their account stays open, so they can sign right back in. Good for a lost phone."
	accReasonRequired   = "Add a short reason."
	accNoteTooShort     = "Say a little more about how you confirmed it."
	accCapped           = "That's 3 sign-in emails this hour. Give it a little while before sending another."
	accSendFailed       = "That email didn't go out. Try again in a moment."
	accChanged          = "Done."
	accNoop             = "Nothing to change. It was already done."
	accFailed           = "That didn't go through. Try again in a moment."
	accMfaStale         = "Verify your two-step sign-in again, then try once more."
	accDevicesEmpty     = "Not signed in anywhere right now."
	accIPUnknown        = "Not recorded"
	accFlag             = "Flag"
	accUnflag           = "Clear flag"
)

func accSendsLeft(n int64) string {
	switch n {
	case 0:
		return accCapped
	case 1:
		return "1 more sign-in email this hour."
	}
	return fmt.Sprintf("%d more sign-in emails this hour.", n)
}

func accSocialOnly(provider string) string {
	return "Signs in with " + provider + ", so there's no password to reset."
}
func accNoSignInBody(name string) string {
	return name + " doesn't have a sign-in yet. Send an invite and they'll get a link that opens their trips."
}
func accSent(email string) string { return "Sent. It's on its way to " + email + "." }

// accountOps are the confirmable actions: op, its dialog slot, whether it takes a field and
// how long that must be.
type accountOp struct {
	Op, Slot string
	Field    string // "", "reason" or "note"
	Min      int
	TooShort string
}

var accountOps = []accountOp{
	{Op: "invite", Slot: "invite"},
	{Op: "reset", Slot: "reset"},
	{Op: "magic_link", Slot: "magic"},
	{Op: "verify_email", Slot: "verify", Field: "note", Min: 20, TooShort: accNoteTooShort},
	{Op: "lock", Slot: "lock", Field: "reason", Min: 1, TooShort: accReasonRequired},
	{Op: "unlock", Slot: "unlock", Field: "reason", Min: 1, TooShort: accReasonRequired},
	{Op: "sign_out_everywhere", Slot: "signout"},
}

func opBySlotOrName(s string) (accountOp, bool) {
	for _, o := range accountOps {
		if o.Op == s || o.Slot == s {
			return o, true
		}
	}
	return accountOp{}, false
}

// accountTiles: the action tiles and their links.
var accountTiles = []string{"invite", "merge1", "invite2", "reset", "magic", "verify", "merge2", "unlock", "lock", "signout"}

// accountState is what the URL or a failed post asks the tab to show: an open dialog (by op
// slot), its error and draft, and a status line.
type accountState struct {
	Confirm string
	Error   string
	Draft   string
	Status  *accountStatus
}

type accountStatus struct {
	OK          bool
	Outcome     string // sent, noop or changed, for a success carried by the receipt
	Message     string
	DuplicateID string
}

// message is the status line's sentence: a success is built from its outcome code here,
// where the address comes from the view, never from the cookie.
func (s accountStatus) message(v accountView) string {
	switch s.Outcome {
	case "sent":
		return accSent(cmpOr(v.Email, "their email"))
	case "noop":
		return accNoop
	case "changed":
		return accChanged
	}
	return s.Message
}

func accountSlots() []string {
	out := []string{"acc-status", "acc-status-box", "acc-status-text", "acc-status-link",
		"acc-gate", "acc-gate-body", "acc-gate-link", "acc-nosignin", "acc-nosignin-body", "acc-nosignin-sends",
		"acc-account", "acc-locked", "acc-locked-text", "acc-pending", "acc-account-sends",
		"acc-st-account", "acc-st-email", "acc-st-mfa", "acc-st-last",
		"acc-devices-empty", "acc-devices", "acc-signins-empty", "acc-signins"}
	for _, t := range accountTiles {
		out = append(out, "tile-"+t, "tile-"+t+"-link", "tile-"+t+"-reason", "tile-"+t+"-chevron", "tile-"+t+"-dup")
	}
	for _, o := range accountOps {
		d := "dlg-" + o.Slot
		out = append(out, d, d+"-form", d+"-title", d+"-error", d+"-cancel", d+"-email")
		if o.Field != "" {
			out = append(out, d+"-text")
		}
	}
	return out
}

func accountRepeats() map[string][]string {
	return map[string][]string{
		"sessions": {"se-device", "se-active", "se-ip"},
		"signins":  {"si-row", "si-when", "si-device", "si-ip", "si-flagged", "si-form", "si-id", "si-on", "si-button"},
	}
}

func accountHref(clientID string) string { return detailHref(clientID, "account") }

func fillAccountTab(doc *page.Doc, dd detailData, st detailState) {
	if st.Tab != "account" || dd.TabFailed || dd.Account == nil {
		return // the pane is out of the page
	}
	v := *dd.Account
	id := dd.Overview.ClientID
	as := st.Account
	back := accountHref(id)

	if s := as.Status; s != nil {
		doc.Keep("acc-status")
		doc.Keep("acc-status-box")
		if !s.OK {
			doc.Class("acc-status-box", "alert-success", false)
			doc.Class("acc-status-box", "alert-warning", true)
		}
		doc.Text("acc-status-text", s.message(v))
		if s.DuplicateID != "" {
			doc.URL("acc-status-link", "href", "/agent/clients/"+url.PathEscape(s.DuplicateID))
		} else {
			doc.Remove("acc-status-link")
		}
	} else {
		doc.Remove("acc-status")
	}

	keepIf(doc, "acc-gate", v.Kind == "needs-mfa")
	keepIf(doc, "acc-nosignin", v.Kind == "no-sign-in")
	keepIf(doc, "acc-account", v.Kind == "account")

	shown := map[string]bool{}
	tile := func(name, blocked, dupID, op string) {
		slot := "tile-" + name
		shown[name] = true
		doc.Keep(slot)
		link := slot + "-link"
		switch {
		case op == "merge":
			doc.URL(link, "href", "/agent/clients/"+url.PathEscape(id)+"/merge")
			doc.Attr(link, "data-dialog-open", "")
		case blocked != "":
			doc.URL(link, "href", "") // refused: no href, not a link
			doc.Attr(link, "data-dialog-open", "")
			doc.Attr(link, "aria-disabled", "true")
			doc.Attr(link, "aria-describedby", slot+"-reason")
			doc.Class(link, "ppl-tile-off", true)
		default:
			o, _ := opBySlotOrName(op)
			doc.URL(link, "href", back+"&confirm="+o.Slot)
			doc.Attr(link, "data-dialog-open", "acc-dlg-"+o.Slot)
		}
		if blocked != "" {
			doc.Text(slot+"-reason", blocked)
			doc.Remove(slot + "-chevron")
		} else {
			doc.Remove(slot + "-reason")
			doc.Keep(slot + "-chevron")
		}
		if blocked != "" && dupID != "" {
			doc.Keep(slot + "-dup")
			doc.URL(slot+"-dup", "href", "/agent/clients/"+url.PathEscape(dupID))
		} else {
			doc.Remove(slot + "-dup")
		}
	}

	switch v.Kind {
	case "needs-mfa":
		next := url.QueryEscape(back)
		if v.AgentHasFactor {
			doc.Text("acc-gate-body", accGateBodyVerify)
			doc.URL("acc-gate-link", "href", "/login/mfa?next="+next)
			doc.Text("acc-gate-link", accGateVerify)
		} else {
			doc.Text("acc-gate-body", accGateBodyNoFactor)
			doc.URL("acc-gate-link", "href", "/mfa/setup?next="+next)
			doc.Text("acc-gate-link", accGateSetUp)
		}
	case "no-sign-in":
		doc.Text("acc-nosignin-body", accNoSignInBody(v.FirstName))
		blocked := ""
		switch {
		case v.Archived:
			blocked = accArchivedFirst
		case v.Email == "":
			blocked = accNoEmail
		case v.DuplicateAny:
			blocked = accDuplicate
		case v.SendsLeft == 0:
			blocked = accSendsLeft(0)
		}
		tile("invite", blocked, v.DuplicateClientID, "invite")
		tile("merge1", "", "", "merge")
		textOrRemove(doc, "acc-nosignin-sends", sendsCaption(v.SendsLeft))
	case "account":
		if v.Locked {
			doc.Keep("acc-locked")
			msg := "Locked " + v.LockedSince + "."
			if v.LockedReason != "" {
				msg += " Your reason: " + v.LockedReason
			}
			doc.Text("acc-locked-text", msg)
		} else {
			doc.Remove("acc-locked")
		}
		keepIf(doc, "acc-pending", v.InvitePending)
		capped, locked := "", ""
		if v.SendsLeft == 0 {
			capped = accSendsLeft(0)
		}
		if v.Locked {
			locked = accLockedFirst
		}
		if v.InvitePending {
			tile("invite2", capped, "", "invite")
		} else {
			blocked := cmpOr(locked, capped)
			if v.SocialOnly != "" {
				blocked = accSocialOnly(v.SocialOnly)
			}
			tile("reset", blocked, "", "reset")
		}
		tile("magic", cmpOr(locked, capped), "", "magic_link")
		verifyBlocked := ""
		switch {
		case v.EmailVerified:
			verifyBlocked = accAlreadyVerified
		case v.AddressMismatch:
			verifyBlocked = accAddressMismatch
		case v.DuplicateAny:
			verifyBlocked = accDuplicate
		}
		verifyDup := "" // blockedLink: none once verified
		if !v.EmailVerified {
			verifyDup = v.DuplicateClientID
		}
		tile("verify", verifyBlocked, verifyDup, "verify_email")
		tile("merge2", "", "", "merge")
		if v.Locked {
			tile("unlock", "", "", "unlock")
		} else {
			tile("lock", "", "", "lock")
		}
		signOutBlocked := ""
		if len(v.Sessions) == 0 {
			signOutBlocked = accDevicesEmpty
		}
		tile("signout", signOutBlocked, "", "sign_out_everywhere")
		textOrRemove(doc, "acc-account-sends", sendsCaption(v.SendsLeft))

		switch {
		case v.Locked:
			statusChip(doc, "acc-st-account", "due", accStatusLocked)
		case v.InvitePending:
			statusChip(doc, "acc-st-account", "proposal", accStatusInviteSent)
		default:
			statusChip(doc, "acc-st-account", "booked", accStatusActive)
		}
		if v.EmailVerified {
			statusChip(doc, "acc-st-email", "booked", accStatusVerified)
		} else {
			statusChip(doc, "acc-st-email", "proposal", accStatusNotVerif)
		}
		if v.MfaOn {
			statusChip(doc, "acc-st-mfa", "booked", accStatusOn)
		} else {
			statusChip(doc, "acc-st-mfa", "past", accStatusOff)
		}
		doc.Text("acc-st-last", strOr(v.LastSignIn, accStatusNever))

		keepIf(doc, "acc-devices-empty", len(v.Sessions) == 0)
		keepIf(doc, "acc-devices", len(v.Sessions) > 0)
		if len(v.Sessions) > 0 {
			doc.Repeat("sessions", len(v.Sessions), func(i int, row *page.Row) {
				s := v.Sessions[i]
				row.Text("se-device", s.Device)
				row.Text("se-active", "Active "+s.LastActive)
				textOrRemove(row, "se-ip", s.IP)
			})
		}
		keepIf(doc, "acc-signins-empty", len(v.Activity) == 0)
		keepIf(doc, "acc-signins", len(v.Activity) > 0)
		if len(v.Activity) > 0 {
			action := "/agent/clients/" + url.PathEscape(id) + "/account"
			doc.Repeat("signins", len(v.Activity), func(i int, row *page.Row) {
				a := v.Activity[i]
				row.Keep("si-row")
				if a.Flagged {
					row.Class("si-row", "ppl-flagged", true)
				}
				row.Text("si-when", a.When)
				row.Text("si-device", a.Device)
				row.Text("si-ip", strOr(a.IP, accIPUnknown))
				keepIf2(row, "si-flagged", a.Flagged)
				row.URL("si-form", "action", action)
				row.Attr("si-id", "value", a.ID)
				label := accFlag
				on := "flag"
				if a.Flagged {
					label, on = accUnflag, "unflag"
				}
				row.Attr("si-on", "value", on)
				row.Text("si-button", label)
				row.Attr("si-button", "aria-label", label+": "+a.When+", "+a.Device)
			})
		}
	}
	// The tiles of the state being drawn that this account does not offer; the other state's
	// tiles left the page with their container.
	group := map[string][]string{"no-sign-in": accountTiles[:2], "account": accountTiles[2:]}[v.Kind]
	for _, name := range group {
		if !shown[name] {
			doc.Remove("tile-" + name)
		}
	}
	if v.Kind == "needs-mfa" {
		for _, o := range accountOps {
			doc.Remove("dlg-" + o.Slot)
		}
		return
	}
	fillAccountDialogs(doc, v, id, as)
}

func cmpOr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func sendsCaption(n int64) string {
	if n > 0 && n < 3 {
		return accSendsLeft(n)
	}
	return ""
}

// statusChip fills a status chip slot with its kind's class (literal names for the check).
func statusChip(doc *page.Doc, slot, kind, label string) {
	doc.Text(slot, label)
	doc.Class(slot, "status-booked", false)
	switch kind {
	case "booked":
		doc.Class(slot, "status-booked", true)
	case "due":
		doc.Class(slot, "status-due", true)
	case "proposal":
		doc.Class(slot, "status-proposal", true)
	case "past":
		doc.Class(slot, "status-past", true)
	}
}

func fillAccountDialogs(doc *page.Doc, v accountView, clientID string, as accountState) {
	name, email := v.FirstName, v.Email
	titles := map[string]string{
		"invite":  "Invite " + name + "?",
		"reset":   "Send a password reset to " + name + "?",
		"magic":   "Send " + name + " a sign-in link?",
		"verify":  "Mark " + email + " as verified?",
		"lock":    "Lock " + name + "'s account?",
		"unlock":  "Unlock " + name + "'s account?",
		"signout": "Sign " + name + " out everywhere?",
	}
	action := "/agent/clients/" + url.PathEscape(clientID) + "/account"
	for _, o := range accountOps {
		d := "dlg-" + o.Slot
		doc.Keep(d)
		open := as.Confirm == o.Slot || as.Confirm == o.Op
		doc.Bool(d, "open", open)
		doc.Attr(d, "aria-label", titles[o.Slot])
		doc.URL(d+"-form", "action", action)
		doc.Text(d+"-title", titles[o.Slot])
		// The bodies that name the address are filled here; the rest are static copy.
		if o.Slot == "invite" || o.Slot == "reset" || o.Slot == "magic" {
			doc.Text(d+"-email", email)
		} else {
			doc.Remove(d + "-email")
		}
		if o.Field != "" {
			draft := ""
			if open {
				draft = as.Draft
			}
			doc.Text(d+"-text", draft)
		}
		if open && as.Error != "" {
			doc.Text(d+"-error", as.Error)
		} else {
			doc.Remove(d + "-error")
		}
		doc.URL(d+"-cancel", "href", accountHref(clientID))
	}
}

// ── The post ──────────────────────────────────────────────────────────────────────────

type accountBody struct {
	ClientID    string  `json:"clientId"`
	Op          string  `json:"op"`
	Reason      *string `json:"reason,omitempty"`
	Note        *string `json:"note,omitempty"`
	AuthEventID string  `json:"authEventId,omitempty"`
}

type accountReply struct {
	Outcome           string  `json:"outcome"`
	Reason            *string `json:"reason"`
	DuplicateClientID *string `json:"duplicateClientId"`
}

var mfaStale = regexp.MustCompile(`MFA was verified|requires multi-factor|Could not determine when MFA`)

// postClientAccount is accountAdminAction: one account-admin op. A dialog op that fails stays
// in its dialog with the reason; a success (and any flag result) comes back as the tab's
// status line, carried across the redirect as an outcome code, never a sentence.
func (a *app) postClientAccount(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	clientID := r.PathValue("clientId")
	opName := f.Get("op")
	flagOp := opName == "flag" || opName == "unflag"
	op, known := opBySlotOrName(opName)
	if !known && !flagOp {
		web.Error(w, http.StatusBadRequest)
		return
	}
	body := accountBody{ClientID: clientID, Op: opName}
	draft := ""
	if flagOp {
		body.AuthEventID = strings.TrimSpace(f.Get("authEventId"))
		if body.AuthEventID == "" {
			web.Error(w, http.StatusBadRequest)
			return
		}
	} else {
		body.Op = op.Op
		if op.Field != "" {
			draft = f.Get(op.Field)
			trimmed := jsTrim(draft)
			if textLen(trimmed) < op.Min {
				a.renderClientDetail(w, r, v, detailState{Tab: "account", Account: accountState{Confirm: op.Slot, Error: op.TooShort, Draft: draft}}, http.StatusUnprocessableEntity)
				return
			}
			if op.Field == "reason" {
				body.Reason = &trimmed
			} else {
				body.Note = &trimmed
			}
		}
	}

	res := a.d.API.Call(r.Context(), "account-admin", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: body})
	out := web.FromResult(res, accFailed)
	if out.SignIn {
		web.SeeOther(w, r, web.SignInURL(r))
		return
	}
	var ok2 bool
	var outcome, msg, dup string
	switch {
	case !out.OK && res.Kind == api.Rejected && res.Detail != "":
		msg = res.Detail
		if mfaStale.MatchString(res.Detail) {
			msg = accMfaStale
		}
	case !out.OK:
		msg = accFailed
	default:
		var rep accountReply
		_ = json.Unmarshal(res.Data, &rep)
		outcome = rep.Outcome
		switch rep.Outcome {
		case "sent", "noop", "changed":
			ok2 = true
		case "capped":
			msg = accCapped
		case "failed":
			msg = accSendFailed
		case "refused":
			msg = cmpOr(str(rep.Reason), accFailed)
		case "duplicate":
			msg, dup = accDuplicate, str(rep.DuplicateClientID)
		default:
			msg = accFailed
		}
	}
	if ok2 {
		setReceipt(w, receipt{Kind: "account", Outcome: outcome}, a.d.SecureCookies)
		web.SeeOther(w, r, accountHref(clientID))
		return
	}
	status := http.StatusUnprocessableEntity
	if out.Status == http.StatusServiceUnavailable {
		status = http.StatusServiceUnavailable
	}
	st := detailState{Tab: "account"}
	if flagOp {
		st.Account.Status = &accountStatus{Message: msg, DuplicateID: dup}
	} else {
		st.Account = accountState{Confirm: op.Slot, Error: msg, Draft: draft}
	}
	a.renderClientDetail(w, r, v, st, status)
}
