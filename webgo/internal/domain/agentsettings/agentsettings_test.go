package agentsettings

import (
	"encoding/base64"
	"fmt"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/agentSettings_test.ts, one Go test per Deno.test.

func str(s string) js.Value { return js.StringValue(s) }

func detailOf(tb testing.TB, err error) string {
	tb.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != 400 {
		tb.Fatalf("want a 400 HttpError, got %v", err)
	}
	return p.Detail
}

func mustBadRequest(tb testing.TB, err error, what string) {
	tb.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != 400 {
		tb.Errorf("%s: want a 400 HttpError, got %v", what, err)
	}
}

func show(p *string) string {
	if p == nil {
		return "<null>"
	}
	return *p
}

// The SAME vectors as web/lib/agent/settingsRules.test.ts. Change one, change both.
var linkVectors = []struct {
	network SocialNetwork
	input   string
	want    *string
}{
	{Instagram, "@story.tail", ptr("https://instagram.com/story.tail")},
	{Instagram, "story_tail", ptr("https://instagram.com/story_tail")},
	{Instagram, "instagram.com/story.tail", ptr("https://instagram.com/story.tail")},
	{Instagram, "https://www.instagram.com/story.tail/", ptr("https://www.instagram.com/story.tail/")},
	{Facebook, "@storytail", ptr("https://facebook.com/storytail")},
	{LinkedIn, "linkedin.com/in/gyasistory", ptr("https://linkedin.com/in/gyasistory")},
	{Website, "story-tail.com", ptr("https://story-tail.com")},
	{Website, "HTTPS://story-tail.com/about", ptr("https://story-tail.com/about")},
	{Website, "  ", nil},
}

var badLinks = []struct {
	network SocialNetwork
	input   string
}{
	{Website, "http://story-tail.com"},
	{Website, "javascript:alert(1)"},
	{Website, "https://story tail.com"},
	{Website, "https://user:pw@story-tail.com"},
	{Website, "localhost"},
	{Instagram, "https://evil.example.com/story"},
	{LinkedIn, "gyasistory"},
	{Facebook, "https://facebook.com.evil.example/x"},
	{Instagram, "instagram.com"},
	{Instagram, "https://www.instagram.com/"},
}

func ptr(s string) *string { return &s }

// Deno.test("normalizeSocialLink: handles and bare domains become full https links")
func TestNormalizeSocialLinkHandlesAndBareDomainsBecomeFullHTTPSLinks(t *testing.T) {
	for _, v := range linkVectors {
		got, err := NormalizeSocialLink(v.network, str(v.input))
		if err != nil {
			t.Errorf("%s %s: %v", v.network, v.input, err)
			continue
		}
		if show(got) != show(v.want) {
			t.Errorf("%s %s: got %s want %s", v.network, v.input, show(got), show(v.want))
		}
	}
}

// Deno.test("normalizeSocialLink: refuses http, other schemes, and the wrong site for a network")
func TestNormalizeSocialLinkRefusesHTTPOtherSchemesAndTheWrongSite(t *testing.T) {
	for _, v := range badLinks {
		_, err := NormalizeSocialLink(v.network, str(v.input))
		mustBadRequest(t, err, string(v.network)+" "+v.input)
	}
}

// Deno.test("readSocialLinks: drops empties, refuses unknown networks")
func TestReadSocialLinksDropsEmptiesRefusesUnknownNetworks(t *testing.T) {
	got, err := ReadSocialLinks(js.ObjectValue("instagram", str("@a.b"), "website", str("")))
	if err != nil {
		t.Fatal(err)
	}
	if want := (SocialLinks{{Instagram, "https://instagram.com/a.b"}}); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("got %v want %v", got, want)
	}
	got, err = ReadSocialLinks(js.UndefinedValue())
	if err != nil || got == nil || len(got) != 0 {
		t.Errorf("undefined: got %v, %v", got, err)
	}
	_, err = ReadSocialLinks(js.ObjectValue("tiktok", str("x")))
	mustBadRequest(t, err, "tiktok")
}

