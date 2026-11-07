package onboardingconnect

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(nil, httptest.NewRequest("GET", "/functions/v1/onboarding-connect", nil))
	if p, ok := problem.As(err); !ok || p.Status != 400 || p.Detail != "Use POST." {
		t.Fatalf("err = %v", err)
	}
}

// The sentences the phone shows, and the one 403.
func TestRefusals(t *testing.T) {
	cases := []struct {
		o      outcome
		status int
		detail string
	}{
		{outcomeExpired, 400, "That code has expired. Message Gyasi and he'll send you a fresh one."},
		{outcomeUsed, 400, "That code has already been used. If that wasn't you, message Gyasi and he'll sort it out."},
		{outcomeRevoked, 400, "That code is no longer active. Message Gyasi and he'll send you a fresh one."},
		{outcomeAlreadyConnected, 400, "You're already linked up with Gyasi, so this code isn't needed. If something's missing, message him and he'll sort it out."},
		{outcomeClaimedByAnother, 400, "That code can't be used on this account. Message Gyasi and he'll sort it out."},
		{outcomeRateLimited, 403, "That's a few tries in a row. Give it fifteen minutes, or message Gyasi and he'll link it for you."},
		{outcomeUnknown, 400, "That code didn't match anything. Check the invitation email \U00002014 codes look like STA-7HX2J9."},
	}
	for _, c := range cases {
		p, ok := problem.As(refusal(c.o))
		if !ok || p.Status != c.status || p.Detail != c.detail {
			t.Errorf("%s: %+v", c.o, p)
		}
	}
}

func TestClassify(t *testing.T) {
	now := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	s := func(v string) *string { return &v }
	live := inviteRow{ID: "i", ClientID: "target", ExpiresAt: "2026-12-06T12:00:00.123456+00:00"}
	cases := []struct {
		name  string
		found bool
		inv   inviteRow
		want  outcome
	}{
		{"no row", false, live, outcomeUnknown},
		{"revoked beats used and expired", true, inviteRow{ClientID: "target", ExpiresAt: "2020-01-01T00:00:00+00:00", RevokedAt: s("x"), AcceptedAt: s("y")}, outcomeRevoked},
		{"used beats expired", true, inviteRow{ClientID: "target", ExpiresAt: "2020-01-01T00:00:00+00:00", AcceptedAt: s("y")}, outcomeUsed},
		{"expired", true, inviteRow{ClientID: "target", ExpiresAt: "2026-11-06T11:59:59.999+00:00"}, outcomeExpired},
		{"expiring this millisecond is expired", true, inviteRow{ClientID: "target", ExpiresAt: "2026-11-06T12:00:00.000999+00:00"}, outcomeExpired},
		{"a millisecond left", true, inviteRow{ClientID: "target", ExpiresAt: "2026-11-06T12:00:00.001+00:00"}, ""},
		{"expired beats already connected", true, inviteRow{ClientID: "mine", ExpiresAt: "2020-01-01T00:00:00+00:00"}, outcomeExpired},
		{"already connected", true, inviteRow{ClientID: "mine", ExpiresAt: live.ExpiresAt}, outcomeAlreadyConnected},
		{"unreadable expiry is not expired (NaN)", true, inviteRow{ClientID: "target", ExpiresAt: "soon"}, ""},
		{"good so far", true, live, ""},
	}
	for _, c := range cases {
		if got := classify(c.found, c.inv, now, "mine"); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}

func val(t *testing.T, s string) js.Value {
	t.Helper()
	v, err := js.Parse([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestMergePatch(t *testing.T) {
	from := val(t, `{"id":"f","preferred_destinations":["Aruba"],"travel_styles":[],"dietary_restrictions":["none"],
		"dietary_notes":"","accessibility_needs":["mobility"],"accessibility_notes":null,"loyalty_programs":[{"program":"IHG","number":null,"tier":null}],
		"budget_band":"mid","favorite_past_trips":"Kyoto"}`)
	to := val(t, `{"id":"t","preferred_destinations":["Rome"],"travel_styles":["cruise"],"dietary_restrictions":[],
		"dietary_notes":null,"accessibility_needs":["quiet_room"],"accessibility_notes":"ramp","loyalty_programs":[],
		"budget_band":null,"favorite_past_trips":null}`)
	p := mergePatch(from, to)
	b, _ := js.Marshal(p)
	want := `{"dietary_restrictions":["none"],"dietary_notes":"","loyalty_programs":[{"program":"IHG","number":null,"tier":null}],"budget_band":"mid","favorite_past_trips":"Kyoto"}`
	if string(b) != want {
		t.Errorf("\n got %s\nwant %s", b, want)
	}
	if got := strings.Join(sortedKeys(p), ","); got != "budget_band,dietary_notes,dietary_restrictions,favorite_past_trips,loyalty_programs" {
		t.Errorf("fields %s", got)
	}
	if len(mergePatch(to, to)) != 0 {
		t.Error("a row merged into itself changes nothing")
	}
}

func TestRescuePatch(t *testing.T) {
	from := val(t, `{"phone":"+13055550184","date_of_birth":null,"emergency_contact":{"name":"A","phone":"+1","relationship":null},"mailing_address_id":"a1","preferred_name":"Mo"}`)
	to := val(t, `{"phone":null,"date_of_birth":"1990-01-01","emergency_contact":null,"mailing_address_id":"a2","preferred_name":null}`)
	b, _ := js.Marshal(rescuePatch(from, to))
	if string(b) != `{"phone":"+13055550184","emergency_contact":{"name":"A","phone":"+1","relationship":null},"preferred_name":"Mo"}` {
		t.Errorf("%s", b)
	}
	if got := strings.Join(sortedKeys(rescuePatch(from, val(t, `{"phone":null,"date_of_birth":null,"emergency_contact":null,"mailing_address_id":null,"preferred_name":null}`))), ","); got != "emergency_contact,mailing_address_id,phone,preferred_name" {
		t.Errorf("fields %s", got)
	}
}
