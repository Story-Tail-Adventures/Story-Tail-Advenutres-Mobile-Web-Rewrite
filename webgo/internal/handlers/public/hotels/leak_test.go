package hotels

// SERPAPI_API_KEY travels in the request's query string, because SerpApi offers no header.
// PR #48 found four ways the Next version leaked it; these are the Go equivalents. Each case
// drives a failure that carries the full URL somewhere (Go's *url.Error, a provider error
// that echoes the request, a runtime message that embeds it, a redirect's Location) and
// asserts the key is in none of: the error fetch returns, the Result, the log.
//
// Each case first proves its leak path is real, the discipline map.test.ts uses: a test
// that passes against an error that never held the key proves nothing.

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// secrets is what must never escape: both keys, and the visitor's search.
var secrets = []string{testKey, rotatedKey, "aruba", "Aruba", "2026-12-19", "2026-12-26"}

// echoTransport fails every request the way Deno's fetch does: with a message that embeds
// the full request URL.
type echoTransport struct{}

func (echoTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return nil, fmt.Errorf("error sending request for url (%s)", r.URL)
}

func TestTheKeyNeverEscapes(t *testing.T) {
	cases := []struct {
		name string
		// setup returns a searcher whose every request fails the way the case describes,
		// and the poisoned string Go or the provider produced, to prove the path is real.
		setup func(t *testing.T) (*Searcher, fmt.Stringer, string)
	}{
		{
			name: "unreachable host: Go's *url.Error embeds the URL",
			setup: func(t *testing.T) (*Searcher, fmt.Stringer, string) {
				srv := httptest.NewServer(http.NotFoundHandler())
				base := srv.URL
				srv.Close()
				_, raw := (&http.Client{}).Get(buildURL(base+searchPath, testParams(), testKey))
				if raw == nil {
					t.Fatal("expected a closed port to refuse the connection")
				}
				s, logs := testSearcher(t, base)
				return s, logs, raw.Error()
			},
		},
		{
			name: "a runtime whose own message embeds the URL",
			setup: func(t *testing.T) (*Searcher, fmt.Stringer, string) {
				s, logs := testSearcher(t, "")
				s.http = &http.Client{Transport: echoTransport{}}
				_, raw := echoTransport{}.RoundTrip(httptestRequest(t))
				return s, logs, raw.Error()
			},
		},
		{
			name: "a provider error that echoes the request with our key and a rotated one",
			setup: func(t *testing.T) (*Searcher, fmt.Stringer, string) {
				body := `{"error":"Invalid key for https://serpapi.com/search?q=aruba&check_in_date=2026-12-19&api_key=` + testKey +
					` (last good: https://serpapi.com/search?api_key=` + rotatedKey + `)"}`
				_, srv := newFake(t, reply{status: 401, body: body}, reply{status: 401, body: body})
				s, logs := testSearcher(t, srv.URL)
				return s, logs, body
			},
		},
		{
			name: "a 200 error body that echoes the key, retried three times",
			setup: func(t *testing.T) (*Searcher, fmt.Stringer, string) {
				body := `{"error":"upstream said: api_key=` + testKey + `"}`
				r := reply{body: body}
				_, srv := newFake(t, r, r, r, r, r, r)
				s, logs := testSearcher(t, srv.URL)
				return s, logs, body
			},
		},
		{
			name: "a redirect whose Location carries the key",
			setup: func(t *testing.T) (*Searcher, fmt.Stringer, string) {
				var hit atomic.Bool
				evil := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { hit.Store(true) }))
				t.Cleanup(func() {
					evil.Close()
					if hit.Load() {
						t.Error("the client followed a redirect to another host with the key")
					}
				})
				loc := evil.URL + "/steal?q=aruba&api_key=" + testKey
				_, srv := newFake(t, reply{status: 307, location: loc}, reply{status: 302, location: loc})
				s, logs := testSearcher(t, srv.URL)
				return s, logs, loc
			},
		},
		{
			name: "a redirect Location Go cannot parse, which it quotes in its error",
			setup: func(t *testing.T) (*Searcher, fmt.Stringer, string) {
				loc := "https://evil.example/%zz?q=aruba&api_key=" + testKey
				// One for the probe below, three for fetch, three for Search: Go refuses the
				// Location before it asks CheckRedirect, so this is a retried network error.
				r := reply{status: 302, location: loc}
				_, srv := newFake(t, r, r, r, r, r, r, r)
				s, logs := testSearcher(t, srv.URL)
				_, raw := s.http.Get(srv.URL + "/probe")
				if raw == nil {
					t.Fatal("expected Go to refuse the Location")
				}
				return s, logs, raw.Error()
			},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, logs, poisoned := c.setup(t)
			if !strings.Contains(poisoned, testKey) {
				t.Fatalf("the leak path is not real; it never held the key: %s", poisoned)
			}

			_, err := s.fetch(context.Background(), testParams())
			if err == nil {
				t.Fatal("fetch succeeded, want a failure")
			}
			assertAbsent(t, "the returned error", []string{testKey, rotatedKey},
				err.Error(), fmt.Sprintf("%v", err), fmt.Sprintf("%+v", err), fmt.Sprintf("%#v", err))
			assertAbsent(t, "the error's detail", []string{testKey, rotatedKey, "aruba"}, err.detail)

			res := s.Search(context.Background(), arubaArgs())
			if res.Status == StatusOK {
				t.Fatalf("Search succeeded, want a failure")
			}
			assertAbsent(t, "the result", secrets, append(allStrings(res), fmt.Sprintf("%#v", res))...)
			assertAbsent(t, "the log", secrets, logs.String())
			if !strings.Contains(logs.String(), "hotels: search failed") {
				t.Errorf("the failure was not logged: %q", logs.String())
			}
		})
	}
}

