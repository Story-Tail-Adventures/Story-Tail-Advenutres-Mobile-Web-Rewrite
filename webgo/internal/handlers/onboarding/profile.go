package onboarding

import (
	"net/http"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.10 Profile Completion (web/app/(onboarding)/onboarding/profile).

var profileSpec = page.Spec{
	File:    "onboarding/profile.html",
	Layout:  shell.Onboarding,
	Slots:   profileSlots(),
	Repeats: chromeRepeats,
}

// profileSlots is everything this page fills. It is a function rather than a literal because
// the two country pickers contribute 249 option slots each, and because a var initialised
// from another var's init() would be copied into Specs before that init() ran.
func profileSlots() []string {
	out := append(chromeSlots(),
		"form-error",
		"phone", "phone-error", "date-of-birth", "date-of-birth-error",
		"address-error", "address-line1", "address-line1-error",
		"address-line2", "address-line2-error", "address-city", "address-city-error",
		"address-region", "address-region-error", "address-region-label",
		"address-postal", "address-postal-error", "address-postal-label",
		"address-country", "address-country-error",
		"emergency-error", "emergency-name", "emergency-name-error",
		"emergency-phone", "emergency-phone-error",
		"emergency-relationship", "emergency-relationship-error",
		"passport-error", "passport-expired",
		"passport-expiry", "passport-expiry-error", "passport-country", "passport-country-error",
	)
	out = append(out, countrySlots(addressCountryPrefix)...)
	return append(out, countrySlots(passportCountryPrefix)...)
}

// The two country pickers' option slots. Every option is in the HTML with its code and name,
// as the agent area's client form does it: an <option> cannot hold a slot inside itself, so
// a repeat cannot build one, and 249 static options with a slot each is what the page
// checker allows. Go only switches `selected`.
const (
	addressCountryPrefix  = "country-"
	passportCountryPrefix = "pcountry-"
)

// countrySlots is every option slot for one picker.
func countrySlots(prefix string) []string {
	out := make([]string, 0, len(validate.Countries))
	for _, c := range validate.Countries {
		out = append(out, prefix+strings.ToLower(c.Code))
	}
	return out
}

// profileFormError is PROFILE_TEXT.formError, the sentence a refusal with no `detail` shows.
// The spec's suggested copy ended with a "message Gyasi" link; there is nowhere to link to
// from here, and the skip below is a real exit, so the copy points at that instead.
const profileFormError = "That didn't save — nothing's lost. Give it another try, or skip " +
	"for now and we'll pick this up later."

var profileStep = stepIndex("profile")

func (a *area) mountProfile(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(profileSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, status int, f validate.ProfileForm, errs validate.Errors, formError string) {
		d := tmpl.New()
		fillChrome(d, profileStep, true)

		if formError == "" {
			d.Remove("form-error")
		} else {
			d.Text("form-error", formError)
		}

		country := f.AddressCountry
		if country == "" {
			country = validate.DefaultCountry
		}
		// "State" and "ZIP code" are American; the labels follow the country that is chosen.
		if validate.UsesUsAddressLabels(country) {
			d.Text("address-region-label", "State")
			d.Text("address-postal-label", "ZIP code")
		} else {
			d.Text("address-region-label", "Region")
			d.Text("address-postal-label", "Postal code")
		}

		fillInput(d, "phone", f.Phone, errs.First("phone"), true)
		fillInput(d, "date-of-birth", f.DateOfBirth, errs.First("dateOfBirth"), true)
		d.Attr("date-of-birth", "max", validate.TodayISO(a.now()))

		fillGroupError(d, "address-error", errs.First("address"))
		fillInput(d, "address-line1", f.AddressLine1, errs.First("addressLine1"), false)
		describe(d, "address-line1", errs.First("address"), "address-error")
		fillInput(d, "address-line2", f.AddressLine2, errs.First("addressLine2"), false)
		fillInput(d, "address-city", f.AddressCity, errs.First("addressCity"), false)
		fillInput(d, "address-region", f.AddressRegion, errs.First("addressRegion"), false)
		fillInput(d, "address-postal", f.AddressPostalCode, errs.First("addressPostalCode"), false)
		fillSelect(d, "address-country", addressCountryPrefix, country, errs.First("addressCountry"))

		fillGroupError(d, "emergency-error", errs.First("emergencyContact"))
		fillInput(d, "emergency-name", f.EmergencyName, errs.First("emergencyName"), false)
		describe(d, "emergency-name", errs.First("emergencyContact"), "emergency-error")
		fillInput(d, "emergency-phone", f.EmergencyPhone, errs.First("emergencyPhone"), false)
		fillInput(d, "emergency-relationship", f.EmergencyRelationship, errs.First("emergencyRelationship"), false)

		fillGroupError(d, "passport-error", errs.First("passport"))
		// Shown whenever what is in the box has already lapsed. It never blocks the save —
		// an expired passport is exactly the record we want on file, since it is what makes
		// the renewal reminder fire.
		if validate.IsRealDate(f.PassportExpiry) && f.PassportExpiry < validate.TodayISO(a.now()) {
			d.Keep("passport-expired")
		} else {
			d.Remove("passport-expired")
		}
		fillInput(d, "passport-expiry", f.PassportExpiry, errs.First("passportExpiry"), false)
		describe(d, "passport-expiry", errs.First("passport"), "passport-error")
		fillSelect(d, "passport-country", passportCountryPrefix, f.PassportCountry, errs.First("passportCountry"))

		a.render(w, r, d, status)
	}

	rt.Protected("GET /onboarding/profile", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, http.StatusOK, a.currentProfile(r, st), nil, "")
	}))

	rt.Protected("POST /onboarding/profile", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		slug, route := nextStep(profileStep)

		if form.Get("action") == actionSkip {
			// Nothing is written but the cursor: calling the profile function with an empty
			// body would spend an audit row saying somebody changed nothing.
			a.advance(w, r, st, slug, route)
			return
		}

		// The RAW strings, echoed straight back: showing somebody +13055550184 after they
		// typed (305) 555-0184 and got a different field wrong would be its own small insult.
		f := validate.ProfileForm{
			Phone:                 form.Get("phone"),
			DateOfBirth:           form.Get("dateOfBirth"),
			AddressLine1:          form.Get("addressLine1"),
			AddressLine2:          form.Get("addressLine2"),
			AddressCity:           form.Get("addressCity"),
			AddressRegion:         form.Get("addressRegion"),
			AddressPostalCode:     form.Get("addressPostalCode"),
			AddressCountry:        form.Get("addressCountry"),
			EmergencyName:         form.Get("emergencyName"),
			EmergencyPhone:        form.Get("emergencyPhone"),
			EmergencyRelationship: form.Get("emergencyRelationship"),
			PassportExpiry:        form.Get("passportExpiry"),
			PassportCountry:       form.Get("passportCountry"),
		}

		if form.Get("action") == actionRelabel {
			// The no-JavaScript stand-in for Next's live relabel: the page comes back with
			// everything the traveler has typed and the chosen country's own labels. It
			// validates nothing, because they have not finished filling the form in.
			show(w, r, http.StatusOK, f, nil, "")
			return
		}

		values, errs := validate.ParseProfile(f, a.now())
		if !errs.Empty() {
			show(w, r, http.StatusUnprocessableEntity, f, errs, "")
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, f, nil, profileFormError)
			return
		}

		// An Edge Function and not a PostgREST write because `client` is a sensitive table
		// under CLAUDE.md rule 3 and owes an audit_event on every mutation.
		res := a.call(r.Context(), st, "onboarding-profile", values.Payload(true))
		out := web.FromResult(res, profileFormError)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			// `detail` only ever comes from a 4xx the function built from its own badRequest
			// messages — plain English, and more use than a generic failure.
			show(w, r, out.Status, f, nil, out.Message)
		default:
			web.SeeOther(w, r, route)
		}
	}))
	return nil
}

