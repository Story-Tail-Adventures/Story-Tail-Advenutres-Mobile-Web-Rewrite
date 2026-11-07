package people

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"unicode/utf8"
)

// The receipt: a success that needs more than a fixed sentence, carried across the redirect.
// A bulk tag ("Added "vip" to 3 clients.") and an account-admin action ("Sent. It's on its
// way to …"). It names the advisor's own tag and two counts, so it cannot be one of
// web.Flash's fixed sentences, and it must not ride in the URL, where a crafted link could put
// chosen words on the advisor's roster.
//
// So, like the flash, it is a short-lived HttpOnly cookie this server sets, __Host- prefixed
// outside a local http:// server (a sibling subdomain cannot plant one). __Host- requires
// Path=/: a browser drops the cookie whole on any other path, so the receipt would never show.
// Each page takes only its own kind, and the cookie lives a minute. It carries DATA, never
// a sentence: the tag, the counts and the direction. The sentence is built here, by
// bulkTagResult, and the tag goes into the page as text.

const (
	receiptCookie       = "sta-people-receipt"
	secureReceiptCookie = "__Host-sta-people-receipt"
	maxTagLen           = 40 // CLIENT_LIMITS.tag
)

// receipt is one success, by kind: "bulk" (a bulk tag: the tag and its counts), "account"
// (an account-admin outcome code: sent, noop or changed) or "lead" (an invite's note).
type receipt struct {
	Kind      string `json:"k"`
	Tag       string `json:"t,omitempty"`
	Changed   int64  `json:"c,omitempty"`
	Requested int64  `json:"r,omitempty"`
	Added     bool   `json:"a,omitempty"`
	Outcome   string `json:"o,omitempty"`
	ID        string `json:"i,omitempty"` // the record it is for, so it shows on no other one
}

func (rc receipt) valid() bool {
	switch rc.Kind {
	case "bulk":
		return rc.Tag != "" && utf8.RuneCountInString(rc.Tag) <= maxTagLen &&
			rc.Changed >= 0 && rc.Requested >= 0 && rc.Changed <= rc.Requested
	case "account":
		return rc.Outcome == "sent" || rc.Outcome == "noop" || rc.Outcome == "changed"
	case "lead":
		// 3.8.3's two invite notes: the email was already a client's, or the invite did not send.
		return rc.Outcome == "existing" || rc.Outcome == "not-sent"
	}
	return false
}

func receiptName(secure bool) string {
	if secure {
		return secureReceiptCookie
	}
	return receiptCookie
}

func setReceipt(w http.ResponseWriter, rc receipt, secure bool) {
	b, err := json.Marshal(rc)
	if err != nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: receiptName(secure), Value: base64.RawURLEncoding.EncodeToString(b), Path: "/",
		MaxAge: 60, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

// takeReceipt returns the pending receipt, if a valid one is there, and clears it so it shows
// once.
func takeReceipt(w http.ResponseWriter, r *http.Request, secure bool) (receipt, bool) {
	c, err := r.Cookie(receiptName(secure))
	if err != nil {
		return receipt{}, false
	}
	http.SetCookie(w, &http.Cookie{
		Name: receiptName(secure), Value: "", Path: "/",
		MaxAge: -1, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err != nil {
		return receipt{}, false
	}
	var rc receipt
	if json.Unmarshal(raw, &rc) != nil || !rc.valid() {
		return receipt{}, false
	}
	return rc, true
}
