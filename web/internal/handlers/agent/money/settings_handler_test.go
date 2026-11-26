package money

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
)

// chosen fails unless the <option> with this value is the selected one. The attributes come
// out in the page file's own order with `selected` appended, so this reads the option rather
// than pinning that order.
func chosen(t *testing.T, body, value string) {
	t.Helper()
	re := regexp.MustCompile(`<option value="` + regexp.QuoteMeta(value) + `"[^>]*\bselected\b`)
	if !re.MatchString(body) {
		t.Errorf("the option %q is not the selected one", value)
	}
}

// §3.12's four tabs and eight writes. What these pin:
//
//  1. THE TAB IS URL STATE, so every form action carries it. A refused save re-renders the
//     page the POST was sent to, and an action that dropped ?tab= would land the advisor on
//     Profile with their words gone (#216 and #217 each shipped a bug of this shape).
//  2. A REFUSAL KEEPS WHAT WAS TYPED. The page redraws the draft, never the stored value.
//  3. The time-away editor's id is ECHOED, so a refused-then-corrected save is one block.
//  4. Nothing reaches agent-settings that this page can refuse first.

// agent_settings_self RETURNS jsonb — a scalar — so the fake answers with the object itself,
// which is what PostgREST does and what this sub-area's one non-agentread read expects.
const settingsJSON = `{
	"profile": {"displayName":"Gyasi Story","pronouns":"he/him","email":"gyasi@story-tail.com",
		"phone":"+1 (305) 555-0184","bio":"A few warm lines.",
		"avatarUrl":"/storage/v1/object/public/agent-avatars/a/b.jpg",
		"socialLinks":{"instagram":"https://instagram.com/story.tail"}},
	"availability": {"timeZone":"America/New_York",
		"weeklySchedule":{"mon":{"start":"08:00","end":"16:00"},"tue":null,"wed":null,"thu":null,"fri":null,"sat":null,"sun":null},
		"responseTimeHours":4},
	"notifications": {"clientMessages":{"push":false,"email":true},"quoteRequests":{"push":true,"email":false}},
	"signature": {"text":"{{agent.name}}, Travel Advisor","isDefault":false},
	"today": "2026-10-17",
	"timeOff": [
		{"id":"0195a2c0-1a00-7000-8000-0000000000a1","startsOn":"2026-12-01","endsOn":"2026-12-05","label":"Family trip","autoReplyEnabled":true,"autoReplyText":"Back soon"},
		{"id":"0195a2c0-1a00-7000-8000-0000000000a2","startsOn":"2026-10-16","endsOn":"2026-10-20","label":"","autoReplyEnabled":false,"autoReplyText":""}
	]}`

func seedSettings(wd *world) {
	wd.fake.rpc["agent_settings_self"] = settingsJSON
}

var settingsTabPaths = []string{
	"/agent/settings",
	"/agent/settings?tab=availability",
	"/agent/settings?tab=notifications",
	"/agent/settings?tab=signature",
}

func TestEverySettingsTabRenders(t *testing.T) {
	for _, target := range settingsTabPaths {
		t.Run(target, func(t *testing.T) {
			wd := newWorld(t)
			seedSettings(wd)
			rec := wd.get(target)
			if rec.Code != http.StatusOK {
				t.Fatalf("%s answered %d\n%s", target, rec.Code, wd.logs.String())
			}
			body := rec.Body.String()
			// The tab strip is on every one of them, and the current tab says so.
			has(t, body, "Settings sections", `aria-current="page"`)
		})
	}
}

func TestSettingsThatCannotLoadSaysSo(t *testing.T) {
	wd := newWorld(t)
	wd.fake.failing["agent_settings_self"] = true
	rec := wd.get("/agent/settings?tab=availability")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("a failed read answered %d", rec.Code)
	}
	has(t, rec.Body.String(), "We couldn", "Try again")
}

// A read that answers null is not an advisor: the same "nothing to draw" as a failure.
func TestSettingsForSomebodyWithoutAnAgentRow(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_settings_self"] = `null`
	if rec := wd.get("/agent/settings"); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("a null snapshot answered %d", rec.Code)
	}
}

