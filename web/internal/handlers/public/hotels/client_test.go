package hotels

// Ported from web/lib/hotels/client.test.ts. Every case is a paid-for failure: a credential
// somewhere it outlives the incident, or a retry that cannot succeed spending searches to
// learn nothing on a 250-a-month plan.
//
// Three TypeScript cases have no Go counterpart because the thing they tested was not
// ported: the request recorder (and with it "rows_returned is recorded") and the free
// account.json read. Nothing on the web path used either; web/lib/public/hotels.ts passes
// no recorder on purpose, since there is no ledger to feed. "Every attempt is recorded"
// survives as the count of requests the fake server saw.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestTheKeyIsSentAsAQueryParameter(t *testing.T) {
	// Asserted positively, so the departure from "a key never goes in a URL" is recorded by
	// a test and not only by a comment. SerpApi offers no header for it.
	fake, srv := newFake(t, reply{body: searchPage})
	s, _ := testSearcher(t, srv.URL)
	if got := s.Search(context.Background(), arubaArgs()); got.Status != StatusOK {
		t.Fatalf("status = %q, want ok", got.Status)
	}
	calls := fake.calls()
	if len(calls) != 1 {
		t.Fatalf("calls = %d, want 1", len(calls))
	}
	if calls[0].Path != "/search" {
		t.Errorf("path = %q, want /search", calls[0].Path)
	}
	if calls[0].Query().Get("api_key") != testKey {
		t.Error("the key was not sent as api_key")
	}
}

func TestBuildURLAppendsTheKeyLastAndLeavesTheParamsAlone(t *testing.T) {
	params := []param{{"engine", "google_hotels"}, {"q", "st. john's & co"}}
	before := slices.Clone(params)
	got := buildURL("https://serpapi.com/search", params, testKey)
	want := "https://serpapi.com/search?engine=google_hotels&q=st.+john%27s+%26+co&api_key=" + testKey
	if got != want {
		t.Errorf("buildURL =\n  %s\nwant\n  %s", got, want)
	}
	// The parameter set is what describes the visitor's search; the key is added to the URL
	// only, never to anything a caller holds on to.
	if !slices.Equal(params, before) {
		t.Errorf("buildURL changed its params: %v", params)
	}
}

