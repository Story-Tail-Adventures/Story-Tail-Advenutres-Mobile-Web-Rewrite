package client

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Screen 2.5.7 Security (web/app/(client)/account/security).

// SecurityCopy is SECURITY, word for word.
//
// SessionsDeferred says what is TRUE rather than "coming soon": the reader's real question
// on a security screen is "can someone else be signed in as me?", and the honest answer is
// that we cannot show them yet — followed by the thing they CAN do about it. That is
// §2.2.8's lesson, where a carrier narration asserted something no column held.
//
// No vendor is named for the authenticator and no backup codes are offered: Supabase has no
// backup-code factor, and a home-grown one would be a promise we could not keep.
var SecurityCopy = struct {
	Title, Subtitle                  string
	PasswordTitle, PasswordBody      string
	PasswordCta, PasswordDeferred    string
	NoPasswordTitle, NoPasswordCta   string
	MfaTitle, MfaOn, MfaOff, MfaBody string
	MfaEnableCta, MfaManageCta       string
	MfaManageDeferred                string
	SessionsHeading                  string
	SessionsDeferred, SessionsAdvice string
}{
	Title:         "Security",
	Subtitle:      "How you get in, and how we keep others out.",
	PasswordTitle: "Password",
	PasswordBody:  "Change it whenever you like — you’ll get a link by email.",
	PasswordCta:   "Change password",
	// /forgot-password bounces a signed-in visitor, so the control would lead nowhere.
	PasswordDeferred: "Coming with the next release — for now, sign out and use “Forgot?” " +
		"on the sign-in screen.",
	NoPasswordTitle: "How you sign in",
	NoPasswordCta:   "Connected accounts",
	MfaTitle:        "Two-factor authentication",
	MfaOn:           "On",
	MfaOff:          "Off",
	MfaBody:         "A six-digit code from your authenticator app, on top of your password.",
	MfaEnableCta:    "Turn on two-factor",
	MfaManageCta:    "Replace your authenticator",
	// 2.1.6 redirects anyone already enrolled; managing a factor is this screen's own job.
	MfaManageDeferred: "Coming with the next release. Two-factor is on and working in the " +
		"meantime.",
	SessionsHeading: "WHERE YOU ARE SIGNED IN",
	SessionsDeferred: "We can’t show you your other devices yet. It needs a piece we " +
		"haven’t built, and a list that is always empty would tell you the wrong thing.",
	SessionsAdvice: "If you think someone else has your account: change your password, " +
		"turn on two-factor, and tell Gyasi. He would rather hear about it early.",
}

// NoPasswordBody is SECURITY.noPasswordBody.
func NoPasswordBody(provider string) string {
	name := provider
	switch provider {
	case "google":
		name = "Google"
	case "apple":
		name = "Apple"
	}
	return "You sign in with " + name + ", so there is no password here to change. Manage " +
		"it in that account."
}

var securitySpec = page.Spec{
	File:   "client/account-security.html",
	Layout: shell.Client,
	Slots: []string{
		"title", "subtitle",
		"password-card", "password-title", "password-body", "password-wrap", "password-cta",
		"provider-card", "provider-title", "provider-body", "provider-cta",
		"mfa-title", "mfa-state", "mfa-body", "mfa-enable", "mfa-manage-wrap", "mfa-manage",
		"sessions-heading", "sessions-deferred", "sessions-advice",
	},
}

func (a *area) mountSecurity(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(securitySpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /account/security", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		s := SecurityCopy
		d := tmpl.New()
		d.Text("title", s.Title)
		d.Text("subtitle", s.Subtitle)

		// An account with no password is one that signs in through a provider. A failed read
		// falls back to the password card: it is the one whose action is disabled anyway, so
		// the worst case is offering an inert control rather than telling an OAuth user they
		// have a password they do not.
		provider := ""
		if !a.off {
			row, found, err := supa.MaybeOne[authProviderRow](r.Context(), a.Supa, v.AccessToken,
				"account", supa.Q().Select("auth_provider"))
			if err != nil {
				a.Log.Warn("client: security auth_provider read failed", "err", err)
			} else if found {
				provider = text(row.AuthProvider)
			}
		}
		if provider != "" && provider != "email" {
			d.Remove("password-card")
			d.Keep("provider-card")
			d.Text("provider-title", s.NoPasswordTitle)
			d.Text("provider-body", NoPasswordBody(provider))
			d.Text("provider-cta", s.NoPasswordCta)
			d.URL("provider-cta", "href", "/account/connected")
		} else {
			d.Remove("provider-card")
			d.Keep("password-card")
			d.Text("password-title", s.PasswordTitle)
			d.Text("password-body", s.PasswordBody)
			d.Attr("password-wrap", "title", s.PasswordDeferred)
			d.Keep("password-wrap")
			d.Text("password-cta", s.PasswordCta)
			d.Attr("password-cta", "title", s.PasswordDeferred)
		}

		// VERIFIED, not merely enrolled. session.State.HasFactor already asks GoTrue that
		// question for the gate, so this screen does not ask it again — and an unverified
		// enrolment somebody abandoned is not two-factor being on.
		d.Text("mfa-title", s.MfaTitle)
		d.Text("mfa-body", s.MfaBody)
		if v.HasFactor {
			d.Text("mfa-state", s.MfaOn)
			d.Remove("mfa-enable")
			d.Attr("mfa-manage-wrap", "title", s.MfaManageDeferred)
			d.Keep("mfa-manage-wrap")
			d.Text("mfa-manage", s.MfaManageCta)
			d.Attr("mfa-manage", "title", s.MfaManageDeferred)
		} else {
			d.Text("mfa-state", s.MfaOff)
			d.Remove("mfa-manage-wrap")
			d.Text("mfa-enable", s.MfaEnableCta)
			d.URL("mfa-enable", "href", "/mfa/setup")
		}

		d.Text("sessions-heading", s.SessionsHeading)
		d.Text("sessions-deferred", s.SessionsDeferred)
		d.Text("sessions-advice", s.SessionsAdvice)
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}
