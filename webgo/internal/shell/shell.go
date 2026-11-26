// Package shell is the five layouts every page sits in (webgo/pages/layout/) and the one
// call per layout that fills them, so a page handler never touches the chrome's slots:
//
//	d := tmpl.New()
//	shell.FillPublic(d, r.URL.Path, shell.PublicChrome{})
//	d.Text("title", ...)
//	web.Render(w, log, d, http.StatusOK, web.Shared)
//
// What each layout carries, from its Next twin:
//
//	PublicHero, PublicPlain  app/(public) + (hero)/(plain): top bar, drawer, footer
//	Auth                     app/(auth): Pattern A split pane
//	Onboarding               app/(onboarding): Pattern G, no chrome
//	Client                   app/(client): rail, 104px bar, bottom bar
//	Agent                    app/(agent): rail, bar with quick-add and account menu, tabs
//
// Nav state is aria-current="page" on the item the path belongs to, decided here from the
// same rules as lib/client/nav.ts and lib/agent/nav.ts. Signed-in chrome on the gated shells
// is the avatar's initials, from the caller; on the public shells it is the pre-paint flag,
// because those pages are cached and know nobody.
package shell

import (
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Filler is the part of *page.Doc the fill helpers use.
type Filler interface {
	Text(slot, text string)
	Attr(slot, name, value string)
	Keep(slot string)
	Remove(slot string)
}

var _ Filler = (*page.Doc)(nil)

// Every layout carries the flash.
var flashSlots = []string{"flash", "flash-text"}

// The layouts. Use one as a page.Spec's Layout.
var (
	PublicHero = &page.Layout{File: "layout/public-hero.html", Slots: publicSlots()}
	// PublicPlain has the solid bar at every width (How it works, results, legal).
	PublicPlain = &page.Layout{File: "layout/public-plain.html", Slots: publicSlots()}
	Auth        = &page.Layout{File: "layout/auth.html", Slots: flashSlots}
	Onboarding  = &page.Layout{File: "layout/onboarding.html", Slots: flashSlots}
	Client      = &page.Layout{File: "layout/client.html", Slots: clientSlots()}
	Agent       = &page.Layout{File: "layout/agent.html", Slots: agentSlots()}
)

// Layouts lists them, for tests and the styleguide.
var Layouts = []*page.Layout{PublicHero, PublicPlain, Auth, Onboarding, Client, Agent}

// navItem is one destination: its slot and the path prefix that lights it.
type navItem struct {
	id   string
	href string
}

// PublicNav is components/public/PublicNav's list (content/public/contact.ts
// PUBLIC_NAV_LINKS): an item is current on its path and below it.
var PublicNav = []navItem{
	{"explore", "/explore"},
	{"caribbean", "/caribbean"},
	{"cruises", "/cruises"},
	{"honeymoons", "/honeymoons"},
	{"about", "/about"},
}

// ClientRail and ClientBar are lib/client/nav.ts's built destinations, by surface. Discover
// is not built, so it is a disabled span in the HTML with no slot.
var (
	ClientRail = []navItem{{"trips", "/dashboard"}, {"messages", "/messages"}, {"documents", "/documents"}, {"account", "/account"}}
	ClientBar  = []navItem{{"trips", "/dashboard"}, {"messages", "/messages"}, {"account", "/account"}}
)

// AgentRail and AgentBar are lib/agent/nav.ts's built destinations, by surface. More is
// planned (§3.12), a disabled span with no slot.
var (
	AgentRail = []navItem{
		{"worklist", "/agent"}, {"clients", "/agent/clients"}, {"trips", "/agent/trips"},
		{"leads", "/agent/leads"}, {"messages", "/agent/messages"},
		{"commission", "/agent/commission"}, {"reports", "/agent/reports"},
	}
	AgentBar = []navItem{{"worklist", "/agent"}, {"clients", "/agent/clients"}, {"messages", "/agent/messages"}}
)

// AgentWorklistViews light Worklist although they are not under /agent/... by prefix rules
// that would pick a longer destination (lib/agent/nav.ts AGENT_WORKLIST_VIEWS).
var AgentWorklistViews = []string{"/agent", "/agent/pipeline", "/agent/calendar"}

func publicSlots() []string {
	out := []string{"placeholder-banner", "footer-year"}
	for _, n := range PublicNav {
		out = append(out, "nav-"+n.id, "drawer-"+n.id)
	}
	return append(out, flashSlots...)
}

func clientSlots() []string {
	out := []string{"avatar-initials"}
	for _, n := range ClientRail {
		out = append(out, "rail-"+n.id)
	}
	for _, n := range ClientBar {
		out = append(out, "tab-"+n.id)
	}
	return append(out, flashSlots...)
}

func agentSlots() []string {
	out := []string{"account-initials"}
	for _, n := range AgentRail {
		out = append(out, "rail-"+n.id)
	}
	for _, n := range AgentBar {
		out = append(out, "tab-"+n.id)
	}
	return append(out, flashSlots...)
}

func under(path, prefix string) bool {
	return path == prefix || strings.HasPrefix(path, prefix+"/")
}

// longest returns the id of the item whose href is the longest prefix of path, or "".
func longest(path string, items []navItem) string {
	best, bestLen := "", -1
	for _, n := range items {
		if under(path, n.href) && len(n.href) > bestLen {
			best, bestLen = n.id, len(n.href)
		}
	}
	return best
}

// ActiveClient ports activeDestinationId (lib/client/nav.ts): the longest matching prefix,
// and trip pages (/trips/...) belong to Trips, whose own route is /dashboard.
func ActiveClient(path string) string {
	if id := longest(path, ClientRail); id != "" {
		return id
	}
	if under(path, "/trips") {
		return "trips"
	}
	return ""
}

// ActiveAgent ports activeAgentDestinationId (lib/agent/nav.ts).
func ActiveAgent(path string) string {
	for _, v := range AgentWorklistViews {
		if path == v {
			return "worklist"
		}
	}
	return longest(path, AgentRail)
}

// ActivePublic is the public nav item path is on, or "".
func ActivePublic(path string) string { return longest(path, PublicNav) }

// markNav keeps every nav slot and puts aria-current="page" on the active one.
func markNav(d Filler, prefix string, items []navItem, active string) {
	for _, n := range items {
		slot := prefix + n.id
		d.Keep(slot)
		if n.id == active {
			d.Attr(slot, "aria-current", "page")
		}
	}
}

func fillFlash(d Filler, flash string) {
	if flash == "" {
		d.Remove("flash")
		return
	}
	d.Keep("flash")
	d.Text("flash-text", flash)
}

// PublicChrome is what a public page decides about its shell.
type PublicChrome struct {
	// PlaceholderBanner shows the "Preview content" note while any marketing claim is still
	// a placeholder (content/public/proof.ts). The public pages own that decision.
	PlaceholderBanner bool
	// Now is the clock for the footer year; zero means time.Now.
	Now time.Time
}

// FillPublic fills either public layout. No flash: these pages are cached.
func FillPublic(d Filler, path string, c PublicChrome) {
	active := ActivePublic(path)
	markNav(d, "nav-", PublicNav, active)
	markNav(d, "drawer-", PublicNav, active)
	if c.PlaceholderBanner {
		d.Keep("placeholder-banner")
	} else {
		d.Remove("placeholder-banner")
	}
	now := c.Now
	if now.IsZero() {
		now = time.Now()
	}
	d.Text("footer-year", strconv.Itoa(now.Year()))
	fillFlash(d, "")
}

// FillAuth fills the auth layout. flash comes from web.TakeFlash.
func FillAuth(d Filler, flash string) { fillFlash(d, flash) }

// FillOnboarding fills the onboarding layout.
func FillOnboarding(d Filler, flash string) { fillFlash(d, flash) }

// Chrome is what the signed-in shells show about the visitor.
type Chrome struct {
	// Initials for the avatar; empty shows InitialsFallback, as the Next layouts do.
	Initials string
	// Flash from web.TakeFlash.
	Flash string
}

func (c Chrome) initials() string {
	if c.Initials == "" {
		return InitialsFallback
	}
	return c.Initials
}

// FillClient fills the traveler's shell for the page at path.
func FillClient(d Filler, path string, c Chrome) {
	active := ActiveClient(path)
	markNav(d, "rail-", ClientRail, active)
	markNav(d, "tab-", ClientBar, active)
	d.Text("avatar-initials", c.initials())
	fillFlash(d, c.Flash)
}

// FillAgent fills the advisor's shell for the page at path.
func FillAgent(d Filler, path string, c Chrome) {
	active := ActiveAgent(path)
	markNav(d, "rail-", AgentRail, active)
	markNav(d, "tab-", AgentBar, active)
	d.Text("account-initials", c.initials())
	fillFlash(d, c.Flash)
}