func TestAnAdminHasNoSettings(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	wd.fake.role = "admin"
	body := wd.get("/agent/settings").Body.String()
	has(t, body, "You don")
	lacks(t, body, "Settings sections")
}

// ── 3.12.1 Profile ──────────────────────────────────────────────────────────────────────

func TestProfileDrawsWhatIsStored(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	body := wd.get("/agent/settings").Body.String()
	has(t, body,
		`value="Gyasi Story"`, `value="he/him"`, `value="gyasi@story-tail.com"`,
		`value="+1 (305) 555-0184"`, "A few warm lines.",
		`value="https://instagram.com/story.tail"`,
		// The preview reads as a client will see it.
		"Gyasi · Travel Advisor", "(he/him)", "Usually replies within 4 hours",
	)
	// Every form on the tab says which tab it is, so a refusal comes back here.
	has(t, body, `action="/agent/settings?tab=profile"`)
}

func TestInitialsWhereThereIsNoPhoto(t *testing.T) {
	wd := newWorld(t)
	wd.fake.rpc["agent_settings_self"] = `{"profile":{"displayName":"Ada Lovelace"},"today":"2026-10-17"}`
	body := wd.get("/agent/settings").Body.String()
	has(t, body, ">AL<")
	lacks(t, body, "agent-avatars")
	// With no photo there is nothing to remove.
	lacks(t, body, `value="remove_avatar"`)
}

func TestARefusedProfileSaveKeepsWhatWasTyped(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_profile")
	form.Set("displayName", "Gyasi The Second")
	form.Set("pronouns", "they/them")
	form.Set("bio", "Rewritten bio.")
	form.Set("phone", "call me")
	rec := wd.post("/agent/settings?tab=profile", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a refused save answered %d", rec.Code)
	}
	body := rec.Body.String()
	has(t, body, "doesn&#39;t look right", `value="Gyasi The Second"`, `value="they/them"`, "Rewritten bio.", `value="call me"`)
	// The stored values must not be redrawn over the draft.
	lacks(t, body, `value="Gyasi Story"`)
	if len(wd.fake.calls) != 0 {
		t.Errorf("a bad phone number reached the function: %+v", wd.fake.calls)
	}
}

func TestABadLinkIsNamedOnItsOwnField(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_profile")
	form.Set("displayName", "Gyasi Story")
	form.Set("instagram", "https://evil.example.com/story")
	body := wd.post("/agent/settings?tab=profile", form).Body.String()
	has(t, body, "Instagram should be a link on instagram.com.", `value="https://evil.example.com/story"`)
	if len(wd.fake.calls) != 0 {
		t.Errorf("an off-site link reached the function: %+v", wd.fake.calls)
	}
}

func TestProfileSaveNormalisesTheLinks(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_profile")
	form.Set("displayName", "  Gyasi Story  ")
	form.Set("instagram", "@story.tail")
	form.Set("website", "story-tail.com")
	rec := wd.post("/agent/settings?tab=profile", form)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/settings" {
		t.Fatalf("a save answered %d to %q", rec.Code, rec.Header().Get("Location"))
	}
	if len(wd.fake.calls) != 1 || wd.fake.calls[0].Name != "agent-settings" {
		t.Fatalf("the save called %+v", wd.fake.calls)
	}
	body := wd.fake.calls[0].Body
	if string(body["op"]) != `"update_profile"` || string(body["displayName"]) != `"Gyasi Story"` {
		t.Errorf("the function was asked for %v", body)
	}
	links := string(body["socialLinks"])
	if !strings.Contains(links, `"instagram":"https://instagram.com/story.tail"`) ||
		!strings.Contains(links, `"website":"https://story-tail.com"`) {
		t.Errorf("the links went as %s", links)
	}
}

func TestTheFunctionsOwnRefusalIsShown(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	wd.fake.functions["POST agent-settings"] = reply{Status: 400, Body: `{"detail":"That name is already taken."}`}
	form := url.Values{}
	form.Set("op", "update_profile")
	form.Set("displayName", "Gyasi Story")
	body := wd.post("/agent/settings?tab=profile", form).Body.String()
	has(t, body, "That name is already taken.")
}

