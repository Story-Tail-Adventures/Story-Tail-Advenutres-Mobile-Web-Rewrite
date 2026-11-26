package public

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// The three form pages share one harness: a Supabase that records what it was asked and
// answers what the test told it to. Ported from the vitest suites beside each Next page
// (message/{actions,page}.test.ts, join/{schema,state}.test.ts,
// email/unsubscribe/{actions,page}.test.ts), plus the handler checks those suites could not
// make: the status, the redirect and the headers.

// call is one request the fake Supabase saw.
type call struct {
	Method string
	Path   string
	Query  url.Values
	Header http.Header
	Body   string
}

// fakeSupabase answers every function call with reply, and records the calls. Safe for the
// httptest server's goroutine.
type fakeSupabase struct {
	mu     sync.Mutex
	calls  []call
	status int
	body   string
}

func (f *fakeSupabase) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	f.mu.Lock()
	f.calls = append(f.calls, call{
		Method: r.Method, Path: r.URL.Path, Query: r.URL.Query(),
		Header: r.Header.Clone(), Body: string(raw),
	})
	status, body := f.status, f.body
	f.mu.Unlock()
	if status == 0 {
		status = http.StatusOK
	}
	if body == "" {
		body = `{"ok":true}`
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, body)
}

func (f *fakeSupabase) answer(status int, body string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.status, f.body = status, body
}

func (f *fakeSupabase) taken() []call {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := f.calls
	f.calls = nil
	return out
}

// formSite builds the public site with the three form pages loaded and a fake Supabase.
func formSite(t *testing.T) (*site, *fakeSupabase) {
	t.Helper()
	fake := &fakeSupabase{}
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)

	cfg := config.Config{
		Env: config.Development, Port: "8080", SiteURL: "http://localhost:8080",
		SupabaseURL: srv.URL, SupabaseAnonKey: "anon-key", LeadFormKey: "form-key",
	}
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	set, err := page.Load(pages.FS, messageSpec, joinSpec, unsubscribeSpec)
	if err != nil {
		t.Fatal(err)
	}
	sc := supa.New(cfg.SupabaseURL, cfg.SupabaseAnonKey, nil)
	return &site{
		Deps: handlers.Deps{
			Pages:    set,
			Supa:     sc,
			Sessions: session.NewManager(sc, false, log),
			API: api.New(api.Config{
				SupabaseURL: cfg.SupabaseURL, AnonKey: cfg.SupabaseAnonKey, LeadFormKey: cfg.LeadFormKey,
			}, nil, log),
			Config: cfg,
			Log:    log,
		},
		cat: content.Get(),
	}, fake
}

// template takes a loaded page the way Mount does.
func (s *site) template(t *testing.T, spec page.Spec) *page.Template {
	t.Helper()
	tmpl, err := s.Pages.Template(spec.File)
	if err != nil {
		t.Fatal(err)
	}
	return tmpl
}

