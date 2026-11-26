package people

import (
	"encoding/json"
	"testing"
	"time"
)

// Ported from web/lib/agent/accountAdminView.test.ts.

var accNow = time.Date(2026, 10, 16, 19, 0, 0, 0, time.UTC) // 2:00 PM in Chicago

const accTZ = "America/Chicago"

func TestDeviceLabel(t *testing.T) {
	for ua, want := range map[string]string{
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1": "iPhone · Safari",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile/15E148 Safari/604.1":                       "iPhone · Chrome",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36":                       "Mac · Chrome",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0":                   "Windows · Edge",
		"Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36":                       "Android · Chrome",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0":                                 "Mac · Firefox",
		"Ktor client": "Story-Tail app",
		"":            "Unknown device",
		"   ":         "Unknown device",
	} {
		if got := deviceLabel(ua); got != want {
			t.Errorf("deviceLabel(%q) = %q, want %q", ua, got, want)
		}
	}
}

func TestWhenLabel(t *testing.T) {
	for _, c := range []struct{ iso, zone, want string }{
		{"2026-10-16T15:30:00Z", accTZ, "Today · 10:30 AM"},
		{"2026-10-16T03:30:00Z", accTZ, "Yesterday · 10:30 PM"},
		{"2026-05-06T04:42:00Z", accTZ, "May 5 · 11:42 PM"},
		{"2025-12-31T18:00:00Z", accTZ, "Dec 31, 2025 · 12:00 PM"},
		{"2026-10-16T15:30:00Z", "Not/AZone", "Today · 11:30 AM"}, // New York, as Intl fell back
	} {
		if got := whenLabel(c.iso, c.zone, accNow); got != c.want {
			t.Errorf("whenLabel(%q, %q) = %q, want %q", c.iso, c.zone, got, c.want)
		}
	}
}

func accountFixture(t *testing.T, over map[string]any) accountRow {
	t.Helper()
	ua := "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1"
	row := map[string]any{
		"needsMfa": false, "clientId": "c1", "firstName": "Jordan", "clientEmail": "jordan@example.com",
		"clientArchived": false, "duplicateEmail": false, "duplicateEmailClientId": nil, "signInEmailsLastHour": 1,
		"hasSignIn": true, "agentTimeZone": accTZ, "accountId": "a1", "signInEmail": "jordan@example.com",
		"emailVerifiedAt": "2026-01-01T00:00:00Z", "invitedAt": nil, "hasPassword": true, "providers": []string{"email"},
		"mfaEnrolled": false, "lockedAt": nil, "lockedReason": nil, "lastLoginAt": "2026-10-16T17:00:00Z",
		"sessions": []any{map[string]any{"id": "s1", "startedAt": "2026-10-16T17:00:00Z", "lastActiveAt": "2026-10-16T18:00:00Z", "userAgent": ua, "ip": "99.244.18.4"}},
		"activity": []any{map[string]any{"id": "e1", "at": "2026-10-16T17:00:00Z", "userAgent": ua, "ip": "99.244.18.4", "flagged": false}},
	}
	for k, v := range over {
		row[k] = v
	}
	var r accountRow
	if err := json.Unmarshal([]byte(mustJSON(row)), &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestToAccountView(t *testing.T) {
	if v := toAccountView(accountFixture(t, map[string]any{"needsMfa": true, "agentHasFactor": false}), accNow); v.Kind != "needs-mfa" || v.AgentHasFactor {
		t.Errorf("gate = %+v", v)
	}
	if v := toAccountView(accountFixture(t, map[string]any{"hasSignIn": false, "signInEmailsLastHour": 0}), accNow); v.Kind != "no-sign-in" || v.SendsLeft != 3 || v.Email != "jordan@example.com" {
		t.Errorf("no sign-in = %+v", v)
	}
	v := toAccountView(accountFixture(t, nil), accNow)
	if v.Kind != "account" || v.LastSignIn != "Today · 12:00 PM · iPhone · Safari" || v.SendsLeft != 2 ||
		v.Sessions[0] != (accountSession{Device: "iPhone · Safari", IP: "99.244.18.4", LastActive: "Today · 1:00 PM"}) ||
		v.SocialOnly != "" || v.InvitePending || v.Locked {
		t.Errorf("account = %+v", v)
	}
	if v := toAccountView(accountFixture(t, map[string]any{"hasPassword": false, "providers": []string{"google"}}), accNow); v.SocialOnly != "Google" {
		t.Errorf("google only = %q", v.SocialOnly)
	}
	if v := toAccountView(accountFixture(t, map[string]any{"emailVerifiedAt": nil, "invitedAt": "2026-10-16T18:00:00Z", "hasPassword": false}), accNow); !v.InvitePending {
		t.Error("an unconfirmed invited sign-in is a pending invite")
	}
	if v := toAccountView(accountFixture(t, map[string]any{"lockedAt": "2026-10-16T18:30:00Z", "lockedReason": "odd device"}), accNow); !v.Locked || v.LockedReason != "odd device" || v.LockedSince != "Today · 1:30 PM" {
		t.Errorf("locked = %+v", v)
	}
	if v := toAccountView(accountFixture(t, map[string]any{"bannedUntil": "2126-10-16T00:00:00Z"}), accNow); !v.Locked {
		t.Error("a ban with no lock row still reads as locked")
	}
	if v := toAccountView(accountFixture(t, map[string]any{"bannedUntil": "2020-10-16T00:00:00Z"}), accNow); v.Locked {
		t.Error("an expired ban is not a lock")
	}
	v = toAccountView(accountFixture(t, map[string]any{"duplicateSignInEmail": true, "clientEmail": "new@example.com"}), accNow)
	if !v.DuplicateAny || !v.AddressMismatch {
		t.Errorf("duplicate/mismatch = %+v", v)
	}
	if v := toAccountView(accountFixture(t, map[string]any{"signInEmailsLastHour": 7}), accNow); v.SendsLeft != 0 {
		t.Errorf("sends left = %d", v.SendsLeft)
	}
	var missing accountRow
	if json.Unmarshal([]byte("null"), &missing) != nil || !missing.missing() {
		t.Error("a null answer is no such client")
	}
}