func TestAPhotoWithNothingPreparedSaysSo(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "set_avatar")
	form.Set("image", "")
	rec := wd.post("/agent/settings?tab=profile", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an empty photo answered %d", rec.Code)
	}
	has(t, rec.Body.String(), "We couldn&#39;t read that photo.")
	if len(wd.fake.calls) != 0 {
		t.Errorf("an empty image reached the function: %+v", wd.fake.calls)
	}
}

// ── 3.12.2 Availability ─────────────────────────────────────────────────────────────────

func TestAvailabilityDrawsTheStoredWeek(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	body := wd.get("/agent/settings?tab=availability").Body.String()
	chosen(t, body, "America/New_York")
	chosen(t, body, "4")
	has(t, body,
		`name="on-mon"`, `value="08:00"`, `value="16:00"`,
		// A day that is off keeps the 9-to-5 default in the boxes, ready to be turned on.
		`name="from-tue"`, `value="09:00"`,
		// The week picture's column count is an attribute money.css has a rule for.
		`data-cols=`,
	)
	// The running block can only be ended; the upcoming one can be edited.
	has(t, body, "Away now", "I&#39;m back", "Dec 1 – Dec 5", "Family trip", "Automatic reply on")
	has(t, body, `href="/agent/settings?tab=availability&amp;away=0195a2c0-1a00-7000-8000-0000000000a1"`)
}

func TestARefusedScheduleKeepsTheTypedHours(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_availability")
	form.Set("timeZone", "America/Chicago")
	form.Set("responseTimeHours", "12")
	for _, d := range weekdays {
		form.Set("on-"+d, "1")
		form.Set("from-"+d, "07:00")
		form.Set("to-"+d, "21:00")
	}
	form.Set("from-fri", "09:15")
	rec := wd.post("/agent/settings?tab=availability", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a quarter-hour start answered %d", rec.Code)
	}
	body := rec.Body.String()
	has(t, body, "Working hours go in half-hour steps.", `value="09:15"`)
	chosen(t, body, "America/Chicago")
	chosen(t, body, "12")
	if len(wd.fake.calls) != 0 {
		t.Errorf("a bad schedule reached the function: %+v", wd.fake.calls)
	}
}

func TestSavingTheWeek(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_availability")
	form.Set("timeZone", "America/Chicago")
	form.Set("responseTimeHours", "48")
	for _, d := range weekdays {
		form.Set("on-"+d, "1")
		form.Set("from-"+d, "07:00")
		form.Set("to-"+d, "21:00")
	}
	form.Del("on-sun")
	rec := wd.post("/agent/settings?tab=availability", form)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/settings?tab=availability" {
		t.Fatalf("a save answered %d to %q", rec.Code, rec.Header().Get("Location"))
	}
	body := string(wd.fake.calls[0].Body["weeklySchedule"])
	if !strings.Contains(body, `"sun":null`) || !strings.Contains(body, `"mon":{"start":"07:00","end":"21:00"}`) {
		t.Errorf("the week went as %s", body)
	}
	if string(wd.fake.calls[0].Body["responseTimeHours"]) != "48" {
		t.Errorf("the reply time went as %s", wd.fake.calls[0].Body["responseTimeHours"])
	}
}

func TestTheTimeAwayEditorIsAURL(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)

	closed := wd.get("/agent/settings?tab=availability").Body.String()
	lacks(t, closed, "Schedule time away</h4>", `name="startsOn"`)

	open := wd.get("/agent/settings?tab=availability&away=new").Body.String()
	has(t, open, `name="startsOn"`, "Schedule time away",
		// The form posts back to the URL it was drawn at, or the refusal lands elsewhere.
		`action="/agent/settings?tab=availability&amp;away=new"`,
		// The default words wait in the box even while the reply is off.
		"I&#39;m away resting until {{return_date}}")

	edit := wd.get("/agent/settings?tab=availability&away=0195a2c0-1a00-7000-8000-0000000000a1").Body.String()
	has(t, edit, "Edit time away", `value="2026-12-01"`, `value="2026-12-05"`, `value="Family trip"`,
		`action="/agent/settings?tab=availability&amp;away=0195a2c0-1a00-7000-8000-0000000000a1"`)
}

