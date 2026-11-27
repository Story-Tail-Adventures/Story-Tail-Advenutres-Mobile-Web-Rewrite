// Package config reads the server's environment once, at startup, and fails closed.
//
// It ports web/lib/env.ts. The difference that matters: Next.js set NODE_ENV=production by
// itself on `next start`, so the "local dev" escape hatch could never open in production by
// accident. Go has no such signal, so STA_ENV defaults to production. A deploy that forgot
// its variables refuses to start; it never silently skips auth.
//
// Values are read at runtime, so (unlike NEXT_PUBLIC_*) changing one needs a restart, not a
// rebuild. Secrets are never printed: Config's String and LogValue show only whether each
// one is set.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Env is the deployment mode.
type Env string

const (
	// Production is the default when STA_ENV is unset.
	Production Env = "production"
	// Development must be asked for by name (STA_ENV=development).
	Development Env = "development"
)

// Config is the whole runtime configuration. Add a field here, in Load, and in LogValue.
type Config struct {
	Env  Env
	Port string

	// SiteURL is the canonical origin (no trailing slash): canonical URLs, sitemap, robots
	// and auth redirects. Production must set it, and it must be https.
	SiteURL string

	SupabaseURL     string
	SupabaseAnonKey string `json:"-"` // public by design, but kept out of JSON with the rest

	// InquiryEmail is Gyasi's address for the few plain "email me" links. Empty in
	// production when unset, rather than inventing an address.
	InquiryEmail string

	// OAuth buttons render disabled until their provider is configured.
	GoogleAuthEnabled bool
	AppleAuthEnabled  bool

	// HotelSearchEnabled is the kill switch for live hotel search, which spends a metered
	// budget on a public page. On when unset or "true", off when "false"; any other value
	// is refused, so a typo like "off" or "0" cannot leave the meter running.
	HotelSearchEnabled bool

	// Secrets. Never logged, never sent to a browser, never marshalled to JSON.
	// AnalyticsMeasurementID is the GA4 stream (G-XXXXXXX). Not a secret: it ships to every
	// browser that is told yes. Empty switches analytics off entirely.
	AnalyticsMeasurementID string

	SerpAPIKey       string `json:"-"` // SERPAPI_API_KEY, the metered provider credential
	HotelSearchToken string `json:"-"` // STA_HOTEL_SEARCH_TOKEN, proves a cruise-search call is ours (until it is ported)
	LeadFormKey      string `json:"-"` // STA_LEAD_FORM_KEY, lets lead-message trust the forwarded address (until it is ported)

	// Backend (Track B, docs/GO-MIGRATION.md §5). Both required in production.
	//
	// SupabaseServiceRoleKey bypasses RLS. Only internal/api may hold it (ruling 14); it
	// must never reach a page, a log or a reply. Without it in development every function
	// passes through to Supabase, as in Phase 1.
	SupabaseServiceRoleKey string `json:"-"` // SUPABASE_SERVICE_ROLE_KEY
	// CronSecret is the bearer pg_cron sends to the cron functions (ruling 13), checked in
	// constant time. At least 32 characters in production: a short or placeholder value is
	// how cruise-sync 401'd silently for weeks.
	CronSecret string `json:"-"` // STA_CRON_SECRET
}

// minCronSecret is the shortest STA_CRON_SECRET production accepts (openssl rand -hex 32
// gives 64).
const minCronSecret = 32

