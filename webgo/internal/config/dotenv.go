package config

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"strings"
)

// DevGetenv returns the getenv Load should use. Only when the real environment says
// STA_ENV=development does it also read webgo/.env.local (gitignored), so local Supabase
// values need not be typed into every shell. Real environment variables always win, and a
// production process never reads the file: the default mode is production, so it cannot be
// switched on by the file itself.
func DevGetenv(getenv func(string) string, path string) (func(string) string, error) {
	if strings.TrimSpace(getenv("STA_ENV")) != string(Development) {
		return getenv, nil
	}
	f, err := os.Open(path)
	if errors.Is(err, fs.ErrNotExist) {
		return getenv, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	file, err := ParseDotEnv(f)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return func(k string) string {
		if v := getenv(k); v != "" {
			return v
		}
		return file[k]
	}, nil
}

// ParseDotEnv reads KEY=VALUE lines. Blank lines and # comments are skipped, an optional
// "export " prefix is allowed, and a value may be wrapped in single or double quotes.
func ParseDotEnv(r io.Reader) (map[string]string, error) {
	out := map[string]string{}
	sc := bufio.NewScanner(r)
	for n := 1; sc.Scan(); n++ {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		k, v, ok := strings.Cut(line, "=")
		k = strings.TrimSpace(k)
		if !ok || k == "" || strings.ContainsAny(k, " \t") {
			return nil, fmt.Errorf("line %d is not KEY=VALUE", n)
		}
		v = strings.TrimSpace(v)
		if len(v) >= 2 && (v[0] == '"' && v[len(v)-1] == '"' || v[0] == '\'' && v[len(v)-1] == '\'') {
			v = v[1 : len(v)-1]
		}
		out[k] = v
	}
	return out, sc.Err()
}