func TestARefusedTimeAwayKeepsItsIdAndItsWords(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	const id = "0195a2c0-1a00-7000-8000-0000000000b9"
	form := url.Values{}
	form.Set("op", "save_time_off")
	form.Set("timeOffId", id)
	form.Set("isNew", "1")
	form.Set("startsOn", "2026-12-10")
	form.Set("endsOn", "2026-12-01")
	form.Set("label", "Rest week")
	rec := wd.post("/agent/settings?tab=availability&away=new", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a backwards range answered %d", rec.Code)
	}
	body := rec.Body.String()
	has(t, body, "The last day away can&#39;t be before the first.", `value="2026-12-10"`, `value="Rest week"`)
	// THE SAME ID comes back: a fresh one on every render would turn one block into two.
	has(t, body, `value="`+id+`"`)
	if len(wd.fake.calls) != 0 {
		t.Errorf("a backwards range reached the function: %+v", wd.fake.calls)
	}
}

func TestSavingTimeAway(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	const id = "0195a2c0-1a00-7000-8000-0000000000b9"
	form := url.Values{}
	form.Set("op", "save_time_off")
	form.Set("timeOffId", id)
	form.Set("isNew", "1")
	form.Set("startsOn", "2026-12-10")
	form.Set("endsOn", "2026-12-12")
	form.Set("autoReplyEnabled", "1")
	form.Set("autoReplyText", "  Back on {{return_date}}  ")
	rec := wd.post("/agent/settings?tab=availability&away=new", form)
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("a save answered %d: %s", rec.Code, rec.Body.String())
	}
	b := wd.fake.calls[0].Body
	if string(b["timeOffId"]) != `"`+id+`"` || string(b["isNew"]) != "true" ||
		string(b["autoReplyEnabled"]) != "true" || string(b["autoReplyText"]) != `"Back on {{return_date}}"` {
		t.Errorf("the block went as %v", b)
	}
}

func TestAnAutoReplyIsOnlyCheckedWhileItIsOn(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "save_time_off")
	form.Set("timeOffId", "0195a2c0-1a00-7000-8000-0000000000b9")
	form.Set("startsOn", "2026-12-10")
	form.Set("endsOn", "2026-12-12")
	// Off, and with words that would be refused: hidden words never block a save, and they
	// are not carried either, so turning it on later cannot resurrect them.
	form.Set("autoReplyText", "Back {{agent.name}}")
	rec := wd.post("/agent/settings?tab=availability&away=new", form)
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("a hidden bad reply blocked the save: %d", rec.Code)
	}
	if got := string(wd.fake.calls[0].Body["autoReplyText"]); got != `""` {
		t.Errorf("the refused words were carried: %s", got)
	}
}

func TestEndingTimeAway(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "end_time_off")
	form.Set("timeOffId", "0195a2c0-1a00-7000-8000-0000000000a2")
	rec := wd.post("/agent/settings?tab=availability", form)
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("ending a block answered %d", rec.Code)
	}
	if string(wd.fake.calls[0].Body["op"]) != `"end_time_off"` {
		t.Errorf("the write was %v", wd.fake.calls[0].Body)
	}

	// An id that is not one never reaches the function.
	wd2 := newWorld(t)
	seedSettings(wd2)
	bad := url.Values{}
	bad.Set("op", "end_time_off")
	bad.Set("timeOffId", "all")
	if rec := wd2.post("/agent/settings?tab=availability", bad); rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("a made-up id answered %d", rec.Code)
	}
	if len(wd2.fake.calls) != 0 {
		t.Errorf("a made-up id reached the function: %+v", wd2.fake.calls)
	}
}

// ── 3.12.3 Notifications ────────────────────────────────────────────────────────────────

