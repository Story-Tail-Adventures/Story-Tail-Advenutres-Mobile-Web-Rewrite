package people

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"unicode/utf8"
)

// The bulk-tag receipt ("Added "vip" to 3 clients."), carried across the redirect after a
// successful bulk tag. It names the advisor's own tag and two counts, so it cannot be one of
// web.Flash's fixed sentences, and it must not ride in the URL, where a crafted link could put
// chosen words on the advisor's roster.
//
// So, like the flash, it is a short-lived HttpOnly cookie this server sets, __Host- prefixed
// outside a local http:// server (a sibling subdomain cannot plant one). It carries DATA, never
// a sentence: the tag, the counts and the direction. The sentence is built here, by
// bulkTagResult, and the tag goes into the page as text.

const (
	receiptCookie       = "sta-people-receipt"
	secureReceiptCookie = "__Host-sta-people-receipt"
	maxTagLen           = 40 // CLIENT_LIMITS.tag
)

type bulkReceipt struct {
	Tag       string `json:"t"`
	Changed   int64  `json:"c"`
	Requested int64  `json:"r"`
	Added     bool   `json:"a"`
}

func receiptName(secure bool) string {
	if secure {
		return secureReceiptCookie
	}
	return receiptCookie
}

func setReceipt(w http.ResponseWriter, rc bulkReceipt, secure bool) {
	b, err := json.Marshal(rc)
	if err != nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: receiptName(secure), Value: base64.RawURLEncoding.EncodeToString(b), Path: "/agent/clients",
		MaxAge: 60, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

// takeReceipt returns the pending receipt, if a valid one is there, and clears it so it shows
// once.
func takeReceipt(w http.ResponseWriter, r *http.Request, secure bool) (bulkReceipt, bool) {
	c, err := r.Cookie(receiptName(secure))
	if err != nil {
		return bulkReceipt{}, false
	}
	http.SetCookie(w, &http.Cookie{
		Name: receiptName(secure), Value: "", Path: "/agent/clients",
		MaxAge: -1, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err != nil {
		return bulkReceipt{}, false
	}
	var rc bulkReceipt
	if json.Unmarshal(raw, &rc) != nil || rc.Tag == "" || utf8.RuneCountInString(rc.Tag) > maxTagLen ||
		rc.Changed < 0 || rc.Requested < 0 || rc.Changed > rc.Requested {
		return bulkReceipt{}, false
	}
	return rc, true
}