// Deno.test("readDisplayName and readPhone")
func TestReadDisplayNameAndReadPhone(t *testing.T) {
	name, err := ReadDisplayName(str("  Gyasi Story "))
	if err != nil || name != "Gyasi Story" {
		t.Errorf("name: %q, %v", name, err)
	}
	_, err = ReadDisplayName(str(" "))
	mustBadRequest(t, err, "blank name")
	phone, err := ReadPhone(str("+1 (305) 555-0184"))
	if err != nil || show(phone) != "+1 (305) 555-0184" {
		t.Errorf("phone: %s, %v", show(phone), err)
	}
	phone, err = ReadPhone(str(""))
	if err != nil || phone != nil {
		t.Errorf("empty phone: %s, %v", show(phone), err)
	}
	_, err = ReadPhone(str("call me"))
	mustBadRequest(t, err, "call me")
	_, err = ReadPhone(str("12345"))
	mustBadRequest(t, err, "12345")
}

func hours(start, end string) js.Value {
	return js.ObjectValue("start", str(start), "end", str(end))
}

// week is DEFAULT_WEEK with the given keys replaced or added, as `{ ...DEFAULT_WEEK, k: v }`
// writes it. A js.UndefinedValue() keeps the key with an undefined value, as the spread does.
func week(kv ...any) js.Value {
	base := []any{
		"mon", hours("07:00", "21:00"),
		"tue", hours("07:00", "21:00"),
		"wed", hours("07:00", "21:00"),
		"thu", hours("07:00", "21:00"),
		"fri", hours("07:00", "21:00"),
		"sat", hours("07:00", "21:00"),
		"sun", js.NullValue(),
	}
	return js.ObjectValue(append(base, kv...)...)
}

// Deno.test("readWeeklySchedule: the same rules as agent_weekly_schedule_valid()")
func TestReadWeeklyScheduleTheSameRulesAsTheDatabase(t *testing.T) {
	got, err := ReadWeeklySchedule(week())
	if err != nil {
		t.Fatal(err)
	}
	day := &DayHours{Start: "07:00", End: "21:00"}
	want := WeeklySchedule{Mon: day, Tue: day, Wed: day, Thu: day, Fri: day, Sat: day, Sun: nil}
	gotJSON, _ := js.Marshal(got)
	wantJSON, _ := js.Marshal(want)
	if string(gotJSON) != string(wantJSON) {
		t.Errorf("got %s want %s", gotJSON, wantJSON)
	}
	got, err = ReadWeeklySchedule(week("mon", hours("00:00", "24:00")))
	if err != nil || got.Mon == nil || *got.Mon != (DayHours{Start: "00:00", End: "24:00"}) {
		t.Errorf("all day: %+v, %v", got.Mon, err)
	}
	for _, bad := range []js.Value{
		js.ObjectValue(),
		week("sun", js.UndefinedValue()),
		week("mon", js.ObjectValue()),
		week("mon", hours("09:15", "17:00")),
		week("mon", hours("17:00", "09:00")),
		week("mon", hours("24:00", "24:00")),
		week("mon", js.ObjectValue("start", str("09:00"), "end", str("17:00"), "x", js.NumberValue(1))),
		week("extra", js.NullValue()),
	} {
		_, err := ReadWeeklySchedule(bad)
		text, _ := js.Marshal(bad)
		mustBadRequest(t, err, string(text))
	}
}

// Deno.test("readTimeZone and readResponseTime: lists only")
func TestReadTimeZoneAndReadResponseTimeListsOnly(t *testing.T) {
	zone, err := ReadTimeZone(str("America/Chicago"))
	if err != nil || zone != "America/Chicago" {
		t.Errorf("zone: %q, %v", zone, err)
	}
	_, err = ReadTimeZone(str("Europe/London"))
	mustBadRequest(t, err, "Europe/London")
	hrs, err := ReadResponseTime(js.NumberValue(24))
	if err != nil || hrs != 24 {
		t.Errorf("24: %d, %v", hrs, err)
	}
	_, err = ReadResponseTime(js.NumberValue(3))
	mustBadRequest(t, err, "3")
	_, err = ReadResponseTime(str("24"))
	mustBadRequest(t, err, `"24"`)
}