func TestRedact(t *testing.T) {
	cases := []struct {
		name, in, key, want string
	}{
		{"the key we hold", "bad key " + testKey + " here", testKey, "bad key [redacted] here"},
		{"every copy of it", testKey + "/" + testKey, testKey, "[redacted]/[redacted]"},
		{
			// Equality alone would miss this: a rotated credential echoed back is not the key
			// we hold. The whole query goes, which takes the visitor's search with it.
			"a different key echoed in a URL",
			"Invalid key: https://serpapi.com/search?q=aruba&api_key=" + rotatedKey,
			testKey,
			"Invalid key: https://serpapi.com/search?[redacted]",
		},
		{"a different key outside a URL", "sent ?api_key=" + rotatedKey + "&q=x", testKey, "sent ?api_key=[redacted]&q=x"},
		{"the name in any case", "&API_KEY=" + rotatedKey, "", "&API_KEY=[redacted]"},
		{"stops at a quote", `{"url":"?api_key=abc"}`, "", `{"url":"?api_key=[redacted]"}`},
		{"the key URL-encoded", "key a%2Bb%3D was refused", "a+b=", "key [redacted] was refused"},
		{"a URL in parentheses keeps its bracket", "for url (https://serpapi.com/search?q=aruba&api_key=k)", "", "for url (https://serpapi.com/search?[redacted])"},
		{"nothing to redact", "Invalid API key. Your API key should be here: /manage-api-key", testKey, "Invalid API key. Your API key should be here: /manage-api-key"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := redact(c.in, c.key); got != c.want {
				t.Errorf("redact(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestRetryPolicy(t *testing.T) {
	repeat := func(r reply, n int) []reply { return slices.Repeat([]reply{r}, n) }
	cases := []struct {
		name      string
		replies   []reply
		calls     int
		code      string
		permanent bool
	}{
		// Retrying a bad key spends searches to learn nothing.
		{"401 is not retried", []reply{{status: 401, body: errorBody}}, 1, "provider_401", true},
		{"400 is not retried", []reply{{status: 400, body: `{"error":"bad"}`}}, 1, "provider_400", true},
		{"403 is not retried", []reply{{status: 403, body: `{"error":"no"}`}}, 1, "provider_403", true},
		{"404 is not retried", []reply{{status: 404, body: `{"error":"gone"}`}}, 1, "provider_404", true},
		// The hourly limit will not clear inside one request.
		{"429 is not retried", []reply{{status: 429, body: `{"error":"rate limited"}`}}, 1, "provider_429", true},
		// A redirect is answered the same way every time, and following it is the leak.
		{"a redirect is not retried", []reply{{status: 302, location: "https://example.invalid/"}}, 1, "provider_302", true},
		{"a 5xx is retried, then given up", repeat(reply{status: 502, body: `{"error":"bad gateway"}`}, 3), 3, "provider_unavailable", false},
		// SerpApi answers some failures with HTTP 200 and an error body. Mapping that to "no
		// hotels here" would tell the visitor something false.
		{"a 200 carrying error is a failure", repeat(reply{body: `{"error":"Google Hotels hasn't returned any results"}`}, 3), 3, "provider_unavailable", false},
		{"an unparseable 200 is a failure", repeat(reply{body: "<html>oops</html>"}, 3), 3, "provider_unavailable", false},
		{"a null body is a failure", repeat(reply{body: "null"}, 3), 3, "provider_unavailable", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fake, srv := newFake(t, c.replies...)
			s, _ := testSearcher(t, srv.URL)
			_, err := s.fetch(context.Background(), testParams())
			if err == nil {
				t.Fatal("fetch succeeded, want an error")
			}
			if got := len(fake.calls()); got != c.calls {
				t.Errorf("calls = %d, want %d", got, c.calls)
			}
			if err.code != c.code || err.permanent != c.permanent {
				t.Errorf("error = %s permanent=%v, want %s permanent=%v", err.code, err.permanent, c.code, c.permanent)
			}
		})
	}
}

func TestAServerErrorThenSuccessIsTwoRequests(t *testing.T) {
	fake, srv := newFake(t, reply{status: 500, body: `{"error":"upstream"}`}, reply{body: searchPage})
	s, _ := testSearcher(t, srv.URL)
	if got := s.Search(context.Background(), arubaArgs()); got.Status != StatusOK {
		t.Fatalf("status = %q, want ok", got.Status)
	}
	if got := len(fake.calls()); got != 2 {
		t.Errorf("calls = %d, want 2", got)
	}
}

func TestTheProviderReasonReachesTheLogNotJustTheStatus(t *testing.T) {
	// Without it, a 401 cannot tell a bad key from a spent plan without a trip to SerpApi.
	_, srv := newFake(t, reply{status: 401, body: errorBody})
	s, logs := testSearcher(t, srv.URL)
	if got := s.Search(context.Background(), arubaArgs()); got.Status != StatusUnavailable {
		t.Fatalf("status = %q, want unavailable", got.Status)
	}
	for _, want := range []string{"hotels: search failed", "code=provider_401", "status=401", "Invalid API key"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("log %q lacks %q", logs.String(), want)
		}
	}
}

func TestEachAttemptHasItsOwnDeadline(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	s, _ := testSearcher(t, srv.URL)
	s.timeout = 50 * time.Millisecond

	start := time.Now()
	_, err := s.fetch(context.Background(), testParams())
	if err == nil || err.code != codeNetwork {
		t.Fatalf("err = %v, want %s", err, codeNetwork)
	}
	// A timeout is network-class, so it is retried like the TypeScript's aborted fetch.
	if got := hits.Load(); got != 3 {
		t.Errorf("attempts = %d, want 3", got)
	}
	if elapsed := time.Since(start); elapsed > 3*time.Second {
		t.Errorf("took %v: the per-attempt deadline did not hold", elapsed)
	}
}

func TestACancelledSearchStopsRetrying(t *testing.T) {
	fake, srv := newFake(t)
	s, _ := testSearcher(t, srv.URL)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if got := s.Search(ctx, arubaArgs()); got.Status != StatusUnavailable {
		t.Errorf("status = %q, want unavailable", got.Status)
	}
	if got := len(fake.calls()); got != 0 {
		t.Errorf("calls = %d, want 0", got)
	}
}

func TestTheHTTPClient(t *testing.T) {
	s := New(Config{Enabled: true, APIKey: testKey})
	if s.http == http.DefaultClient {
		t.Fatal("the searcher uses http.DefaultClient, which has no timeout")
	}
	if s.http.Timeout != 12*time.Second || s.timeout != 12*time.Second {
		t.Errorf("timeouts = %v / %v, want 12s, the TypeScript's DEFAULT_TIMEOUT_MS", s.http.Timeout, s.timeout)
	}
	if s.searchURL != "https://serpapi.com/search" {
		t.Errorf("searchURL = %q", s.searchURL)
	}
	if s.http.CheckRedirect == nil || !errors.Is(s.http.CheckRedirect(nil, nil), http.ErrUseLastResponse) {
		t.Error("the client would follow a redirect")
	}

	// A client passed in is copied, so setting the redirect rule never changes a client
	// someone else shares, http.DefaultClient included.
	for _, mine := range []*http.Client{{Timeout: time.Minute}, http.DefaultClient} {
		s := New(Config{Enabled: true, APIKey: testKey, HTTP: mine})
		if mine.CheckRedirect != nil {
			t.Error("New changed the caller's client")
		}
		if s.http == mine {
			t.Error("the searcher shares the caller's client instead of a copy")
		}
		if s.http.CheckRedirect == nil {
			t.Error("the copy would follow a redirect")
		}
		if s.timeout != 12*time.Second {
			t.Errorf("per-attempt timeout = %v, want 12s whatever the client says", s.timeout)
		}
	}
}

func TestBaseURLMustNotSendTheKeyInTheClear(t *testing.T) {
	for _, base := range []string{
		"http://serpapi.com",
		"ftp://serpapi.com",
		"https://user:pw@serpapi.com",
		"https://serpapi.com/?x=1",
		"https://serpapi.com/?",
		"https://serpapi.com/#frag",
		"serpapi.com",
		"https://",
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("New accepted BaseURL %q", base)
				}
			}()
			New(Config{BaseURL: base})
		}()
	}
	for _, base := range []string{"https://serpapi.com", "https://serpapi.com/", "http://127.0.0.1:8080", "http://localhost:9", "http://[::1]:80"} {
		New(Config{BaseURL: base})
	}
}
