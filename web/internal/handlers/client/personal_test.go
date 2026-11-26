package client_test

import (
	"net/http"
	"net/url"
	"testing"
)

// Screen 2.5.2, Personal info. It is 2.1.10's write without the wizard, so most of what
// matters is already tested there; these are the things only this screen does.

func seedPersonal(hn *harness) {
	hn.f.rows("client", map[string]any{
		"first_name": "Jordan", "last_name": "Hayes", "preferred_name": nil,
		"email": "jordan.hayes@example.com", "created_at": "2026-03-04T12:00:00Z",
		"phone": "+13055550184", "date_of_birth": "1990-02-14",
		"emergency_contact": map[string]any{"name": "Sam Hayes", "phone": "+13055550199",
			"relationship": "Partner"},
		"mailing_address_id": nil,
	})
}

func TestPersonalShowsWhatIsOnFileAndWhatCannotBeChangedHere(t *testing.T) {
	hn := newHarness(t)
	seedPersonal(hn)
	rec := hn.signedIn().get("/account/personal")

	has(t, rec, "Personal info",
		esc("What Gyasi needs to book without chasing you for paperwork."),
		// The account itself, read-only, with the note that says why without blaming anyone.
		"YOUR ACCOUNT", "Jordan Hayes", "jordan.hayes@example.com",
		esc("Changing your name or the address you sign in with isn’t something you can do here yet"),
		// And the fields, which are 2.1.10's.
		`value="+13055550184"`, `value="1990-02-14"`, "Sam Hayes",
		"Save", "Cancel")
}

// Neither is a column this app writes: changing an email is GoTrue's job and account.email
// is mirrored back by a trigger that does not exist, and no function writes the name at all.
func TestTheNameAndEmailAreNotFields(t *testing.T) {
	hn := newHarness(t)
	seedPersonal(hn)
	body := hn.signedIn().get("/account/personal").Body.String()
	f := readForm(t, body, "personal-form")
	for _, never := range []string{"firstName", "lastName", "email"} {
		if _, ok := f.fields[never]; ok {
			t.Errorf("the form posts %q, which nothing writes", never)
		}
	}
}

// A read that fails says "Not set" rather than leaving the account block blank.
func TestAFailedIdentityReadSaysNotSet(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("client")
	has(t, hn.signedIn().get("/account/personal"), "Not set")
}

// ADVANCE IS OMITTED, which is what takes the write and leaves the onboarding cursor alone.
func TestSavingTakesTheWriteWithoutMovingTheWizard(t *testing.T) {
	hn := newHarness(t)
	seedPersonal(hn)
	c := hn.signedIn()
	f := readForm(t, c.get("/account/personal").Body.String(), "personal-form")
	f.fields.Set("phone", "(305) 555-0184")
	rec := c.click(f, f.submits[0])
	where(t, rec, http.StatusSeeOther, "/account")

	sent := hn.f.one(t, "POST /functions/v1/onboarding-profile").Body
	if sent["phone"] != "+13055550184" {
		t.Errorf("phone = %v", sent["phone"])
	}
	if advance, ok := sent["advance"]; ok && advance == true {
		t.Error("advance went with it; 2.5.2 must not move the onboarding cursor")
	}
}

// Enter in any of the thirteen fields saves, rather than re-rendering: the first submit in
// the markup is "Update the labels for this country", exactly as it was on 2.1.10 before
// #225 fixed it. The same hidden default button guards this screen.
func TestEnterOnPersonalSaves(t *testing.T) {
	hn := newHarness(t)
	seedPersonal(hn)
	c := hn.signedIn()
	f := readForm(t, c.get("/account/personal").Body.String(), "personal-form")
	if got := f.submits[0].value; got != "save" {
		t.Fatalf("the default button is %q, so Enter does not save", got)
	}
	where(t, c.click(f, f.submits[0]), http.StatusSeeOther, "/account")
}

// A refusal comes back with what they typed, raw: showing somebody +13055550184 after they
// typed (305) 555-0184 and got a different field wrong would be its own small insult.
func TestARefusedSaveKeepsTheRawValues(t *testing.T) {
	hn := newHarness(t)
	seedPersonal(hn)
	rec := hn.signedIn().post("/account/personal", url.Values{
		"phone":       {"(305) 555-0184"},
		"dateOfBirth": {"3024-01-01"},
	})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("= %d", rec.Code)
	}
	has(t, rec, esc("(305) 555-0184"), `value="3024-01-01"`)
}