func TestNotificationsDrawAndSave(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	body := wd.get("/agent/settings?tab=notifications").Body.String()
	has(t, body, `aria-label="Client message by email"`, `aria-label="New inquiries and messages by push"`,
		`action="/agent/settings?tab=notifications"`)

	form := url.Values{}
	form.Set("op", "update_notifications")
	form.Set("clientMessagesEmail", "1")
	form.Set("quoteRequestsPush", "1")
	rec := wd.post("/agent/settings?tab=notifications", form)
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("a save answered %d", rec.Code)
	}
	b := wd.fake.calls[0].Body
	// An unticked box is absent from a form post, which is "off", not "unchanged".
	if string(b["clientMessagesEmail"]) != "true" || string(b["clientMessagesPush"]) != "false" ||
		string(b["quoteRequestsPush"]) != "true" || string(b["quoteRequestsEmail"]) != "false" {
		t.Errorf("the switches went as %v", b)
	}
}

// ── 3.12.4 Signature ────────────────────────────────────────────────────────────────────

func TestSignatureDrawsItsPreview(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	body := wd.get("/agent/settings?tab=signature").Body.String()
	has(t, body,
		"{{agent.name}}, Travel Advisor",
		// The preview fills the fields and always ends with the locked line.
		"Gyasi Story, Travel Advisor",
		"Story-Tail Adventures · Hosted by Inteletravel",
		"From: Gyasi at Story-Tail Adventures",
		// The module redraws the same lines from these three values.
		`data-sig-name="Gyasi Story"`,
	)
}

func TestARefusedSignatureKeepsTheText(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_signature")
	form.Set("signature", "Hello {{client.firstName}}")
	rec := wd.post("/agent/settings?tab=signature", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an unknown field answered %d", rec.Code)
	}
	has(t, rec.Body.String(), "We don&#39;t have a {{client.firstName}} field.", "Hello {{client.firstName}}")
	if len(wd.fake.calls) != 0 {
		t.Errorf("an unknown field reached the function: %+v", wd.fake.calls)
	}
}

func TestUsingTheDefaultSignature(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_signature")
	form.Set("signature", "")
	rec := wd.post("/agent/settings?tab=signature", form)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/settings?tab=signature" {
		t.Fatalf("the reset answered %d to %q", rec.Code, rec.Header().Get("Location"))
	}
	// Empty means "use the default": nothing is stored, so a better default later still
	// reaches an advisor who never wrote their own.
	if got := string(wd.fake.calls[0].Body["signature"]); got != `""` {
		t.Errorf("the reset sent %s", got)
	}
}

// ── The POST door ───────────────────────────────────────────────────────────────────────

func TestAnUnknownOpIsNotGuessedAt(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "drop_everything")
	rec := wd.post("/agent/settings?tab=profile", form)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/settings" {
		t.Fatalf("an unknown op answered %d to %q", rec.Code, rec.Header().Get("Location"))
	}
	if len(wd.fake.calls) != 0 {
		t.Errorf("an unknown op reached the function: %+v", wd.fake.calls)
	}
}

// An op belongs to ONE tab, so a refusal cannot be made to re-render another.
func TestAnOpRefusesOnItsOwnTab(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_signature")
	form.Set("signature", "{{nope}}")
	body := wd.post("/agent/settings?tab=profile", form).Body.String()
	// Signature's own tab, whatever the query claimed.
	has(t, body, "Your signature", "We don&#39;t have a {{nope}} field.")
	lacks(t, body, "What clients see in emails and the portal.")
}

// The avatar is a PATH in the bucket, put on the Supabase origin the browser uses — and only
// when the page would let it through. page.SafeURL allows https and relative references
// only, so an http:// origin (the local stack) draws the initials rather than an <img> with
// no src, which renders as a broken-image icon.
func TestTheAvatarOnlyDrawsAURLThePageAllows(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	// The harness's Supabase is an http:// httptest server, as the local stack is.
	body := wd.get("/agent/settings").Body.String()
	has(t, body, ">GS<")
	lacks(t, body, "agent-avatars")

	if got := avatarSrc("/storage/v1/object/public/agent-avatars/a/b.jpg", "https://x.supabase.co"); got != "https://x.supabase.co/storage/v1/object/public/agent-avatars/a/b.jpg" {
		t.Errorf("a production origin builds %q", got)
	}
}

