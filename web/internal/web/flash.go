package web

import (
	"fmt"
	"net/http"
	"regexp"
	"sync"
)

// The one-time flash: a short sentence shown once on the page a successful post redirects to
// ("Saved."), the Go stand-in for a Snackbar after a server action (§4.9).
//
// The cookie carries a KEY, never the sentence. Keys are registered in Go with their text, so
// nothing a visitor or a sibling subdomain writes into the cookie can put chosen words on a
// page; an unknown key shows nothing. Each area registers its own flashes in its own package
// (a package-level var), so no two sessions edit one list.
//
// The flash is for gated pages only: a public page is cached and must never read it.

// FlashCookie holds the pending flash key on a local http:// server. Everywhere else it is
// SecureFlashCookie: the __Host- prefix makes the browser refuse one set by a sibling
// subdomain (Domain=.story-tail.com), which the host-only clear could never remove, so a
// planted "Saved." would otherwise show on every gated page until it expired.
const (
	FlashCookie       = "sta-flash"
	SecureFlashCookie = "__Host-sta-flash"
)

func flashName(secure bool) string {
	if secure {
		return SecureFlashCookie
	}
	return FlashCookie
}

// Flash is one registered message.
type Flash struct {
	key  string
	text string
}

// Text is the sentence the flash shows.
func (f Flash) Text() string { return f.text }

var (
	flashMu  sync.RWMutex
	flashes  = map[string]Flash{}
	flashKey = regexp.MustCompile(`^[a-z][a-z0-9.-]{0,63}$`)
)

// NewFlash registers a message under key and returns it. Call it from a package-level var,
// so a duplicate or malformed key fails at startup:
//
//	var flashSaved = web.NewFlash("agent.settings.saved", "Your profile is saved.")
func NewFlash(key, text string) Flash {
	if !flashKey.MatchString(key) {
		panic(fmt.Sprintf("web: flash key %q must match %s", key, flashKey))
	}
	flashMu.Lock()
	defer flashMu.Unlock()
	if _, dup := flashes[key]; dup {
		panic(fmt.Sprintf("web: flash key %q is registered twice", key))
	}
	f := Flash{key: key, text: text}
	flashes[key] = f
	return f
}

// SetFlash queues f for the next page this visitor loads. Call it just before SeeOther.
// secure matches the session cookie's (false only on a local http:// server).
func SetFlash(w http.ResponseWriter, f Flash, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: flashName(secure), Value: f.key, Path: "/", MaxAge: 60,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

// TakeFlash returns the pending message, if any, and clears the cookie so it shows once.
func TakeFlash(w http.ResponseWriter, r *http.Request, secure bool) string {
	c, err := r.Cookie(flashName(secure))
	if err != nil {
		return ""
	}
	http.SetCookie(w, &http.Cookie{
		Name: flashName(secure), Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
	flashMu.RLock()
	defer flashMu.RUnlock()
	return flashes[c.Value].text
}
