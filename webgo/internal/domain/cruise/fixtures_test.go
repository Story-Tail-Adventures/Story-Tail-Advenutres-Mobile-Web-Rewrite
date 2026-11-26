package cruise

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// The port of supabase/functions/_shared/cruise/__fixtures__/provider.ts. The response
// bodies live in testdata/provider.json, transcribed from the examples in their OpenAPI spec
// (https://www.track.cruises/openapi.json) plus the two error shapes their §RateLimited
// response documents, and LIVE_CRUISES_PAGE, a real GET /cruises page captured in September
// 2026 (see map_test.go for the four things it carries that the spec's examples do not).
// Committed rather than recorded live because CI runs with no secrets and no network. When
// the spec changes, these and types.go move together.

var fixtures = loadFixtures()

func loadFixtures() map[string]js.Value {
	raw, err := os.ReadFile("testdata/provider.json")
	if err != nil {
		panic(err)
	}
	v, err := js.Parse(raw)
	if err != nil {
		panic(err)
	}
	o, _ := v.Object()
	out := map[string]js.Value{}
	for _, k := range o.Keys() {
		out[k] = o.Get(k)
	}
	// CRUISES_PAGE_ONE is built from the two sailings, as provider.ts builds it.
	out["CRUISES_PAGE_ONE"] = js.ObjectValue(
		"data", js.ArrayValue(out["HAL_SAILING"], out["PRINCESS_SAILING"]),
		"has_more", js.BoolValue(true),
		"next_cursor", js.StringValue("cursor-page-2"),
		"request_id", js.StringValue("01JSAX0000000000000000002"),
	)
	return out
}

func fixture(name string) js.Value {
	v, ok := fixtures[name]
	if !ok {
		panic("no fixture " + name)
	}
	return v
}

// stubCall is what the stub was asked for. Header names are lower-cased, as the Deno stub
// read them through a Headers object.
type stubCall struct {
	url     string
	headers map[string]string
}

type stubResponse struct {
	status  int // 0 is 200
	body    js.Value
	headers map[string]string
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// stub is stubFetch: a transport that replays a queue of responses and records what it was
// asked for.
type stub struct {
	mu     sync.Mutex
	calls  []stubCall
	queue  []stubResponse
	client *http.Client
}

func stubFetch(responses []stubResponse) *stub {
	s := &stub{queue: append([]stubResponse(nil), responses...)}
	s.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		s.mu.Lock()
		defer s.mu.Unlock()
		headers := map[string]string{}
		for k, v := range r.Header {
			headers[strings.ToLower(k)] = strings.Join(v, ", ")
		}
		s.calls = append(s.calls, stubCall{url: r.URL.String(), headers: headers})
		if len(s.queue) == 0 {
			return nil, errors.New("stubFetch: no queued response for " + r.URL.String())
		}
		next := s.queue[0]
		s.queue = s.queue[1:]
		status := next.status
		if status == 0 {
			status = 200
		}
		text, err := js.Marshal(next.body)
		if err != nil {
			return nil, err
		}
		h := http.Header{}
		h.Set("Content-Type", "application/json")
		for k, v := range next.headers {
			h.Set(k, v)
		}
		return &http.Response{StatusCode: status, Header: h, Body: io.NopCloser(strings.NewReader(string(text))), Request: r}, nil
	})}
	return s
}

func (s *stub) remaining() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.queue)
}

// quotaHeaders is the quota triple, as the relay sends it.
func quotaHeaders(remaining int, limitAndReset ...int) map[string]string {
	limit, reset := 100, 1_209_600
	if len(limitAndReset) > 0 {
		limit = limitAndReset[0]
	}
	if len(limitAndReset) > 1 {
		reset = limitAndReset[1]
	}
	return map[string]string{
		"x-ratelimit-requests-limit":     strconv.Itoa(limit),
		"x-ratelimit-requests-remaining": strconv.Itoa(remaining),
		"x-ratelimit-requests-reset":     strconv.Itoa(reset),
	}
}

func noSleep(context.Context, time.Duration) error { return nil }
