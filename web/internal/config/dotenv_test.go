package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseDotEnv(t *testing.T) {
	got, err := ParseDotEnv(strings.NewReader(`
# local stack
SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY="anon value"
QUOTED='single'
EMPTY=
`))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_ANON_KEY": "anon value",
		"QUOTED": "single", "EMPTY": "",
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %q, want %q", k, got[k], v)
		}
	}
	if _, err := ParseDotEnv(strings.NewReader("not a pair")); err == nil {
		t.Error("a line without = was accepted")
	}
}

func TestDevGetenvOnlyInDevelopment(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env.local")
	if err := os.WriteFile(path, []byte("SUPABASE_URL=http://from-file\nSITE_URL=http://file-site\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Production (STA_ENV unset): the file is never read, even if it exists.
	prod := func(k string) string { return "" }
	g, err := DevGetenv(prod, path)
	if err != nil || g("SUPABASE_URL") != "" {
		t.Errorf("production read the file: %q %v", g("SUPABASE_URL"), err)
	}

	// The file cannot turn development on by itself.
	sneaky := filepath.Join(t.TempDir(), ".env.local")
	_ = os.WriteFile(sneaky, []byte("STA_ENV=development\n"), 0o600)
	g, _ = DevGetenv(prod, sneaky)
	if g("STA_ENV") != "" {
		t.Error("the file switched the server into development")
	}

	// Development: the file fills gaps, the real environment wins.
	dev := func(k string) string {
		return map[string]string{"STA_ENV": "development", "SITE_URL": "http://real-site"}[k]
	}
	g, err = DevGetenv(dev, path)
	if err != nil {
		t.Fatal(err)
	}
	if g("SUPABASE_URL") != "http://from-file" || g("SITE_URL") != "http://real-site" {
		t.Errorf("SUPABASE_URL=%q SITE_URL=%q", g("SUPABASE_URL"), g("SITE_URL"))
	}

	// A missing file is fine.
	if _, err := DevGetenv(dev, filepath.Join(t.TempDir(), "absent")); err != nil {
		t.Errorf("missing file: %v", err)
	}
}
