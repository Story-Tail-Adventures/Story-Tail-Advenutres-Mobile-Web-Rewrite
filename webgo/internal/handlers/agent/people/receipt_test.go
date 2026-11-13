package people

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// A __Host- cookie must be Secure, carry no Domain and have Path=/, or the browser drops it
// whole; on any other path the receipt never reached the page in production.
func TestReceiptCookieIsAValidHostCookie(t *testing.T) {
	for _, secure := range []bool{true, false} {
		rec := httptest.NewRecorder()
		setReceipt(rec, receipt{Kind: "account", Outcome: "sent"}, secure)
		cs := rec.Result().Cookies()
		if len(cs) != 1 {
			t.Fatalf("secure=%v: %d cookies", secure, len(cs))
		}
		c := cs[0]
		if c.Path != "/" || c.Domain != "" || !c.HttpOnly || c.Secure != secure {
			t.Errorf("secure=%v: %+v", secure, c)
		}
		if secure && c.Name != "__Host-sta-people-receipt" {
			t.Errorf("name = %q", c.Name)
		}

		// And it reads back, once.
		req := httptest.NewRequest(http.MethodGet, "/agent/clients/x?tab=account", nil)
		req.AddCookie(c)
		w := httptest.NewRecorder()
		if rc, ok := takeReceipt(w, req, secure); !ok || rc.Outcome != "sent" {
			t.Errorf("secure=%v: take = %+v %v", secure, rc, ok)
		}
		if cl := w.Result().Cookies(); len(cl) != 1 || cl[0].MaxAge >= 0 || cl[0].Path != "/" {
			t.Errorf("secure=%v: clear = %+v", secure, cl)
		}
	}
}