// actionRelabel re-renders with the chosen country's address labels, saving nothing.
const actionRelabel = "relabel"

// What is already on file, so a wizard resumed on this step shows what is there rather than
// an empty form. Read through the caller's own session and RLS, never the service role:
// client_self_select, address_self_select and travel_document_self_select exist precisely so
// a traveler can read their own record back. The passport NUMBER is not among the columns
// `authenticated` is granted — that grant list is what stops even the ciphertext being
// selectable — which is another reason there is no number field on this screen.
type clientProfileRow struct {
	Phone            *string           `json:"phone"`
	DateOfBirth      *string           `json:"date_of_birth"`
	EmergencyContact *emergencyContact `json:"emergency_contact"`
	MailingAddressID *string           `json:"mailing_address_id"`
}

// emergencyContact is client.emergency_contact, jsonb with no CHECK on its shape. Data-Model
// §6.1 documents {name, phone, relationship} and the function writes exactly that, but a
// column with no constraint is a column that will eventually hold something else, so every
// field is optional here and anything unexpected simply does not decode.
type emergencyContact struct {
	Name         *string `json:"name"`
	Phone        *string `json:"phone"`
	Relationship *string `json:"relationship"`
}

type addressRow struct {
	Line1      *string `json:"line1"`
	Line2      *string `json:"line2"`
	City       *string `json:"city"`
	Region     *string `json:"region"`
	PostalCode *string `json:"postal_code"`
	Country    *string `json:"country"`
}