// post sends a form the way a browser does.
func post(t *testing.T, h http.HandlerFunc, target string, form url.Values) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func get(t *testing.T, h http.HandlerFunc, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

// firstTrip is a trip that really is in the catalog, as TRIPS[0] was in the vitest suites.
func firstTrip(t *testing.T) content.Trip {
	t.Helper()
	trips := content.Get().Trips
	if len(trips) == 0 {
		t.Fatal("the catalog has no trips")
	}
	return trips[0]
}

func TestMessageTag(t *testing.T) {
	// The page's `tag`: replace(/[^\w.\-+ ]/g, "").slice(0, 100).
	cases := []struct{ in, want string }{
		{"", ""},
		{"instagram", "instagram"},
		{"insta<script>gram", "instascriptgram"},
		{"spring sale-2026_v1.2+a", "spring sale-2026_v1.2+a"},
		{"drop/these&chars#", "dropthesechars"},
		{strings.Repeat("a", 120), strings.Repeat("a", 100)},
		// Non-ASCII is not \w in JavaScript, so it goes with the rest.
		{"café", "caf"},
	}
	for _, c := range cases {
		if got := messageTag(c.in); got != c.want {
			t.Errorf("messageTag(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestMessageAboutComesFromTheCatalog(t *testing.T) {
	cat := content.Get()
	trip := firstTrip(t)
	cases := []struct {
		name                     string
		trip, topic              string
		wantSlug, wantTopic, lbl string
	}{
		{"a catalog trip is named by the catalog", trip.Slug, "", trip.Slug, "", trip.Name},
		{"a trip wins over a topic", trip.Slug, "honeymoons", trip.Slug, "", trip.Name},
		{"a known topic", "", "honeymoons", "", "honeymoons", "a honeymoon"},
		{"an unknown trip drops out", "<b>evil</b>", "", "", "", ""},
		{"an unknown topic drops out", "", "evil", "", "", ""},
		{"a trip that is not in the catalog never becomes a topic", "not-a-trip", "caribbean", "", "caribbean", "a Caribbean week"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			slug, topic, label := messageAbout(cat, c.trip, c.topic)
			if slug != c.wantSlug || topic != c.wantTopic || label != c.lbl {
				t.Errorf("messageAbout(%q, %q) = (%q, %q, %q), want (%q, %q, %q)",
					c.trip, c.topic, slug, topic, label, c.wantSlug, c.wantTopic, c.lbl)
			}
		})
	}
}

func TestMessageSourceIsAnAllowList(t *testing.T) {
	for _, ok := range []string{"landing", "how-it-works", "about", "topic", "results", "detail", "join"} {
		if messageSource(ok) != ok {
			t.Errorf("messageSource(%q) dropped a known source", ok)
		}
	}
	for _, bad := range []string{"", "evil", "<evil>", "Landing"} {
		if got := messageSource(bad); got != "" {
			t.Errorf("messageSource(%q) = %q, want \"\"", bad, got)
		}
	}
}

func TestMessageLinks(t *testing.T) {
	trip := firstTrip(t)
	withTrip := messageView{Trip: trip.Slug, From: "detail"}
	none := messageView{}
	if got, want := withTrip.exploreHref(), "/explore/"+trip.Slug; got != want {
		t.Errorf("exploreHref = %q, want %q", got, want)
	}
	if got := none.exploreHref(); got != "/" {
		t.Errorf("exploreHref with no trip = %q, want /", got)
	}
	if got, want := withTrip.joinHref(), "/join?intent=quote&trip="+trip.Slug; got != want {
		t.Errorf("joinHref = %q, want %q", got, want)
	}
	if got, want := none.joinHref(), "/join?intent=tour"; got != want {
		t.Errorf("joinHref with no trip = %q, want %q", got, want)
	}
	sent, err := url.Parse(withTrip.sentHref())
	if err != nil || sent.Path != "/message" {
		t.Fatalf("sentHref = %q", withTrip.sentHref())
	}
	q := sent.Query()
	if q.Get("sent") != "1" || q.Get("trip") != trip.Slug || q.Get("from") != "detail" {
		t.Errorf("sentHref lost its context: %q", withTrip.sentHref())
	}
}

func TestMessageBodyRebuildsTheContext(t *testing.T) {
	trip := firstTrip(t)
	v := messageView{
		From: "detail", Trip: trip.Slug, AboutLabel: trip.Name, UTMSource: "instagram",
		Values: messageValues{FirstName: "Dana", Email: "dana@example.com", Message: "Dreaming of Aruba."},
	}
	b := messageBody(v, "", 1000)
	if b.About == nil || *b.About != (leadMessageAbout{Kind: "trip", Slug: trip.Slug, Label: trip.Name}) {
		t.Errorf("about = %+v", b.About)
	}
	if b.Page == nil || *b.Page != "detail" {
		t.Errorf("page = %v", b.Page)
	}
	if b.UTM != (leadMessageUTM{Source: "instagram"}) {
		t.Errorf("utm = %+v", b.UTM)
	}
	if b.StartedAt != 1000 {
		t.Errorf("startedAt = %d", b.StartedAt)
	}

	// Nothing to say is left out, not sent as an empty string: page is null and the
	// campaign keys are absent, as `|| undefined` made them.
	plain := messageBody(messageView{}, "", 0)
	raw, err := json.Marshal(plain)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"page":null`) || !strings.Contains(string(raw), `"about":null`) {
		t.Errorf("empty body = %s", raw)
	}
	if strings.Contains(string(raw), `"source"`) {
		t.Errorf("an empty campaign tag was sent: %s", raw)
	}

	topic := messageBody(messageView{Topic: "cruises", AboutLabel: "a cruise"}, "", 0)
	if topic.About == nil || topic.About.Kind != "topic" || topic.About.Slug != "cruises" {
		t.Errorf("topic about = %+v", topic.About)
	}
}

func TestMessagePageDropsWhatAVisitorTyped(t *testing.T) {
	s, _ := formSite(t)
	h := s.message(s.template(t, messageSpec))
	trip := firstTrip(t)

	rec := get(t, h, "/message?from=detail&trip="+url.QueryEscape(trip.Slug))
	body := rec.Body.String()
	if !strings.Contains(body, "About: "+htmlEscape(trip.Name)) {
		t.Errorf("the card does not name the trip:\n%s", body)
	}
	if !strings.Contains(body, `name="trip" value="`+trip.Slug+`"`) {
		t.Error("the trip slug is not carried in the form")
	}

	rec = get(t, h, "/message?from=%3Cevil%3E&trip=%3Cb%3Eevil%3C%2Fb%3E&topic=evil&utm_source=insta%3Cscript%3Egram")
	body = rec.Body.String()
	for _, unwanted := range []string{"evil", "About:"} {
		if strings.Contains(body, unwanted) {
			t.Errorf("%q reached the page:\n%s", unwanted, body)
		}
	}
	if !strings.Contains(body, `name="utm_source" value="instascriptgram"`) {
		t.Error("the campaign tag was not cleaned")
	}
	if !strings.Contains(body, `name="from" value=""`) {
		t.Error("an unknown source was not dropped")
	}
}

func TestMessagePageIsNotIndexedAndCarriesTheHoneypot(t *testing.T) {
	s, fake := formSite(t)
	rec := get(t, s.message(s.template(t, messageSpec)), "/message")
	body := rec.Body.String()
	if !strings.Contains(body, `<meta name="robots" content="noindex, follow"/>`) {
		t.Error("the form is indexable")
	}
	if !strings.Contains(body, `name="website"`) || !strings.Contains(body, `tabindex="-1"`) {
		t.Error("the honeypot is missing or in the tab order")
	}
	if !strings.Contains(body, `name="startedAt" value="1`) {
		t.Error("the form does not say when it was drawn")
	}
	// The note's cap is the function's (Data-Model §11.2); the browser stops at the same
	// place, so nobody writes 300 words that are refused on arrival.
	if !strings.Contains(body, `maxlength="`+strconv.Itoa(messageMax)+`"`) {
		t.Errorf("the note does not carry the %d character cap", messageMax)
	}
	if len(fake.taken()) != 0 {
		t.Error("drawing the form called Supabase")
	}
}

func TestMessageSendPassesTheVisitorsAddressAndRedirects(t *testing.T) {
	s, fake := formSite(t)
	tmpl := s.template(t, messageSpec)
	trip := firstTrip(t)

	req := httptest.NewRequest(http.MethodPost, "/message", strings.NewReader(url.Values{
		"from": {"detail"}, "trip": {trip.Slug}, "firstName": {"Dana"},
		"email": {"dana@example.com"}, "message": {"Dreaming of Aruba."},
		"startedAt": {"1000"}, "utm_source": {"instagram"},
	}.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Cf-Connecting-Ip", "203.0.113.9")
	req.Header.Set("X-Forwarded-For", "198.51.100.7, 10.0.0.1")
	rec := httptest.NewRecorder()
	s.messagePost(tmpl)(rec, req)

	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status = %d, want 303\n%s", rec.Code, rec.Body)
	}
	loc, err := url.Parse(rec.Header().Get("Location"))
	if err != nil || loc.Path != messagePath || loc.Query().Get("sent") != "1" {
		t.Fatalf("Location = %q", rec.Header().Get("Location"))
	}
	calls := fake.taken()
	if len(calls) != 1 || calls[0].Path != "/functions/v1/lead-message" {
		t.Fatalf("calls = %+v", calls)
	}
	// The forged forwarded entry loses to the edge's own header, and the form key is what
	// lets the function trust the address at all.
	if got := calls[0].Header.Get("X-Sta-Client-Ip"); got != "203.0.113.9" {
		t.Errorf("client ip = %q", got)
	}
	if calls[0].Header.Get("X-Sta-Form-Key") == "" {
		t.Error("the form key was not sent, so the address is not trusted")
	}
	var body leadMessageBody
	if err := json.Unmarshal([]byte(calls[0].Body), &body); err != nil {
		t.Fatal(err)
	}
	if body.About == nil || body.About.Label != trip.Name {
		t.Errorf("about = %+v", body.About)
	}
	if body.StartedAt != 1000 {
		t.Errorf("startedAt = %d", body.StartedAt)
	}

	// The page the redirect lands on is the thank-you, with no form.
	sent := get(t, s.message(tmpl), rec.Header().Get("Location"))
	if !strings.Contains(sent.Body.String(), "Thank you. Your note is on its way.") {
		t.Error("the thank-you panel is missing")
	}
	if strings.Contains(sent.Body.String(), `name="website"`) {
		t.Error("the form is still on the page after a send")
	}
}

func TestMessageRefusalKeepsWhatWasTyped(t *testing.T) {
	s, fake := formSite(t)
	tmpl := s.template(t, messageSpec)
	fake.answer(http.StatusBadRequest, `{"detail":"Please check your email address."}`)

	rec := post(t, s.messagePost(tmpl), "/message", url.Values{
		"firstName": {"Dana"}, "email": {"nope"}, "message": {"Dreaming of Aruba."},
	})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "Please check your email address.") {
		t.Error("the function's own sentence is not shown")
	}
	if !strings.Contains(body, `value="nope"`) || !strings.Contains(body, "Dreaming of Aruba.") {
		t.Errorf("what was typed was cleared:\n%s", body)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}

func TestMessageRefusalKeepsWhenTheFormWasDrawn(t *testing.T) {
	s, fake := formSite(t)
	fake.answer(http.StatusBadRequest, `{"detail":"Please check your email address."}`)
	rec := post(t, s.messagePost(s.template(t, messageSpec)), "/message", url.Values{
		"firstName": {"Dana"}, "email": {"nope"}, "message": {"Hi."}, "startedAt": {"1000"},
	})
	// A fresh stamp would make the corrected send look like a machine to lead-message, which
	// drops those silently: the visitor would be thanked for a note that went nowhere.
	if !strings.Contains(rec.Body.String(), `name="startedAt" value="1000"`) {
		t.Errorf("the drawn-at time was reset on a refusal:\n%s", rec.Body)
	}
}

func TestMessageUnavailableSaysSo(t *testing.T) {
	s, fake := formSite(t)
	tmpl := s.template(t, messageSpec)
	for _, c := range []struct {
		name   string
		status int
		body   string
	}{
		{"a 400 with no sentence", http.StatusBadRequest, `{}`},
		{"a 500", http.StatusInternalServerError, `{}`},
		{"a 401, which cannot be a lost session here", http.StatusUnauthorized, `{}`},
	} {
		t.Run(c.name, func(t *testing.T) {
			fake.answer(c.status, c.body)
			rec := post(t, s.messagePost(tmpl), "/message", url.Values{
				"firstName": {"Dana"}, "email": {"dana@example.com"}, "message": {"Hi."},
			})
			if rec.Code < 400 {
				t.Fatalf("status = %d", rec.Code)
			}
			if !strings.Contains(rec.Body.String(), htmlEscape(messageUnavailable)) {
				t.Errorf("the outage sentence is missing:\n%s", rec.Body)
			}
			if strings.Contains(rec.Header().Get("Location"), "/login") {
				t.Error("a visitor with no account was sent to sign in")
			}
		})
	}
}

// htmlEscape is what x/net/html does to text on render, so a test can look for copy with an
// apostrophe or an ampersand in it.
func htmlEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&#34;", "'", "&#39;").Replace(s)
}
