package client

import (
	"context"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/supa"
)

// Screen 2.5.1 Account Overview's copy and read, ported from
// web/app/(client)/account/{content,page}.tsx.
//
// Subtitles say what is INSIDE, in data — "Name, email, phone, address", "4 files" — rather
// than describing the screen ("Manage your notification preferences"). Design-System §2.6's
// tone check: a friend who has done this a hundred times tells you what is in the drawer,
// not what the drawer is for.

// AccountCopy is ACCOUNT, word for word.
var AccountCopy = struct {
	Title                            string
	FallbackName                     string
	GroupYou, GroupApp, GroupSupport string
	Personal, PersonalSub            string
	Preferences, PreferencesSub      string
	Documents, DocumentsEmptySub     string
	Notifications                    string
	Security, SecuritySub            string
	Connected, ConnectedSub          string
	Help, HelpSub                    string
	Privacy, PrivacySub              string
	ComingSoon                       string
	SignOut                          string
}{
	Title: "Account",
	// Shown when the name read failed or the columns are still at their placeholders.
	FallbackName:   "Your account",
	GroupYou:       "YOU",
	GroupApp:       "APP",
	GroupSupport:   "SUPPORT",
	Personal:       "Personal info",
	PersonalSub:    "Name, email, phone, address",
	Preferences:    "Travel preferences",
	PreferencesSub: "Style, dietary, loyalty",
	Documents:      "Travel documents",
	// NO "expiring soon" half. The Screen Inventory note at 2.5.1 describes one and 2.5.4
	// lists expiration warnings, but neither is computed anywhere yet: it needs
	// travel_document.expires_on against a window, and this hub reads `document`, which has
	// no expiry at all. A hardcoded zero dressed as a real count is the kind of claim this
	// section spent its doc pass removing.
	DocumentsEmptySub: "Passports, visas, insurance",
	Notifications:     "Notifications",
	Security:          "Security",
	SecuritySub:       "Password and two-factor",
	Connected:         "Connected accounts",
	ConnectedSub:      "Google and Apple sign-in",
	Help:              "Help & support",
	HelpSub:           "Common questions, or message Gyasi",
	Privacy:           "Privacy & data",
	PrivacySub:        "Download a copy of your data",
	ComingSoon:        "Coming with the next release",
	SignOut:           "Sign out",
}

// MemberSince is ACCOUNT.memberSince.
func MemberSince(month string) string { return "Traveling with Gyasi since " + month }

// DocumentsSub is ACCOUNT.documentsSub: a count the destination screen must agree with,
// since 2.5.4 renders the same list.
func DocumentsSub(files int) string {
	if files == 1 {
		return "1 file"
	}
	return strconv.Itoa(files) + " files"
}

// AccountOverview is the hub's own data.
type AccountOverview struct {
	DisplayName string
	Initials    string
	// MemberSince is "March 2026", or empty when created_at is unreadable.
	MemberSince string
	// FileCount is -1 when the count could not be read. A failed count must NOT render as
	// "0 files": that is a statement about their documents, and a wrong one.
	FileCount int
}

type accountClientRow struct {
	FirstName     *string `json:"first_name"`
	LastName      *string `json:"last_name"`
	PreferredName *string `json:"preferred_name"`
	Email         *string `json:"email"`
	CreatedAt     *string `json:"created_at"`
}

type documentIDRow struct {
	ID string `json:"id"`
}

// loadAccountOverview reads 2.5.1.
//
// A hub whose NAME read failed should still offer the destinations, so that failure is
// logged and falls back. A failed DOCUMENT count is different and is kept distinguishable
// from zero.
func (a *area) loadAccountOverview(ctx context.Context, token string) AccountOverview {
	out := AccountOverview{DisplayName: AccountCopy.FallbackName, FileCount: -1}
	if a.off {
		return out
	}

	row, found, err := supa.MaybeOne[accountClientRow](ctx, a.Supa, token, "client",
		supa.Q().Select("first_name,last_name,preferred_name,email,created_at"))
	if err != nil {
		a.Log.Warn("client: account hub name read failed", "err", err)
	} else if found {
		first := text(row.PreferredName)
		if first == "" {
			first = text(row.FirstName)
		}
		last := text(row.LastName)
		out.Initials = shell.InitialsFor(first, last)
		if name := joinName(first, last); name != "" {
			out.DisplayName = name
		}
		if created, ok := parseInstant(text(row.CreatedAt)); ok {
			// A month and a year, read in UTC: this is a membership date, not an event in
			// anybody's evening, so it must not shift with a zone.
			out.MemberSince = created.UTC().Format("January 2006")
		}
	}

	// document_self_select scopes this to the caller, so no filter is needed — and none of
	// the withheld columns (storage_bucket / storage_key / checksum_sha256) is selected.
	docs, err := supa.Select[documentIDRow](ctx, a.Supa, token, "document",
		supa.Q().Select("id").Is("archived_at", "null"))
	if err != nil {
		a.Log.Warn("client: account hub document count read failed", "err", err)
	} else {
		out.FileCount = len(docs)
	}
	return out
}

func joinName(first, last string) string {
	switch {
	case first != "" && last != "":
		return first + " " + last
	case first != "":
		return first
	}
	return last
}
