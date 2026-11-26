package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"testing"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

var goodProd = map[string]string{
	"SITE_URL":                  "https://storytail-web.onrender.com",
	"SUPABASE_URL":              "https://abcdefghij.supabase.co",
	"SUPABASE_ANON_KEY":         "anon-key",
	"SUPABASE_SERVICE_ROLE_KEY": "service-key",
	"STA_CRON_SECRET":           "0123456789abcdef0123456789abcdef",
}

func with(base map[string]string, kv ...string) map[string]string {
	out := make(map[string]string, len(base)+len(kv)/2)
	for k, v := range base {
		out[k] = v
	}
	for i := 0; i+1 < len(kv); i += 2 {
		out[kv[i]] = kv[i+1]
	}
	return out
}

// The fail-closed rule: an unset STA_ENV is production, so a deploy that forgot its
// variables refuses to start instead of opening the local-dev escape hatch.
func TestUnsetEnvIsProductionAndFailsClosed(t *testing.T) {
	c, err := Load(env(map[string]string{}))
	if err == nil {
		t.Fatal("empty environment loaded without error")
	}
	if c.Env != Production {
		t.Errorf("Env = %q, want production", c.Env)
	}
	for _, want := range []string{"SITE_URL", "SUPABASE_URL"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error does not mention %s: %v", want, err)
		}
	}
	if c.AuthChecksDisabledForLocalDev() {
		t.Error("auth checks disabled in production")
	}
}

func TestGoodProduction(t *testing.T) {
	c, err := Load(env(with(goodProd, "SITE_URL", "https://storytail-web.onrender.com/")))
	if err != nil {
		t.Fatal(err)
	}
	if c.SiteURL != "https://storytail-web.onrender.com" {
		t.Errorf("SiteURL = %q, trailing slash not trimmed", c.SiteURL)
	}
	if c.Port != "8080" {
		t.Errorf("Port = %q, want 8080", c.Port)
	}
	if c.InquiryEmail != "" {
		t.Errorf("InquiryEmail = %q, production must not invent an address", c.InquiryEmail)
	}
	if !c.HotelSearchEnabled {
		t.Error("hotel search should default to on")
	}
	if c.GoogleAuthEnabled || c.AppleAuthEnabled {
		t.Error("OAuth should default to off")
	}
}

func TestProductionRefuses(t *testing.T) {
	cases := map[string]map[string]string{
		"http site url":         with(goodProd, "SITE_URL", "http://storytail-web.onrender.com"),
		"site url with a path":  with(goodProd, "SITE_URL", "https://example.com/app"),
		"site url with a query": with(goodProd, "SITE_URL", "https://example.com?x=1"),
		"site url with a user":  with(goodProd, "SITE_URL", "https://me@example.com"),
		"not a url":             with(goodProd, "SITE_URL", "storytail"),
		"http supabase":         with(goodProd, "SUPABASE_URL", "http://abcdefghij.supabase.co"),
		"missing anon key":      with(goodProd, "SUPABASE_ANON_KEY", ""),
		"typo in STA_ENV":       with(goodProd, "STA_ENV", "prod"),
		"bad port":              with(goodProd, "PORT", "eighty"),
		"port out of range":     with(goodProd, "PORT", "70000"),
		"no service role key":   with(goodProd, "SUPABASE_SERVICE_ROLE_KEY", ""),
		"no cron secret":        with(goodProd, "STA_CRON_SECRET", ""),
		"short cron secret":     with(goodProd, "STA_CRON_SECRET", "placeholder"),
	}
	for name, m := range cases {
		if _, err := Load(env(m)); err == nil {
			t.Errorf("%s: loaded without error", name)
		}
	}
}