type passportRow struct {
	ExpiresOn      *string `json:"expires_on"`
	IssuingCountry *string `json:"issuing_country"`
}

func (a *area) currentProfile(r *http.Request, st session.State) validate.ProfileForm {
	f := validate.ProfileForm{AddressCountry: validate.DefaultCountry}
	if a.off {
		return f
	}
	ctx := r.Context()
	client := selectOne[clientProfileRow](ctx, a, st, "client",
		supa.Q().Select("phone,date_of_birth,emergency_contact,mailing_address_id"), "client")
	f.Phone = trimmed(client.Phone)
	f.DateOfBirth = trimmed(client.DateOfBirth)
	if c := client.EmergencyContact; c != nil {
		f.EmergencyName = trimmed(c.Name)
		f.EmergencyPhone = trimmed(c.Phone)
		f.EmergencyRelationship = trimmed(c.Relationship)
	}
	if id := trimmed(client.MailingAddressID); id != "" {
		address := selectOne[addressRow](ctx, a, st, "address",
			supa.Q().Select("line1,line2,city,region,postal_code,country").Eq("id", id), "address")
		f.AddressLine1 = trimmed(address.Line1)
		f.AddressLine2 = trimmed(address.Line2)
		f.AddressCity = trimmed(address.City)
		f.AddressRegion = trimmed(address.Region)
		f.AddressPostalCode = trimmed(address.PostalCode)
		if c := trimmed(address.Country); c != "" {
			f.AddressCountry = c
		}
	}
	passport := selectOne[passportRow](ctx, a, st, "travel_document",
		supa.Q().Select("expires_on,issuing_country").Eq("kind", "passport").
			Is("companion_id", "null").Is("archived_at", "null"), "passport")
	f.PassportExpiry = trimmed(passport.ExpiresOn)
	f.PassportCountry = trimmed(passport.IssuingCountry)
	return f
}

// fillInput fills one text input: its value, its error line, and the aria wiring that ties
// them together. hint says whether the field has a hint line the input is also described by.
func fillInput(d *page.Doc, slot, value, message string, hint bool) {
	d.Attr(slot, "value", value)
	var ids []string
	if hint {
		ids = append(ids, inputID(slot)+"-hint")
	}
	if message == "" {
		d.Remove(slot + "-error")
	} else {
		d.Text(slot+"-error", message)
		d.Attr(slot, "aria-invalid", "true")
		ids = append(ids, inputID(slot)+"-error")
	}
	if len(ids) > 0 {
		d.Attr(slot, "aria-describedby", strings.Join(ids, " "))
	}
}

// describe threads a GROUP error onto the group's first input, because aria-describedby on a
// <fieldset> is NOT inherited by the controls inside it: assistive technology builds a
// control's description from its own attribute, so a group error attached only to the
// fieldset is never read to somebody who tabs straight into the group.
func describe(d *page.Doc, slot, message, errorID string) {
	if message == "" {
		return
	}
	d.Attr(slot, "aria-describedby", errorID)
}

func fillGroupError(d *page.Doc, slot, message string) {
	if message == "" {
		d.Remove(slot)
		return
	}
	d.Text(slot, message)
}

// fillSelect fills a country picker: every option, with the chosen one selected.
func fillSelect(d *page.Doc, slot, prefix, selected, message string) {
	d.Keep(slot)
	if message != "" {
		d.Attr(slot, "aria-invalid", "true")
		d.Attr(slot, "aria-describedby", inputID(slot)+"-error")
		d.Text(slot+"-error", message)
	} else {
		d.Remove(slot + "-error")
	}
	// An unknown or empty value selects nothing, which leaves the passport picker on its
	// "Pick a country" placeholder and the address picker on its first option, as a browser
	// does with a <select> nobody has touched.
	for _, c := range validate.Countries {
		s := prefix + strings.ToLower(c.Code)
		d.Keep(s)
		d.Bool(s, "selected", c.Code == selected)
	}
}

// inputID is the HTML id for a slot: the camelCase the Next form used, so the <label for>
// and the hint and error ids in the page file keep their names.
func inputID(slot string) string {
	switch slot {
	case "date-of-birth":
		return "dateOfBirth"
	case "address-line1":
		return "addressLine1"
	case "address-line2":
		return "addressLine2"
	case "address-city":
		return "addressCity"
	case "address-region":
		return "addressRegion"
	case "address-postal":
		return "addressPostalCode"
	case "address-country":
		return "addressCountry"
	case "emergency-name":
		return "emergencyName"
	case "emergency-phone":
		return "emergencyPhone"
	case "emergency-relationship":
		return "emergencyRelationship"
	case "passport-expiry":
		return "passportExpiry"
	case "passport-country":
		return "passportCountry"
	}
	return slot
}