// A field's own refusal is shown ONCE, under the box it is about. Saying it in the banner
// as well reads as two different problems.
func TestAFieldsRefusalIsNotAlsoInTheBanner(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	form := url.Values{}
	form.Set("op", "update_profile")
	form.Set("displayName", "Gyasi Story")
	form.Set("phone", "call me")
	body := wd.post("/agent/settings?tab=profile", form).Body.String()
	if n := strings.Count(body, "doesn&#39;t look right"); n != 1 {
		t.Errorf("the phone refusal is on the page %d times, want 1", n)
	}
	// A refusal the FUNCTION wrote belongs to no field, so that one does go in the banner.
	wd2 := newWorld(t)
	seedSettings(wd2)
	wd2.fake.functions["POST agent-settings"] = reply{Status: 400, Body: `{"detail":"Nope."}`}
	ok := url.Values{}
	ok.Set("op", "update_profile")
	ok.Set("displayName", "Gyasi Story")
	has(t, wd2.post("/agent/settings?tab=profile", ok).Body.String(), "Nope.")
}

// ── What an independent review proved ───────────────────────────────────────────────────

// postMultipart sends the photo form the way the browser does, so the cap under test is the
// one the photo actually meets.
func (wd *world) postMultipart(target string, fields map[string]string) *httptest.ResponseRecorder {
	wd.t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		if err := mw.WriteField(k, v); err != nil {
			wd.t.Fatal(err)
		}
	}
	if err := mw.Close(); err != nil {
		wd.t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, target, &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.AddCookie(wd.cookie())
	rec := httptest.NewRecorder()
	wd.h.ServeHTTP(rec, req)
	return rec
}

// A 400x400 JPEG at q0.88 is tens of kilobytes, and base64 is a third larger again.
// web.MaxFormBytes is 64 KiB, which a detailed photo passes easily — and the advisor got a
// bare "Request Entity Too Large" page, not the settings screen and not a sentence, because
// settings.js submits the form and nothing catches the answer. The photo posts as multipart
// with a cap of its own.
func TestANormalSizedPhotoIsNotRefused(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	// 150 KB of base64 is about 112 KB of JPEG: past anything a 400x400 photo produces, and
	// far past what the old urlencoded cap allowed.
	image := strings.Repeat("A", 150_000)
	rec := wd.postMultipart("/agent/settings?tab=profile",
		map[string]string{"op": "set_avatar", "image": image})
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("a %d-byte image answered %d (%q)", len(image), rec.Code, rec.Body.String())
	}
	if got := string(wd.fake.calls[0].Body["image"]); len(got) != len(image)+2 {
		t.Errorf("the image reached the function as %d bytes, want %d", len(got), len(image))
	}
}

// Past the photo's own cap it is still refused, but as a size — nothing unbounded is read.
func TestAPhotoPastTheCapIsRefused(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	rec := wd.postMultipart("/agent/settings?tab=profile",
		map[string]string{"op": "set_avatar", "image": strings.Repeat("A", maxAvatarPost+1)})
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("an oversized image answered %d", rec.Code)
	}
	if len(wd.fake.calls) != 0 {
		t.Errorf("an oversized image reached the function: %+v", wd.fake.calls)
	}
}

// The hours form's action is the one a refused save re-renders from. Dropping ?away= closed
// the time-away editor and took the dates, label and reply words typed into it with it —
// the hazard settings.go's own comment names.
func TestTheHoursFormKeepsTheTimeAwayEditorOpen(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	body := wd.get("/agent/settings?tab=availability&away=new").Body.String()
	for _, slot := range []string{"av-form", "away-form", "away-end-form"} {
		f := readForm(t, body, slot)
		if !strings.Contains(f.action, "away=new") {
			t.Errorf("%s posts to %q, which closes the editor on a refusal", slot, f.action)
		}
	}

	// And it really stays open: a refused schedule comes back with the words still in it.
	f := readForm(t, body, "av-form")
	f.fields.Set("from-mon", "09:15")
	f.fields.Set("startsOn", "")
	rec := wd.click(f, f.defaultSubmit(t))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a quarter-hour start answered %d", rec.Code)
	}
	has(t, rec.Body.String(), "Working hours go in half-hour steps.", `name="startsOn"`, "Schedule time away")
}