// Deno.test("readTimeOffDates: real dates, in order, at most a year")
func TestReadTimeOffDatesRealDatesInOrderAtMostAYear(t *testing.T) {
	got, err := ReadTimeOffDates(str("2026-11-26"), str("2026-11-29"))
	if err != nil || got != (TimeOffDates{StartsOn: "2026-11-26", EndsOn: "2026-11-29"}) {
		t.Errorf("got %+v, %v", got, err)
	}
	got, err = ReadTimeOffDates(str("2026-11-26"), str("2026-11-26"))
	if err != nil || got.EndsOn != "2026-11-26" {
		t.Errorf("one day: %+v, %v", got, err)
	}
	_, err = ReadTimeOffDates(str("2026-02-30"), str("2026-03-01"))
	mustBadRequest(t, err, "Feb 30")
	_, err = ReadTimeOffDates(str("2026-11-29"), str("2026-11-26"))
	mustBadRequest(t, err, "backwards")
	_, err = ReadTimeOffDates(str("2026-01-01"), str("2027-06-01"))
	if d := detailOf(t, err); d != "Time away can be up to a year. Check the dates." {
		t.Errorf("detail %q", d)
	}
}

// Deno.test("sniffImage / readAvatar: by the first bytes, never the claimed type")
func TestSniffImageReadAvatarByTheFirstBytes(t *testing.T) {
	jpeg := []byte{0xff, 0xd8, 0xff, 0xe0, 0, 0}
	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0}
	webp := []byte("RIFF\x00\x00\x00\x00WEBPVP8 ")
	for _, tc := range []struct {
		in  []byte
		ext string
	}{{jpeg, "jpg"}, {png, "png"}, {webp, "webp"}} {
		img := SniffImage(tc.in)
		if img == nil || img.Ext != tc.ext {
			t.Errorf("%s: got %+v", tc.ext, img)
		}
	}
	if img := SniffImage([]byte("<svg onload=alert(1)>")); img != nil {
		t.Errorf("svg: got %+v", img)
	}
	b64 := func(b []byte) string { return base64.StdEncoding.EncodeToString(b) }
	img, err := ReadAvatar(str(b64(png)))
	if err != nil || img.ContentType != "image/png" {
		t.Errorf("png: %+v, %v", img, err)
	}
	_, err = ReadAvatar(str(b64([]byte("GIF89a..."))))
	mustBadRequest(t, err, "gif")
	_, err = ReadAvatar(str("not base64!!"))
	mustBadRequest(t, err, "not base64")
	_, err = ReadAvatar(str(strings.Repeat("A", 2_000_000)))
	mustBadRequest(t, err, "too large")
}

// Deno.test("avatarKeyFromUrl: only a stored path in our bucket and this advisor's folder")
func TestAvatarKeyFromURLOnlyAStoredPathInOurBucket(t *testing.T) {
	me := "0195a2c0-1a00-7000-8000-000000000001"
	file := "0195a2c0-1a00-7000-8000-0000000000ff.jpg"
	key, ok := AvatarKeyFromURL("/storage/v1/object/public/agent-avatars/"+me+"/"+file, me)
	if !ok || key != me+"/"+file {
		t.Errorf("mine: %q %v", key, ok)
	}
	for _, url := range []string{
		"/storage/v1/object/public/agent-avatars/0195a2c0-1a00-7000-8000-000000000002/" + file,
		"http://kong:8000/storage/v1/object/public/agent-avatars/" + me + "/" + file,
		"https://cdn.example.com/me.jpg",
		"", // null
	} {
		if key, ok := AvatarKeyFromURL(url, me); ok {
			t.Errorf("%q: got %q", url, key)
		}
	}
}
