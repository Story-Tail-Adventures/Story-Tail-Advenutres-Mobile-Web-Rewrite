package hotels

// The SerpApi call: the port of web/lib/hotels/client.ts and provider-fetch.ts.
//
// SERPAPI TAKES ITS CREDENTIAL AS A QUERY PARAMETER, so the request URL holds the key and
// every place that URL could travel is a leak path. PR #48 found four in the Next version.
// The Go equivalents, and what closes each:
//
//   - Go's *url.Error, which http.Client.Do returns for every transport failure, quotes the
//     full request URL in its message. networkError keeps only the cause it wraps, redacts
//     even that, and Search never logs a network error's detail at all.
//   - A redirect would carry the key to whatever host the Location names. New sets
//     CheckRedirect to stop at the 3xx, and fetch treats a 3xx as a permanent failure.
//   - A provider error can echo the request. Every detail is redacted when the error is
//     built (redact), not at one of the places that reads it.
//   - Next's patched fetch wrote the URL into a tracing span name and a cache key on disk.
//     net/http has no such layer, and nothing here adds one: the URL is built in buildURL
//     and read by http.NewRequestWithContext, and nothing else holds it.

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBaseURL = "https://serpapi.com"
	searchPath     = "/search"
	// attemptTimeout bounds each attempt, body included: client.ts's DEFAULT_TIMEOUT_MS.
	attemptTimeout = 12 * time.Second
	// maxRetries is how many times a network-class failure or a 5xx is tried again.
	maxRetries = 2
	// maxBodyBytes is far past any page one of 20 hotels. A body this big is refused once
	// rather than read, or retried and billed three times.
	maxBodyBytes = 8 << 20
	// codeNetwork marks a request that got no response. Its detail is never logged.
	codeNetwork = "network_error"
)

// providerError is a failed SerpApi call (SerpApiError in client.ts).
type providerError struct {
	// status is the HTTP status, or 0 when no response arrived.
	status int
	code   string
	// detail is redacted when the error is built. It is logged for provider failures and
	// never for network ones.
	detail    string
	permanent bool
}

// Error is the code alone, never the detail, so wrapping or printing the error is safe.
func (e *providerError) Error() string { return "hotels: " + e.code }

// newProviderError redacts detail here, at construction, so no reader has to remember to.
func newProviderError(status int, code, detail string, permanent bool, apiKey string) *providerError {
	return &providerError{status: status, code: code, detail: redact(detail, apiKey), permanent: permanent}
}

var (
	// urlQuery is any http(s) URL's query string. A provider message that quotes our request
	// would otherwise put the visitor's destination and dates in the log with the key.
	urlQuery = regexp.MustCompile(`(?i)(https?://[^\s"'<>?#]*)\?[^\s"'<>#)]*`)
	// apiKeyParam is an api_key parameter outside a URL, with any value: a rotated key echoed
	// back is not the key we hold, so matching by value alone would miss it.
	apiKeyParam = regexp.MustCompile(`(?i)([?&]api_key=)[^&\s"'<>]+`)
)

// redact removes the key we hold (plain and URL-encoded), any other api_key value, and the
// query string of any URL in text.
func redact(text, apiKey string) string {
	if apiKey != "" {
		text = strings.ReplaceAll(text, apiKey, "[redacted]")
		text = strings.ReplaceAll(text, url.QueryEscape(apiKey), "[redacted]")
	}
	text = urlQuery.ReplaceAllString(text, "${1}?[redacted]")
	return apiKeyParam.ReplaceAllString(text, "${1}[redacted]")
}

// param is one outbound query parameter. A slice of them keeps the TypeScript's order.
type param struct{ key, value string }

// buildURL is the only place the key joins the request, and it goes last. params is not
// changed, so nothing a caller holds ever contains the key.
func buildURL(searchURL string, params []param, apiKey string) string {
	var b strings.Builder
	b.WriteString(searchURL)
	sep := byte('?')
	for _, p := range params {
		b.WriteByte(sep)
		sep = '&'
		b.WriteString(url.QueryEscape(p.key))
		b.WriteByte('=')
		b.WriteString(url.QueryEscape(p.value))
	}
	b.WriteByte(sep)
	b.WriteString("api_key=")
	b.WriteString(url.QueryEscape(apiKey))
	return b.String()
}

// fetch makes the search call, retrying a network failure or a 5xx at most maxRetries
// times. It stops early when ctx ends: a visitor who left does not need the answer.
func (s *Searcher) fetch(ctx context.Context, params []param) (*providerResponse, *providerError) {
	target := buildURL(s.searchURL, params, s.apiKey)
	for attempt := 0; ; attempt++ {
		body, err := s.attempt(ctx, target)
		if err == nil {
			return body, nil
		}
		if err.permanent || attempt >= maxRetries || ctx.Err() != nil {
			return nil, err
		}
		if s.sleep(ctx, backoff(attempt)) != nil {
			return nil, err
		}
	}
}

// attempt is one request with its own deadline.
func (s *Searcher) attempt(ctx context.Context, target string) (*providerResponse, *providerError) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, s.networkError(err)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, s.networkError(err)
	}
	defer resp.Body.Close()

	raw, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes+1))
	if len(raw) > maxBodyBytes {
		return nil, newProviderError(resp.StatusCode, "provider_too_large", "response over 8 MiB", true, s.apiKey)
	}
	var body *providerResponse
	if readErr == nil {
		body = decodeProvider(raw)
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 || body == nil || body.failed() {
		return nil, toError(resp.StatusCode, body, s.apiKey)
	}
	return body, nil
}

// networkError is a request that got no response. Go's *url.Error quotes the whole request
// URL, api_key included, so only the cause it wraps is kept, and that is redacted too. Its
// detail is still never logged: the runtime's text can carry the visitor's destination and
// dates, and redaction is aimed at the key.
func (s *Searcher) networkError(err error) *providerError {
	var urlErr *url.Error
	if errors.As(err, &urlErr) && urlErr.Err != nil {
		err = urlErr.Err
	}
	return newProviderError(0, codeNetwork, err.Error(), false, s.apiKey)
}

// toError decides retryability in exactly one place, as client.ts did. 401 and 403 mean the
// key is wrong or the plan is spent, 400 and 404 that we built a bad query, and 429 the
// hourly limit, which will not clear inside one request: retrying any of them spends
// searches to learn nothing. A 3xx is the same answer every time, and following it is the
// leak. Everything else (a 5xx, a 200 with an error, an unreadable body) is retried.
func toError(status int, body *providerResponse, apiKey string) *providerError {
	detail := "HTTP " + strconv.Itoa(status)
	if body != nil {
		if text, ok := body.errorText(); ok {
			detail = text
		}
	}
	permanent := status == 400 || status == 401 || status == 403 || status == 404 ||
		status == 429 || (status >= 300 && status < 400)
	code := "provider_unavailable"
	if permanent {
		code = "provider_" + strconv.Itoa(status)
	}
	return newProviderError(status, code, detail, permanent, apiKey)
}

// backoff is client.ts's min(500 * 2^attempt, 8000) milliseconds.
func backoff(attempt int) time.Duration {
	return min(500*time.Millisecond<<attempt, 8*time.Second)
}

// sleepCtx waits for d or until ctx ends.
func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
