package public

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/session"
)

// The field rules, case for case from web/app/(public)/(plain)/join/schema.test.ts (which
// tests lib/validation/registration.ts and auth.ts through the gate's own schema). Control
// characters are written as escapes so nothing invisible lives in this file.

func TestValidateName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Jordan", ""},
		{"  José-María ", ""},
		{"", nameRequired},
		{"   ", nameRequired},
		// Whitespace-only input trims to nothing before any other rule runs.
		{"\n\t", nameRequired},
		{strings.Repeat("a", joinNameMax), ""},
		{strings.Repeat("a", joinNameMax+1), nameTooLong},
		// The cap is applied after trimming, not before.
		{"  " + strings.Repeat("a", joinNameMax) + "  ", ""},
		{"Jor\ndan", nameInvalid},
		{"Jor\r\ndan", nameInvalid},
		{"Jor\tdan", nameInvalid},
		{"Jordan\u0000", nameInvalid},
		{"\u001bJordan", nameInvalid},
		// A C1 control (NEL), not just C0.
		{"Jor\u0085dan", nameInvalid},
		{"Zoë 👋", ""},
	}
	for _, c := range cases {
		if _, got := validateName(c.in); got != c.want {
			t.Errorf("validateName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	// 80 is counted the way JavaScript counts it: an emoji is two.
	if _, got := validateName(strings.Repeat("👋", 40)); got != "" {
		t.Errorf("40 emoji (80 code units) = %q, want no error", got)
	}
	if _, got := validateName(strings.Repeat("👋", 41)); got != nameTooLong {
		t.Errorf("41 emoji (82 code units) = %q, want %q", got, nameTooLong)
	}
	if value, _ := validateName("  José-María "); value != "José-María" {
		t.Errorf("the name was not trimmed: %q", value)
	}
}

func TestValidateEmail(t *testing.T) {
	cases := []struct{ in, want string }{
		{"jordan@example.com", ""},
		{"  jordan@example.com ", ""},
		{"", emailRequired},
		{"   ", emailRequired},
		{"jordan@example", emailInvalid},
		{"jordan example.com", emailInvalid},
		{"jordan@exam ple.com", emailInvalid},
		{"@example.com", emailInvalid},
	}
	for _, c := range cases {
		if _, got := validateEmail(c.in); got != c.want {
			t.Errorf("validateEmail(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestValidatePassword(t *testing.T) {
	cases := []struct{ in, want string }{
		{"GreenPastures1", ""},
		{"still-waters-99X", ""},
		{"Short1", passwordTooShort},
		{"alllowercase", passwordNeedsDigit},
		{"alllowercase1", passwordNeedsUpper},
		{"PASSWORD12345", passwordNeedsLower},
		// Not trimmed: the spaces someone typed are part of their password.
		{" GreenPastures1 ", ""},
	}
	for _, c := range cases {
		if got := validatePassword(c.in); got != c.want {
			t.Errorf("validatePassword(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestValidateJoinGroupsOneMessagePerField(t *testing.T) {
	in, errs := validateJoin(url.Values{
		"firstName": {""}, "lastName": {"Ha\nyes"}, "email": {"x"},
		"password": {""}, "terms": {""},
	})
	want := joinErrors{
		FirstName: nameRequired, LastName: nameInvalid, Email: emailInvalid,
		Password: passwordTooShort, Terms: termsRequired,
	}
	if errs != want {
		t.Errorf("errors = %+v, want %+v", errs, want)
	}
	if in.Password != "" {
		t.Error("the password was changed on its way through")
	}

	// The checkbox: only the literal value a checked box posts will do.
	for _, bad := range []string{"", "off", "true", "yes", "ON"} {
		if _, errs := validateJoin(url.Values{
			"firstName": {"Jordan"}, "lastName": {"Hayes"}, "email": {"jordan@example.com"},
			"password": {"GreenPastures1"}, "terms": {bad},
		}); errs.Terms != termsRequired {
			t.Errorf("terms %q was accepted", bad)
		}
	}
	if _, errs := validateJoin(url.Values{
		"firstName": {"Jordan"}, "lastName": {"Hayes"}, "email": {"jordan@example.com"},
		"password": {"GreenPastures1"}, "terms": {"on"},
	}); errs.any() {
		t.Errorf("a good form was refused: %+v", errs)
	}
}

// The headline and the button by intent, from state.test.ts.
func TestJoinCopyByIntent(t *testing.T) {
	cases := []struct {
		intent     search.JoinIntent
		tripName   string
		wantTitle  string
		wantSubmit string
	}{
		{search.IntentQuote, "", "Create an account to send Gyasi your trip details.", "Create account & send my request"},
		{search.IntentQuote, "Beaches Turks & Caicos", "Create an account to send Gyasi your trip details for Beaches Turks & Caicos.", "Create account & send my request"},
		{search.IntentSave, "", "Create an account to save this for later.", "Create account & save"},
		{search.IntentMessage, "", "Almost there — tell Gyasi what you're dreaming about.", "Create account"},
		{search.IntentTour, "", "Create an account to start planning with Gyasi.", "Create account"},
		{"", "", "Create an account to start planning with Gyasi.", "Create account"},
	}
	for _, c := range cases {
		if got := joinTitle(c.intent, c.tripName); got != c.wantTitle {
			t.Errorf("joinTitle(%q, %q) = %q, want %q", c.intent, c.tripName, got, c.wantTitle)
		}
		if got := joinSubmitLabel(c.intent); got != c.wantSubmit {
			t.Errorf("joinSubmitLabel(%q) = %q, want %q", c.intent, got, c.wantSubmit)
		}
	}
	// Only the quote headline mentions the trip.
	for _, intent := range []search.JoinIntent{search.IntentSave, search.IntentMessage, search.IntentTour, ""} {
		if strings.Contains(joinTitle(intent, "Some Resort"), "Some Resort") {
			t.Errorf("joinTitle(%q) named the trip", intent)
		}
	}
	// It never says "send quote": the visitor requests, and Gyasi sends.
	for _, intent := range append(search.JoinIntents, "") {
		if strings.Contains(strings.ToLower(joinSubmitLabel(intent)), "send quote") {
			t.Errorf("joinSubmitLabel(%q) promises to send a quote", intent)
		}
	}
}

func TestJoinPageDropsWhatAVisitorTyped(t *testing.T) {
	s, _ := formSite(t)
	h := s.join(s.template(t, joinSpec))
	trip := firstTrip(t)

	rec := get(t, h, "/join?intent=quote&trip="+url.QueryEscape(trip.Slug)+"&next=/explore/"+url.QueryEscape(trip.Slug))
	body := rec.Body.String()
	if !strings.Contains(body, htmlEscape("Create an account to send Gyasi your trip details for "+trip.Name+".")) {
		t.Errorf("the headline does not name the catalog trip:\n%s", body)
	}
	if !strings.Contains(body, htmlEscape("Create account & send my request")) {
		t.Error("the submit button does not match the intent")
	}
	if !strings.Contains(body, `name="next" value="/explore/`+trip.Slug+`"`) {
		t.Error("next was not carried into the form")
	}

	rec = get(t, h, "/join?intent=%3Cevil%3E&trip=%3Cb%3Eevil%3C%2Fb%3E&next=https%3A%2F%2Fevil.example")
	body = rec.Body.String()
	if strings.Contains(body, "evil") {
		t.Errorf("a visitor's own text reached the page:\n%s", body)
	}
	if !strings.Contains(body, `name="next" value="/dashboard"`) {
		t.Error("an off-origin next was not replaced by the default")
	}
	if !strings.Contains(body, `<meta name="robots" content="noindex, follow"/>`) {
		t.Error("the gate is indexable")
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store (the gate is behind the auth-only gate)", got)
	}
}

func TestJoinRefusesABadFormWithoutCallingAnything(t *testing.T) {
	s, fake := formSite(t)
	rec := post(t, s.joinPost(s.template(t, joinSpec)), "/join", url.Values{
		"firstName": {"Jordan"}, "lastName": {""}, "email": {"nope"},
		"password": {"short"}, "terms": {""},
	})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{nameRequired, emailInvalid, passwordTooShort, termsRequired} {
		if !strings.Contains(body, htmlEscape(want)) {
			t.Errorf("%q is not shown:\n%s", want, body)
		}
	}
	if !strings.Contains(body, `value="Jordan"`) {
		t.Error("what was typed was cleared")
	}
	if strings.Contains(body, `name="password" value="short"`) {
		t.Error("the password was echoed back into the page")
	}
	if len(fake.taken()) != 0 {
		t.Error("a form that cannot be right was sent to the auth server anyway")
	}
}

// goodJoin is a form that passes every field rule.
func goodJoin() url.Values {
	return url.Values{
		"firstName": {"Jordan"}, "lastName": {"Hayes"}, "email": {"jordan@example.com"},
		"password": {"GreenPastures1"}, "terms": {"on"}, "next": {"/trips/new?kind=hotel"},
	}
}

func TestJoinSignsUpAndStartsTheSession(t *testing.T) {
	s, fake := formSite(t)
	fake.answer(http.StatusOK, `{"access_token":"at","refresh_token":"rt","expires_at":4102444800}`)
	rec := post(t, s.joinPost(s.template(t, joinSpec)), "/join", goodJoin())

	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status = %d, want 303\n%s", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Location"); got != "/trips/new?kind=hotel" {
		t.Errorf("Location = %q", got)
	}
	var started bool
	for _, c := range rec.Result().Cookies() {
		if c.Name == session.CookieName {
			started = true
		}
	}
	if !started {
		t.Error("the session was not started")
	}
	calls := fake.taken()
	if len(calls) != 1 || calls[0].Path != "/auth/v1/signup" {
		t.Fatalf("calls = %+v", calls)
	}
	// Exactly two metadata keys, built from validated fields: handle_new_user trusts them.
	if got, want := calls[0].Body, `{"email":"jordan@example.com","password":"GreenPastures1","data":{"first_name":"Jordan","last_name":"Hayes"}}`; got != want {
		t.Errorf("body = %s, want %s", got, want)
	}
	if got := calls[0].Query.Get("redirect_to"); got != "http://localhost:8080/auth/callback?next=%2Ftrips%2Fnew%3Fkind%3Dhotel" {
		t.Errorf("redirect_to = %q", got)
	}
}

func TestJoinConfirmPanelIsTheSameForATakenAddress(t *testing.T) {
	s, fake := formSite(t)
	tmpl := s.template(t, joinSpec)

	// A sign-up that needs confirmation: a user, no session.
	fake.answer(http.StatusOK, `{"id":"u1","email":"jordan@example.com"}`)
	first := post(t, s.joinPost(tmpl), "/join", goodJoin())
	// The same address again, with confirmations off, is GoTrue's user_already_exists.
	fake.answer(http.StatusUnprocessableEntity, `{"error_code":"user_already_exists","msg":"User already registered"}`)
	second := post(t, s.joinPost(tmpl), "/join", goodJoin())

	for _, rec := range []string{first.Body.String(), second.Body.String()} {
		if !strings.Contains(rec, "Check your inbox") {
			t.Fatalf("the check-your-inbox panel is missing:\n%s", rec)
		}
		if !strings.Contains(rec, "jordan@example.com") {
			t.Error("the panel does not say where the link went")
		}
		if strings.Contains(rec, "OR EMAIL") {
			t.Error("the form is still on the page")
		}
	}
	if first.Code != second.Code {
		t.Errorf("a taken address answers %d and a new one %d; the two must be indistinguishable",
			second.Code, first.Code)
	}
	if strings.Contains(second.Body.String(), "already") {
		t.Error("the page admits the address has an account")
	}
}

func TestJoinPutsTheAuthServersOwnRefusalWhereItBelongs(t *testing.T) {
	s, fake := formSite(t)
	tmpl := s.template(t, joinSpec)
	cases := []struct {
		name, body string
		status     int
		wantField  string
		wantText   string
	}{
		{"a weak password lands on the password field", `{"error_code":"weak_password"}`,
			http.StatusUnprocessableEntity, "password-error", "That password is a little too easy to guess."},
		{"an address GoTrue will not mail lands on the email field", `{"error_code":"email_address_invalid"}`,
			http.StatusUnprocessableEntity, "email-error", "We can't send email to that address — try a different one."},
		{"anything else is just try again", `{"error_code":"unexpected_failure"}`,
			http.StatusInternalServerError, "", "Something went sideways on our end. Try again in a moment."},
		// A sign-up has no "wrong password": that sentence is sign-in vocabulary.
		{"a bare 400 does not borrow the sign-in sentence", `{}`,
			http.StatusBadRequest, "", "Something went sideways on our end. Try again in a moment."},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fake.answer(c.status, c.body)
			rec := post(t, s.joinPost(tmpl), "/join", goodJoin())
			body := rec.Body.String()
			if !strings.Contains(body, htmlEscape(c.wantText)) {
				t.Errorf("%q is not shown:\n%s", c.wantText, body)
			}
			if strings.Contains(body, "That email and password don't match") {
				t.Error("the sign-in sentence reached a sign-up")
			}
			if c.wantField != "" && !strings.Contains(body, `id="`+c.wantField+`"`) {
				t.Errorf("the message is not on the %s field", c.wantField)
			}
			if !strings.Contains(body, "OR EMAIL") {
				t.Error("the form is gone, so there is nothing to correct")
			}
		})
	}
}
