package page

import "testing"

func TestSafeURL(t *testing.T) {
	allowed := map[string]string{
		"/trips/123":                  "/trips/123",
		"trips/123":                   "trips/123",
		"./x":                         "./x",
		"?tab=payments":               "?tab=payments",
		"#itinerary":                  "#itinerary",
		"  /padded  ":                 "/padded",
		"https://example.com/x?y=1#z": "https://example.com/x?y=1#z",
		"HTTPS://Example.com":         "HTTPS://Example.com",
		"mailto:gyasi@example.com":    "mailto:gyasi@example.com",
		"tel:+15555550100":            "tel:+15555550100",
		"/search?q=a%3Ab":             "/search?q=a%3Ab",
		// The entity is not decoded on the way out: the attribute is written as
		// "javascript&amp;colon;...", which a browser reads back as this literal relative
		// path. Pinned so nobody "fixes" it into a decode.
		"javascript&colon;alert(1)": "javascript&colon;alert(1)",
	}
	for in, want := range allowed {
		got, ok := SafeURL(in)
		if !ok || got != want {
			t.Errorf("SafeURL(%q) = (%q, %v), want (%q, true)", in, got, ok, want)
		}
	}

	refused := []string{
		"",
		"   ",
		"javascript:alert(1)",
		"JaVaScRiPt:alert(1)",
		" javascript:alert(1)",
		" javascript:alert(1)",
		"java\tscript:alert(1)",
		"java\nscript:alert(1)",
		"\x01javascript:alert(1)",
		"javascript\x00:alert(1)",
		"vbscript:msgbox(1)",
		"data:text/html,<script>alert(1)</script>",
		"file:///etc/passwd",
		"http://example.com", // https only
		"//evil.example/x",   // scheme-relative leaves the site
		"/\\evil.example/x",  // browsers read \ as /
		"\\\\evil.example",
		"https://",
		"https:example.com", // no host
		"https://good.example@evil.example/",
		"https://user:pass@example.com/",
		"mailto:",
		"tel:",
		"foo:bar",
		"%zz",
	}
	for _, in := range refused {
		if got, ok := SafeURL(in); ok {
			t.Errorf("SafeURL(%q) allowed it as %q", in, got)
		}
	}
}

func TestSafePayURL(t *testing.T) {
	for _, in := range []string{"https://pay.example.com/m/123", "https://www.travefy.com/invoice/abc?x=1"} {
		if _, ok := SafePayURL(in); !ok {
			t.Errorf("SafePayURL(%q) refused a good pay link", in)
		}
	}
	for _, in := range []string{
		"http://pay.example.com/m/123",
		"/payments/123",
		"?pay=1",
		"mailto:gyasi@example.com",
		"tel:+15555550100",
		"javascript:alert(1)",
		"//pay.example.com",
		"https://good.example@evil.example",
		"",
	} {
		if got, ok := SafePayURL(in); ok {
			t.Errorf("SafePayURL(%q) allowed it as %q", in, got)
		}
	}
}
