package onboardingstep

import (
	"net/http/httptest"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// The method is checked before anything touches the caller or the database.
func TestMethodIsCheckedFirst(t *testing.T) {
	for _, m := range []string{"GET", "PATCH", "DELETE", "PUT"} {
		_, err := Func(nil, httptest.NewRequest(m, "/functions/v1/onboarding-step", nil))
		p, ok := problem.As(err)
		if !ok || p.Status != 400 || p.Detail != "Use POST." {
			t.Errorf("%s: %v", m, err)
		}
	}
}

func TestParse(t *testing.T) {
	const refused = "Send either a known step or complete: true."
	cases := []struct {
		body     string
		complete bool
		step     string
		err      string
	}{
		{`{"complete":true}`, true, "", ""},
		{`{"complete":true,"step":"bogus"}`, true, "", ""},
		{`{"step":"profile"}`, false, "profile", ""},
		{`{"step":"preferences"}`, false, "preferences", ""},
		{`{"step":"companions"}`, false, "companions", ""},
		{`{"step":"connect"}`, false, "connect", ""},
		{`{"step":"complete"}`, false, "complete", ""},
		{`{"complete":false,"step":"connect"}`, false, "connect", ""},
		// complete must be the boolean true, not something truthy.
		{`{"complete":"true"}`, false, "", refused},
		{`{"complete":1}`, false, "", refused},
		{`{}`, false, "", refused},
		{`{"step":"Profile"}`, false, "", refused},
		{`{"step":" profile"}`, false, "", refused},
		{`{"step":5}`, false, "", refused},
		{`{"step":null}`, false, "", refused},
		{`{"step":["profile"]}`, false, "", refused},
	}
	for _, c := range cases {
		v, err := js.ParseObject([]byte(c.body))
		if err != nil {
			t.Fatal(err)
		}
		got, err := parse(v)
		if c.err != "" {
			p, ok := problem.As(err)
			if !ok || p.Status != 400 || p.Detail != c.err {
				t.Errorf("%s: err = %v", c.body, err)
			}
			continue
		}
		if err != nil || got.complete != c.complete || got.step != c.step {
			t.Errorf("%s: %+v %v", c.body, got, err)
		}
	}
}