// Development runs without the backend secrets: every function then passes through.
func TestDevelopmentNeedsNoBackendSecrets(t *testing.T) {
	c, err := Load(env(map[string]string{"STA_ENV": "development"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.SupabaseServiceRoleKey != "" || c.CronSecret != "" {
		t.Error("backend secrets must not be invented")
	}
}

func TestDevelopmentDefaults(t *testing.T) {
	c, err := Load(env(map[string]string{"STA_ENV": "development", "PORT": "8181"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.SiteURL != "http://localhost:8181" {
		t.Errorf("SiteURL = %q", c.SiteURL)
	}
	if c.InquiryEmail != "gyasi@example.com" {
		t.Errorf("InquiryEmail = %q", c.InquiryEmail)
	}
	if !c.AuthChecksDisabledForLocalDev() {
		t.Error("dev with no Supabase should disable auth checks")
	}

	c, err = Load(env(map[string]string{
		"STA_ENV": "development", "SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_ANON_KEY": "local",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.AuthChecksDisabledForLocalDev() {
		t.Error("dev with Supabase configured must keep auth checks on")
	}
}

func TestDevelopmentRefusesHalfASupabase(t *testing.T) {
	if _, err := Load(env(map[string]string{"STA_ENV": "development", "SUPABASE_URL": "http://127.0.0.1:54321"})); err == nil {
		t.Error("URL without key loaded")
	}
	if _, err := Load(env(map[string]string{"STA_ENV": "development", "SUPABASE_ANON_KEY": "local"})); err == nil {
		t.Error("key without URL loaded")
	}
}

func TestFlags(t *testing.T) {
	c, err := Load(env(with(goodProd,
		"AUTH_GOOGLE_ENABLED", "true", "AUTH_APPLE_ENABLED", "TRUE", "HOTEL_SEARCH_ENABLED", "false")))
	if err != nil {
		t.Fatal(err)
	}
	if !c.GoogleAuthEnabled {
		t.Error(`AUTH_GOOGLE_ENABLED="true" not read`)
	}
	if c.AppleAuthEnabled {
		t.Error(`only the exact string "true" turns a provider on, as in env.ts`)
	}
	if c.HotelSearchEnabled {
		t.Error(`HOTEL_SEARCH_ENABLED="false" did not turn search off`)
	}

	c, err = Load(env(with(goodProd, "HOTEL_SEARCH_ENABLED", "FALSE")))
	if err != nil || c.HotelSearchEnabled {
		t.Errorf(`HOTEL_SEARCH_ENABLED="FALSE": enabled=%v err=%v, want off`, c.HotelSearchEnabled, err)
	}
	// A typo must not leave a metered search running.
	for _, v := range []string{"off", "0", "no", "disabled", "flase"} {
		if _, err := Load(env(with(goodProd, "HOTEL_SEARCH_ENABLED", v))); err == nil {
			t.Errorf("HOTEL_SEARCH_ENABLED=%q loaded without error", v)
		}
	}
}

// Secrets must not reach a log line or a %v, whatever verb is used.
func TestSecretsNeverPrinted(t *testing.T) {
	c, err := Load(env(with(goodProd,
		"SUPABASE_ANON_KEY", "anon-SECRET-1",
		"SERPAPI_API_KEY", "serp-SECRET-2",
		"STA_HOTEL_SEARCH_TOKEN", "token-SECRET-3",
		"STA_LEAD_FORM_KEY", "lead-SECRET-4",
		"SUPABASE_SERVICE_ROLE_KEY", "service-SECRET-5",
		"STA_CRON_SECRET", "cron-SECRET-6-0123456789abcdef0123456789")))
	if err != nil {
		t.Fatal(err)
	}

	var logged bytes.Buffer
	slog.New(slog.NewJSONHandler(&logged, nil)).Info("start", "config", c)
	asJSON, err := json.Marshal(c)
	if err != nil {
		t.Fatal(err)
	}

	outputs := []string{
		logged.String(),
		string(asJSON),
		fmt.Sprintf("%v", c),
		fmt.Sprintf("%+v", c),
		fmt.Sprintf("%#v", c),
		fmt.Sprint(c),
		c.String(),
	}
	for _, out := range outputs {
		if strings.Contains(out, "SECRET") {
			t.Errorf("a secret was printed: %s", out)
		}
	}
	for _, set := range []string{`"serpapi_key_set":true`, `"service_role_key_set":true`, `"cron_secret_set":true`} {
		if !strings.Contains(logged.String(), set) {
			t.Errorf("log line should still say %s: %s", set, logged.String())
		}
	}
}
