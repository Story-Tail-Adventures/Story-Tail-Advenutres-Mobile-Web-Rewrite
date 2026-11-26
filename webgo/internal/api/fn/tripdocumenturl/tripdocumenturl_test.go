package tripdocumenturl

import (
	"net/http/httptest"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

func TestMethodIsCheckedFirst(t *testing.T) {
	for _, m := range []string{"POST", "PATCH", "DELETE"} {
		_, err := Func(nil, httptest.NewRequest(m, "/functions/v1/trip-document-url?documentId=x", nil))
		p, ok := problem.As(err)
		if !ok || p.Status != 400 || p.Detail != "Use GET." {
			t.Errorf("%s: %v", m, err)
		}
	}
}

// What URLSearchParams.get answered for each query string (checked in Deno).
func TestSearchParamIsURLSearchParams(t *testing.T) {
	for _, c := range []struct {
		raw, want string
		found     bool
	}{
		{"", "", false},
		{"documentId", "", true},
		{"documentId=", "", true},
		{"documentId=abc", "abc", true},
		{"a=1&&documentId=x&documentId=y", "x", true},
		{"documentId=%zz", "%zz", true},
		{"documentId=%4", "%4", true},
		{"documentId=a%20b+c", "a b c", true},
		{"document%49d=v", "v", true},
		{"documentId=a;b", "a;b", true},
		{"documentId=a=b", "a=b", true},
		{"documentid=x", "", false},
		{"documentId=%C3%A9", "\U000000e9", true},
		{"documentId=%FF", "\U0000FFFD", true},
	} {
		got, found := searchParam(c.raw, "documentId")
		if got != c.want || found != c.found {
			t.Errorf("%q: %q %v, want %q %v", c.raw, got, found, c.want, c.found)
		}
	}
}
