package shell

import (
	"io/fs"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/static"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// Cases from web/lib/client/nav.test.ts and web/lib/agent/nav.test.ts.
func TestActiveClient(t *testing.T) {
	for path, want := range map[string]string{
		"/dashboard":                "trips",
		"/messages":                 "messages",
		"/messages/abc":             "messages",
		"/trips":                    "trips",
		"/trips/0195a2c0/itinerary": "trips",
		"/trips/0195a2c0/documents": "trips",
		"/trips/0195a2c0/messages":  "trips",
		"/documents":                "documents",
		"/account/security":         "account",
		"/documents-archive":        "",
		"/messagesx":                "",
		"/":                         "",
	} {
		if got := ActiveClient(path); got != want {
			t.Errorf("ActiveClient(%q) = %q, want %q", path, got, want)
		}
	}
}

func TestActiveAgent(t *testing.T) {
	for path, want := range map[string]string{
		"/agent":                       "worklist",
		"/agent/pipeline":              "worklist",
		"/agent/calendar":              "worklist",
		"/agent/clients":               "clients",
		"/agent/clients/abc":           "clients",
		"/agent/clients-archive":       "worklist",
		"/agent/commission":            "commission",
		"/agent/commission/ledger":     "commission",
		"/agent/commission/import/abc": "commission",
		"/agent/commission/forecast":   "commission",
		"/agent/trips/abc/payments":    "trips",
		"/agent/settings":              "worklist",
		"/dashboard":                   "",
	} {
		if got := ActiveAgent(path); got != want {
			t.Errorf("ActiveAgent(%q) = %q, want %q", path, got, want)
		}
	}
}

func TestActivePublic(t *testing.T) {
	for path, want := range map[string]string{
		"/explore": "explore", "/explore/results": "explore", "/caribbean": "caribbean",
		"/about": "about", "/how-it-works": "", "/": "", "/exploretion": "",
	} {
		if got := ActivePublic(path); got != want {
			t.Errorf("ActivePublic(%q) = %q, want %q", path, got, want)
		}
	}
}

// Cases from web/lib/auth/initials.test.ts.
func TestInitialsFor(t *testing.T) {
	for _, c := range []struct{ first, last, want string }{
		{"Jordan", "Hale", "JH"},
		{"jordan", "hale", "JH"},
		{"  Jordan ", "  Hale", "JH"},
		{"Jordan", "", "J"},
		{"", "Hale", "H"},
		{"", "   ", ""},
		{"New", "Traveler", ""},
		{"Jordan", "Traveler", "J"},
		{"New", "Hale", "H"},
		{"Newton", "Travers", "NT"},
	} {
		if got := InitialsFor(c.first, c.last); got != c.want {
			t.Errorf("InitialsFor(%q, %q) = %q, want %q", c.first, c.last, got, c.want)
		}
	}
	if InitialsFallback != "ST" {
		t.Error("the fallback is the brand monogram, ST")
	}
	if got := AgentInitials("Gyasi Story"); got != "GS" {
		t.Errorf("AgentInitials = %q", got)
	}
}

// Cases from web/lib/agent/role.test.ts and web/lib/onboarding/status.test.ts.
func TestShellDecisions(t *testing.T) {
	client := &Status{Role: RoleClient, IsClient: true, CompletedAt: "2026-09-01T00:00:00Z"}
	agent := &Status{Role: RoleAgent}
	admin := &Status{Role: RoleAdmin}

	if d := ClientDecision(nil); d.Kind != Render {
		t.Error("a null status renders the client shell (fail open toward the client side)")
	}
	if d := ClientDecision(client); d.Kind != Render {
		t.Error("a client renders")
	}
	if d := ClientDecision(agent); d.Kind != Redirect || d.To != "/agent" {
		t.Errorf("an agent goes to /agent, got %+v", d)
	}
	if d := ClientDecision(admin); d.Kind != Unauthorized {
		t.Error("an admin sees the unauthorized state")
	}

	if d := AgentDecision(nil); d.Kind != Redirect || d.To != "/dashboard" {
		t.Errorf("a null status REDIRECTS from the agent shell, got %+v", d)
	}
	if d := AgentDecision(agent); d.Kind != Render {
		t.Error("an agent renders")
	}
	if d := AgentDecision(client); d.Kind != Redirect || d.To != "/dashboard" {
		t.Error("a client goes home")
	}
	if d := AgentDecision(admin); d.Kind != Unauthorized {
		t.Error("an admin sees the unauthorized state")
	}

	if d := OnboardingDecision(client); d.Kind != Redirect {
		t.Error("a finished client is sent out of the wizard")
	}
	if d := OnboardingDecision(agent); d.Kind != Redirect {
		t.Error("an agent has no wizard")
	}
	if d := OnboardingDecision(&Status{Role: RoleClient, IsClient: true}); d.Kind != Render {
		t.Error("an unfinished client stays in the wizard")
	}
	if d := OnboardingDecision(nil); d.Kind != Render {
		t.Error("a null status fails open into the wizard")
	}
}

func TestOnboardingRedirect(t *testing.T) {
	for _, c := range []struct {
		s    *Status
		want string
	}{
		{nil, ""},
		{&Status{Role: RoleAgent}, ""},
		{&Status{Role: RoleClient, IsClient: true, CompletedAt: "x"}, ""},
		{&Status{Role: RoleClient, IsClient: true}, "/welcome"},
		{&Status{Role: RoleClient, IsClient: true, Step: "preferences"}, "/onboarding/preferences"},
		{&Status{Role: RoleClient, IsClient: true, Step: "not-a-step"}, "/welcome"},
	} {
		if got := OnboardingRedirect(c.s); got != c.want {
			t.Errorf("OnboardingRedirect(%+v) = %q, want %q", c.s, got, c.want)
		}
	}
	if asRole("superuser") != RoleClient {
		t.Error("an unknown role falls back to the least privileged shell")
	}
}

func TestAgentMFARedirect(t *testing.T) {
	if got := AgentMFARedirect(true, true); got != "" {
		t.Errorf("aal2 renders, got %q", got)
	}
	if got := AgentMFARedirect(false, true); got != "/login/mfa?next=%2Fagent" {
		t.Errorf("an unused factor goes to the challenge, got %q", got)
	}
	if got := AgentMFARedirect(false, false); got != "/mfa/setup?next=%2Fagent" {
		t.Errorf("no factor goes to setup, got %q", got)
	}
}

// Every layout loads against the real assets with a page in it, and its fill helper handles
// every slot, so no layout can ship a placeholder.
func TestEveryLayoutFillsCleanly(t *testing.T) {
	assetSet, err := static.Build(assets.FS, static.Bundles)
	if err != nil {
		t.Fatal(err)
	}
	pageFS := overlay(pages.FS, map[string]string{
		"x/page.html": `<!DOCTYPE html><html><head><title>Sample · Story-Tail Adventures</title></head><body><main><p>Hello</p></main></body></html>`,
	})
	fixed := time.Date(2031, 5, 1, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		layout  *page.Layout
		fill    func(d *page.Doc)
		want    []string
		absent  []string
		current []string // slots that must carry aria-current="page"
	}{
		{PublicHero, func(d *page.Doc) { FillPublic(d, "/caribbean", PublicChrome{Now: fixed}) },
			[]string{`© <span data-slot="footer-year">2031</span>`},
			[]string{"Preview content", `class="snackbar"`}, []string{"nav-caribbean", "drawer-caribbean"}},
		{PublicPlain, func(d *page.Doc) { FillPublic(d, "/how-it-works", PublicChrome{PlaceholderBanner: true, Now: fixed}) },
			[]string{"Preview content —"},
			[]string{`aria-current="page"`}, nil},
		{Auth, func(d *page.Doc) { FillAuth(d, "Check your inbox for a link to finish up.") },
			[]string{"Check your inbox for a link to finish up.", "STORY-TAIL · MEMBER PORTAL"}, nil, nil},
		{Onboarding, func(d *page.Doc) { FillOnboarding(d, "") }, nil, []string{`class="snackbar"`}, nil},
		{Client, func(d *page.Doc) { FillClient(d, "/trips/abc", Chrome{Initials: "JH"}) },
			[]string{`data-slot="avatar-initials">JH</span>`},
			nil, []string{"rail-trips", "tab-trips"}},
		{Agent, func(d *page.Doc) { FillAgent(d, "/agent/clients/1", Chrome{}) },
			[]string{`data-slot="account-initials">ST</span>`, `action="/account/sign-out"`},
			nil, []string{"rail-clients", "tab-clients"}},
	}
	for _, c := range cases {
		t.Run(c.layout.File, func(t *testing.T) {
			set, err := page.LoadWith(pageFS, page.Options{Assets: assetSet.Lookup}, page.Spec{File: "x/page.html", Layout: c.layout})
			if err != nil {
				t.Fatal(err)
			}
			tmpl, _ := set.Template("x/page.html")
			d := tmpl.New()
			c.fill(d)
			out, err := d.Bytes()
			if err != nil {
				t.Fatal(err)
			}
			got := string(out)
			for _, w := range append(c.want, "<p>Hello</p>", "<title>Sample · Story-Tail Adventures</title>") {
				if !strings.Contains(got, w) {
					t.Errorf("missing %q", w)
				}
			}
			for _, a := range c.absent {
				if strings.Contains(got, a) {
					t.Errorf("should not contain %q", a)
				}
			}
			// Exactly the expected items are current, and every asset URL is hashed.
			marked := regexp.MustCompile(`<a [^>]*aria-current="page"[^>]*>`).FindAllString(got, -1)
			if len(marked) != len(c.current) {
				t.Errorf("%d items marked current, want %d: %v", len(marked), len(c.current), marked)
			}
			for _, slot := range c.current {
				found := false
				for _, tag := range marked {
					found = found || strings.Contains(tag, `data-slot="`+slot+`"`)
				}
				if !found {
					t.Errorf("slot %q is not marked current", slot)
				}
			}
			if regexp.MustCompile(`"/assets/[a-z/_-]+\.(css|js|svg|webp|png|ico)[#"]`).MatchString(got) {
				t.Error("an unhashed asset URL reached the page")
			}
		})
	}
}

// overlay adds files to a read-only FS for a test page.
func overlay(base fs.FS, extra map[string]string) fs.FS {
	m := fstest.MapFS{}
	_ = fs.WalkDir(base, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := fs.ReadFile(base, p)
		if err != nil {
			return err
		}
		m[p] = &fstest.MapFile{Data: b}
		return nil
	})
	for k, v := range extra {
		m[k] = &fstest.MapFile{Data: []byte(v)}
	}
	return m
}