// Load reads the configuration through getenv (os.Getenv in main, a map in tests).
// Every problem is reported at once, so a bad deploy shows the whole list.
func Load(getenv func(string) string) (Config, error) {
	var errs []error
	c := Config{}

	switch v := strings.TrimSpace(getenv("STA_ENV")); v {
	case "", string(Production):
		c.Env = Production
	case string(Development):
		c.Env = Development
	default:
		// A typo must not land in a mode nobody chose.
		errs = append(errs, fmt.Errorf("STA_ENV must be %q or %q, got %q", Production, Development, v))
		c.Env = Production
	}
	prod := c.Env == Production

	c.Port = strings.TrimSpace(getenv("PORT"))
	if c.Port == "" {
		c.Port = "8080"
	}
	if n, err := strconv.Atoi(c.Port); err != nil || n < 1 || n > 65535 {
		errs = append(errs, fmt.Errorf("PORT must be a number from 1 to 65535, got %q", c.Port))
	}

	c.SiteURL = strings.TrimRight(strings.TrimSpace(getenv("SITE_URL")), "/")
	switch {
	case c.SiteURL == "" && prod:
		errs = append(errs, errors.New("SITE_URL is required in production (the app's https origin)"))
	case c.SiteURL == "":
		c.SiteURL = "http://localhost:" + c.Port
	default:
		if err := checkOrigin(c.SiteURL, prod); err != nil {
			errs = append(errs, fmt.Errorf("SITE_URL: %w", err))
		}
	}

	c.SupabaseURL = strings.TrimRight(strings.TrimSpace(getenv("SUPABASE_URL")), "/")
	c.SupabaseAnonKey = strings.TrimSpace(getenv("SUPABASE_ANON_KEY"))
	switch {
	case prod && (c.SupabaseURL == "" || c.SupabaseAnonKey == ""):
		errs = append(errs, errors.New("SUPABASE_URL and SUPABASE_ANON_KEY are required in production"))
	case (c.SupabaseURL == "") != (c.SupabaseAnonKey == ""):
		errs = append(errs, errors.New("set both SUPABASE_URL and SUPABASE_ANON_KEY, or neither"))
	}
	if c.SupabaseURL != "" {
		if err := checkOrigin(c.SupabaseURL, prod); err != nil {
			errs = append(errs, fmt.Errorf("SUPABASE_URL: %w", err))
		}
	}

	// ALLOWED_ORIGIN, EMAIL_SITE_URL and EMAIL_UNSUBSCRIBE_URL are read at REQUEST time, by
	// internal/api/registry.go and internal/domain/email. Config does not hold them, so nothing
	// at startup could see a placeholder in one: ALLOWED_ORIGIN goes straight into an
	// Access-Control-Allow-Origin header, and a stale EMAIL_UNSUBSCRIBE_URL breaks the
	// unsubscribe link in mail that has already been sent — neither fails anything at boot.
	// email.go does check its two, but against `^https?://[^\s/]+$`, which the placeholder
	// "https://<your-domain-or-onrender-host>" satisfies. Startup is the last place a leftover
	// can be caught before it ships.
	//
	// Each stays optional; an unset one keeps the behaviour it has today. Only a value that is
	// set and cannot be a real address is an error.
	for _, v := range []struct {
		name string
		raw  string
		// origin is true for a bare origin, false for a URL that may carry a path.
		origin bool
	}{
		{"ALLOWED_ORIGIN", strings.TrimRight(strings.TrimSpace(getenv("ALLOWED_ORIGIN")), "/"), true},
		{"EMAIL_SITE_URL", strings.TrimRight(strings.TrimSpace(getenv("EMAIL_SITE_URL")), "/"), true},
		{"EMAIL_UNSUBSCRIBE_URL", strings.TrimSpace(getenv("EMAIL_UNSUBSCRIBE_URL")), false},
	} {
		if v.raw == "" {
			continue
		}
		check := checkURL
		if v.origin {
			check = checkOrigin
		}
		if err := check(v.raw, prod); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", v.name, err))
		}
	}

	c.InquiryEmail = strings.TrimSpace(getenv("INQUIRY_EMAIL"))
	if c.InquiryEmail == "" && !prod {
		c.InquiryEmail = "gyasi@example.com" // the seed agent's address
	}

	c.GoogleAuthEnabled = getenv("AUTH_GOOGLE_ENABLED") == "true"
	c.AppleAuthEnabled = getenv("AUTH_APPLE_ENABLED") == "true"
	switch v := strings.ToLower(strings.TrimSpace(getenv("HOTEL_SEARCH_ENABLED"))); v {
	case "", "true":
		c.HotelSearchEnabled = true
	case "false":
		c.HotelSearchEnabled = false
	default:
		errs = append(errs, fmt.Errorf(`HOTEL_SEARCH_ENABLED must be "true" or "false", got %q`, v))
	}

	// The GA4 measurement id. Empty means no analytics at all: no banner, no script, and
	// nothing asked of the visitor, which is what the Next app does with no Firebase config.
	c.AnalyticsMeasurementID = strings.TrimSpace(getenv("ANALYTICS_MEASUREMENT_ID"))
	if c.AnalyticsMeasurementID == "" {
		c.AnalyticsMeasurementID = strings.TrimSpace(getenv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"))
	}

	c.SerpAPIKey = strings.TrimSpace(getenv("SERPAPI_API_KEY"))
	c.HotelSearchToken = strings.TrimSpace(getenv("STA_HOTEL_SEARCH_TOKEN"))
	c.LeadFormKey = strings.TrimSpace(getenv("STA_LEAD_FORM_KEY"))

	c.SupabaseServiceRoleKey = strings.TrimSpace(getenv("SUPABASE_SERVICE_ROLE_KEY"))
	c.CronSecret = strings.TrimSpace(getenv("STA_CRON_SECRET"))
	if prod {
		if c.SupabaseServiceRoleKey == "" {
			errs = append(errs, errors.New("SUPABASE_SERVICE_ROLE_KEY is required in production (the ported functions run on it)"))
		}
		if len(c.CronSecret) < minCronSecret {
			errs = append(errs, fmt.Errorf("STA_CRON_SECRET must be at least %d characters in production", minCronSecret))
		}
	}

	return c, errors.Join(errs...)
}

