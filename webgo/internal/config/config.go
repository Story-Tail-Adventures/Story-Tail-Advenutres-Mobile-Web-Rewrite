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
	switch {
	case u.Scheme == "https":
	case u.Scheme == "http" && !prod:
	case u.Scheme == "http":
		return fmt.Errorf("must be https in production, got %q", raw)
	default:
		return fmt.Errorf("must be an http(s) origin, got %q", raw)
	}
	if u.Host == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("must be an origin like https://example.com, got %q", raw)
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
