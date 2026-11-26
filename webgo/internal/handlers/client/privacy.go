package client

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screens 2.5.9 Privacy & Data and 2.5.10 Account Closure. Both are READ-ONLY today, and
// every action on them is disabled with its reason: no function writes to `account`, and
// no export job exists.

// PrivacyCopy is PRIVACY, word for word.
//
// TrackingBody must stay consistent with the published cookie policy, which says we do not
// use advertising cookies and lists Google Analytics as the one tracker, opt-in and on the
// website only. It is shared with the app, which runs no analytics, so it must stay true on
// both — a privacy claim that drifts from the legal page is worse than no claim.
//
// ExportBody names only what the client can actually read back. It deliberately does NOT
// mention the document-access trail: that lives in audit_event, which is the agency's.
var PrivacyCopy = struct {
	Title, Subtitle                 string
	ExportTitle, ExportBody         string
	ExportCta, ExportDeferred       string
	TrackingHeading, TrackingBody   string
	CookiesLink                     string
	CloseTitle, CloseBody, CloseCta string
}{
	Title:    "Privacy & data",
	Subtitle: "What we hold, and what we don’t.",

	ExportTitle: "Download your data",
	ExportBody: "Your profile, your trips, your documents and your messages. It is yours; " +
		"take a copy whenever you like.",
	ExportCta:      "Request an export",
	ExportDeferred: "Coming with the next release",

	TrackingHeading: "TRACKING",
	TrackingBody: "We don’t run advertising trackers. Nothing counts your visit unless you " +
		"allow it: if you do, Google Analytics counts visits on the website and sets a few " +
		"cookies of its own. The only other cookies are the ones that keep you signed in, " +
		"and you can clear any of them in your browser.",
	CookiesLink: "Read the cookie policy",

	CloseTitle: "Close your account",
	CloseBody: "Your trips are archived and your personal details are anonymized. Some " +
		"records have to be kept for tax reasons — we will show you exactly which before " +
		"you confirm.",
	CloseCta: "Close my account",
}

// CloseCopy is CLOSE, word for word.
var CloseCopy = struct {
	Title, Back, Heading             string
	WhatHappensLabel                 string
	WhatHappens                      []string
	ReconsiderBody, ReconsiderCta    string
	ReasonLabel, ReasonPlaceholder   string
	ConfirmLabel, ConfirmPlaceholder string
	ConfirmHint                      string
	ConfirmCta, KeepCta, Deferred    string
}{
	Title:            "Close account",
	Back:             "Privacy & data",
	Heading:          "Close your account?",
	WhatHappensLabel: "WHAT HAPPENS",
	WhatHappens: []string{
		"Your trips are archived — ask for a final PDF first if you want one",
		"Your personal details are anonymized",
		"Booking and tax records are kept, because the law requires it",
	},
	// Nothing here sells. The offer to talk to Gyasi stays, because it is useful; the
	// reason field is not framed as a way to win somebody back.
	ReconsiderBody: "If something went wrong, Gyasi would rather hear it than lose you. " +
		"This page will still be here afterwards.",
	ReconsiderCta:      "Message him first",
	ReasonLabel:        "Anything you want to tell us? (optional)",
	ReasonPlaceholder:  "Only if you feel like it.",
	ConfirmLabel:       "Type your email address to confirm",
	ConfirmPlaceholder: "you@example.com",
	ConfirmHint:        "This is the address you sign in with.",
	ConfirmCta:         "Close my account",
	KeepCta:            "Keep my account",
	// No function writes to `account` at all.
	Deferred: "Coming with the next release",
}

var privacySpec = page.Spec{
	File:   "client/account-privacy.html",
	Layout: shell.Client,
	Slots: []string{
		"title", "subtitle", "export-title", "export-body", "export-wrap", "export-cta",
		"tracking-heading", "tracking-body", "cookies-link",
		"close-title", "close-body", "close-cta",
	},
}

var closeSpec = page.Spec{
	File:   "client/account-close.html",
	Layout: shell.Client,
	Slots: []string{
		"back", "heading", "what-label",
		"reconsider-body", "reconsider-cta",
		"reason-label", "reason", "confirm-label", "confirm", "confirm-hint",
		"confirm-wrap", "confirm-cta", "keep-cta",
	},
	Repeats: map[string][]string{"what": {"what-item"}},
}

func (a *area) mountPrivacy(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(privacySpec.File)
	if err != nil {
		return err
	}
	rt.Protected("GET /account/privacy", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		p := PrivacyCopy
		d := tmpl.New()
		d.Text("title", p.Title)
		d.Text("subtitle", p.Subtitle)
		d.Text("export-title", p.ExportTitle)
		d.Text("export-body", p.ExportBody)
		d.Attr("export-wrap", "title", p.ExportDeferred)
		d.Keep("export-wrap")
		d.Text("export-cta", p.ExportCta)
		d.Attr("export-cta", "title", p.ExportDeferred)
		d.Text("tracking-heading", p.TrackingHeading)
		d.Text("tracking-body", p.TrackingBody)
		d.Text("cookies-link", p.CookiesLink)
		d.URL("cookies-link", "href", "/legal/cookies")
		d.Text("close-title", p.CloseTitle)
		d.Text("close-body", p.CloseBody)
		d.Text("close-cta", p.CloseCta)
		d.URL("close-cta", "href", "/account/close")
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}

func (a *area) mountClose(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(closeSpec.File)
	if err != nil {
		return err
	}
	rt.Protected("GET /account/close", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		c := CloseCopy
		d := tmpl.New()
		d.Text("back", c.Back)
		d.URL("back", "href", "/account/privacy")
		d.Text("heading", c.Heading)
		d.Text("what-label", c.WhatHappensLabel)
		d.Repeat("what", len(c.WhatHappens), func(i int, row *page.Row) {
			row.Text("what-item", c.WhatHappens[i])
		})
		d.Text("reconsider-body", c.ReconsiderBody)
		d.Text("reconsider-cta", c.ReconsiderCta)
		d.URL("reconsider-cta", "href", "/messages/new")
		d.Text("reason-label", c.ReasonLabel)
		d.Attr("reason", "placeholder", c.ReasonPlaceholder)
		d.Keep("reason")
		d.Text("confirm-label", c.ConfirmLabel)
		d.Attr("confirm", "placeholder", c.ConfirmPlaceholder)
		d.Text("confirm-hint", c.ConfirmHint)
		d.Attr("confirm-wrap", "title", c.Deferred)
		d.Keep("confirm-wrap")
		d.Text("confirm-cta", c.ConfirmCta)
		d.Attr("confirm-cta", "title", c.Deferred)
		d.Text("keep-cta", c.KeepCta)
		d.URL("keep-cta", "href", "/account")
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}