// checkOrigin accepts a bare origin: scheme and host, no path, query or fragment. Production
// requires https; development also allows http (localhost, the local Supabase stack).
func checkOrigin(raw string, prod bool) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("not a URL: %q", raw)
	}
	if err := checkScheme(u, raw, prod, "origin"); err != nil {
		return err
	}
	if u.Host == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("must be an origin like https://example.com, got %q", raw)
	}
	return checkHost(u.Hostname(), prod)
}

// checkScheme allows https everywhere and http only outside production. kind names the shape
// in the error text ("origin" or "URL").
func checkScheme(u *url.URL, raw string, prod bool, kind string) error {
	switch {
	case u.Scheme == "https", u.Scheme == "http" && !prod:
		return nil
	case u.Scheme == "http":
		return fmt.Errorf("must be https in production, got %q", raw)
	default:
		return fmt.Errorf("must be an http(s) %s, got %q", kind, raw)
	}
}

// checkURL is checkOrigin for a value that may carry a path, like EMAIL_UNSUBSCRIBE_URL. The
// host still has to be one that could resolve.
func checkURL(raw string, prod bool) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("not a URL: %q", raw)
	}
	if err := checkScheme(u, raw, prod, "URL"); err != nil {
		return err
	}
	return checkHost(u.Hostname(), prod)
}

// hostLabel is one label of a hostname: letters, digits and hyphens, not starting or ending
// with a hyphen.
var hostLabel = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$`)

// reservedHosts are the names RFC 2606 and RFC 6761 set aside for documentation and testing.
// They resolve nowhere, so a production origin using one is a placeholder somebody forgot.
var reservedHosts = map[string]bool{
	"example": true, "example.com": true, "example.org": true, "example.net": true,
	"test": true, "invalid": true, "localhost": true,
}

// checkHost rejects a host that cannot be a real one.
//
// WHY THIS EXISTS. url.Parse is lenient about the authority: it accepted
// "https://<your-domain-or-onrender-host>" and reported the angle brackets as the Host,
// so SITE_URL passed every check above and the service booted on a placeholder. It then
// served that text as the canonical link, as og:url, as the Sitemap line in robots.txt and
// in all 33 sitemap entries, and would have built every auth redirect from it. Nothing
// failed; it was only visible by reading robots.txt on the live site.
//
// A placeholder that fails loudly is a placeholder; one that fails quietly is a bug waiting
// for a deploy (.github/workflows/deploy.yml says the same thing about its own).
func checkHost(host string, prod bool) error {
	if host == "" {
		return fmt.Errorf("has no host")
	}
	for _, label := range strings.Split(host, ".") {
		if !hostLabel.MatchString(label) {
			return fmt.Errorf("%q is not a hostname (bad label %q) — a leftover placeholder?", host, label)
		}
	}
	if !prod {
		return nil
	}
	// In production the origin is public, so it needs a name that can resolve: a dot, and
	// not one of the names the RFCs reserve for documentation.
	if !strings.Contains(host, ".") {
		return fmt.Errorf("%q has no dot, so it cannot resolve in production — a leftover placeholder?", host)
	}
	if reservedHosts[strings.ToLower(host)] {
		return fmt.Errorf("%q is reserved for documentation and resolves nowhere", host)
	}
	return nil
}

// SupabaseConfigured reports whether both Supabase values are present.
func (c Config) SupabaseConfigured() bool {
	return c.SupabaseURL != "" && c.SupabaseAnonKey != ""
}

// AuthChecksDisabledForLocalDev is the escape hatch that lets pages render before a local
// Supabase stack exists. It can only be true in development; Load refuses to start a
// production server without Supabase.
func (c Config) AuthChecksDisabledForLocalDev() bool {
	return c.Env == Development && !c.SupabaseConfigured()
}

// LogValue implements slog.LogValuer: everything useful for a startup line, no secret.
func (c Config) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("env", string(c.Env)),
		slog.String("port", c.Port),
		slog.String("site_url", c.SiteURL),
		slog.String("supabase_url", c.SupabaseURL),
		slog.Bool("supabase_anon_key_set", c.SupabaseAnonKey != ""),
		slog.Bool("inquiry_email_set", c.InquiryEmail != ""),
		slog.Bool("google_auth", c.GoogleAuthEnabled),
		slog.Bool("apple_auth", c.AppleAuthEnabled),
		slog.Bool("hotel_search_enabled", c.HotelSearchEnabled),
		slog.Bool("analytics_configured", c.AnalyticsMeasurementID != ""),
		slog.Bool("serpapi_key_set", c.SerpAPIKey != ""),
		slog.Bool("hotel_search_token_set", c.HotelSearchToken != ""),
		slog.Bool("lead_form_key_set", c.LeadFormKey != ""),
		slog.Bool("service_role_key_set", c.SupabaseServiceRoleKey != ""),
		slog.Bool("cron_secret_set", c.CronSecret != ""),
	)
}

// String keeps %v and %+v from printing secrets.
func (c Config) String() string { return c.LogValue().String() }

// GoString keeps %#v from printing secrets.
func (c Config) GoString() string { return "config.Config" + c.String() }