// A network error's detail is the runtime's own text, which can quote the request: it is
// never logged, even redacted, because redaction strips the key and not the visitor's plan.
func TestANetworkErrorsDetailIsNeverLogged(t *testing.T) {
	s, logs := testSearcher(t, "")
	s.http = &http.Client{Transport: echoTransport{}}
	_, err := s.fetch(context.Background(), testParams())
	if err == nil || err.code != codeNetwork {
		t.Fatalf("err = %v, want %s", err, codeNetwork)
	}
	// The redactor really ran on the catch path: the URL it held is marked, not dropped.
	if !strings.Contains(err.detail, "[redacted]") {
		t.Errorf("detail %q shows no redaction", err.detail)
	}
	s.Search(context.Background(), arubaArgs())
	if strings.Contains(logs.String(), "detail=") {
		t.Errorf("a network error logged its detail: %q", logs.String())
	}
	if !strings.Contains(logs.String(), "code=network_error") || !strings.Contains(logs.String(), "status=<nil>") {
		t.Errorf("log %q lacks the code and the absent status", logs.String())
	}
}

// Wrapping the error the transport gave is the trap this package avoids; this pins that the
// trap is real in the standard library, so the test above means something.
func TestGoEmbedsTheURLInClientErrors(t *testing.T) {
	_, err := (&http.Client{Transport: failingTransport{}}).Get("https://serpapi.com/search?api_key=" + testKey)
	if err == nil || !strings.Contains(err.Error(), testKey) {
		t.Fatalf("expected *url.Error to quote the key; got %v", err)
	}
	if !errors.Is(err, errFailing) {
		t.Fatalf("expected the cause to be wrapped; got %v", err)
	}
}

var errFailing = errors.New("connection reset")

type failingTransport struct{}

func (failingTransport) RoundTrip(*http.Request) (*http.Response, error) { return nil, errFailing }

func httptestRequest(t *testing.T) *http.Request {
	t.Helper()
	r, err := http.NewRequest(http.MethodGet, buildURL("https://serpapi.com"+searchPath, testParams(), testKey), nil)
	if err != nil {
		t.Fatal(err)
	}
	return r
}
