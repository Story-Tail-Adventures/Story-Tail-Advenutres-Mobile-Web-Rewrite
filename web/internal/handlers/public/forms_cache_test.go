package public_test

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// None of the three forms may be stored by a shared cache, and none is in CachedPaths, so
// #188's cache test never walks them. That test is what would otherwise notice one of these
// pages turning cacheable, which is why this one exists.
//
// /message is the one that needs saying out loud. It reads no cookie and calls nothing, so
// §4.7's general rule would let it be cached, and it was cached until a review caught it.
// The form carries startedAt, the moment it was drawn, and lead-message rejects a send that
// arrives less than MIN_FILL_MS after it — so a shared copy would freeze one stamp for an
// hour and the anti-bot check would measure against the cache rather than the visitor.
func TestTheFormsAreNeverStoredByASharedCache(t *testing.T) {
	h, rec := publicServer(t, config.Production)
	for _, path := range []string{
		"/message",
		"/message?from=landing&trip=sandals-royal-bahamian",
		"/message?sent=1",
		"/join",
		"/join?intent=quote",
		"/email/unsubscribe",
		"/email/unsubscribe?t=abcdefghijklmnopqrstuvwxyz",
	} {
		t.Run(path, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
			if w.Code != http.StatusOK {
				t.Fatalf("GET %s = %d, want 200", path, w.Code)
			}
			if got := w.Header().Get("Cache-Control"); got != web.NoStore {
				t.Errorf("Cache-Control = %q, want %q", got, web.NoStore)
			}
		})
	}
	_ = rec
}

// The form is stamped when it is drawn, not shipped carrying the template's 0. Two renders
// in a unit test land in the same millisecond, so this does not try to tell them apart; what
// it holds is that the stamp is a real time from this render. The test above is the one that
// stops the stamp being frozen by a cache.
func TestTheMessageFormCarriesAFreshStamp(t *testing.T) {
	h, _ := publicServer(t, config.Production)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/message", nil))

	raw := attrValue(w.Body.String(), `name="startedAt"`, "value")
	stamp, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		t.Fatalf("startedAt = %q, which is not a number", raw)
	}
	// lead-message rejects a send whose startedAt is missing or zero, so the template's own
	// value reaching a visitor would mean no lead could be sent at all.
	if stamp == 0 {
		t.Fatal("the form shipped the template's startedAt=0")
	}
	if drift := time.Since(time.UnixMilli(stamp)).Abs(); drift > time.Minute {
		t.Errorf("startedAt is %v away from now, so it was not set at render", drift)
	}
}

// attrValue reads one attribute off the tag carrying marker.
func attrValue(html, marker, name string) string {
	i := strings.Index(html, marker)
	if i < 0 {
		return ""
	}
	start := strings.LastIndex(html[:i], "<")
	end := strings.Index(html[i:], ">")
	if start < 0 || end < 0 {
		return ""
	}
	tag := html[start : i+end]
	_, rest, ok := strings.Cut(tag, name+`="`)
	if !ok {
		return ""
	}
	value, _, _ := strings.Cut(rest, `"`)
	return value
}
