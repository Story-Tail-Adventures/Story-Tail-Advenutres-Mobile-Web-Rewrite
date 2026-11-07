package people

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// The country list must match web/lib/countries.ts while that file exists.
func TestCountriesMatchTheNextApp(t *testing.T) {
	src, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "web", "lib", "countries.ts"))
	if os.IsNotExist(err) {
		t.Skip("web/ is gone (Phase 6); countries.go is the source of truth now")
	}
	if err != nil {
		t.Fatal(err)
	}
	m := regexp.MustCompile(`\{ code: "([A-Z]{2})", name: "((?:[^"\\]|\\.)*)" \}`).FindAllStringSubmatch(string(src), -1)
	if len(m) != len(countries) {
		t.Fatalf("Next has %d countries, Go %d", len(m), len(countries))
	}
	for i, c := range m {
		if countries[i].Code != c[1] || countries[i].Name != c[2] {
			t.Errorf("country %d: Go %+v, Next %s %s", i, countries[i], c[1], c[2])
		}
	}
	if !isCountryCode("US") || isCountryCode("ZZ") || isCountryCode("us") {
		t.Error("isCountryCode")
	}
}
