// Package profileform renders the traveler's profile fields.
//
// IT IS SHARED BY TWO SCREENS, which is the whole reason it exists: 2.1.10 asks for these
// fields inside the onboarding wizard and 2.5.2 asks for the same ones from the account,
// over the same validation and the same Edge Function. In Next those two routes import one
// another's form component and server action; here they fill the same slot names through
// this package, so a field cannot be added to one and forgotten on the other.
//
// It knows nothing about either area's chrome — the wizard's rail and the account's header
// stay with their own pages.
package profileform

import (
	"context"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
)

// The two country pickers' option slots. Every option is in the HTML with its code and
// name: an <option> cannot hold a slot inside itself, so a repeat cannot build one, and 249
// static options with a slot each is what the page checker allows. Go only switches
// `selected`.
const (
	AddressCountryPrefix  = "country-"
	PassportCountryPrefix = "pcountry-"
)

// Slots is every slot the fields contribute, without either page's chrome.
func Slots() []string {
	out := []string{
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
	}
	out = append(out, CountrySlots(AddressCountryPrefix)...)
	return append(out, CountrySlots(PassportCountryPrefix)...)
}

// CountrySlots is every option slot for one picker.
func CountrySlots(prefix string) []string {
	out := make([]string, 0, len(validate.Countries))
	for _, c := range validate.Countries {
		out = append(out, prefix+strings.ToLower(c.Code))
	}
	return out
}

// Fill draws every field, with what was typed and whatever was refused about it. now is the
// clock the birthday cap and the expired-passport note are judged against.
func Fill(d *page.Doc, f validate.ProfileForm, errs validate.Errors, now time.Time) {
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

	FillInput(d, "phone", f.Phone, errs.First("phone"), true)
	FillInput(d, "date-of-birth", f.DateOfBirth, errs.First("dateOfBirth"), true)
	d.Attr("date-of-birth", "max", validate.TodayISO(now))

	FillGroupError(d, "address-error", errs.First("address"))
	FillInput(d, "address-line1", f.AddressLine1, errs.First("addressLine1"), false)
	Describe(d, "address-line1", errs.First("address"), "address-error")
	FillInput(d, "address-line2", f.AddressLine2, errs.First("addressLine2"), false)
	FillInput(d, "address-city", f.AddressCity, errs.First("addressCity"), false)
	FillInput(d, "address-region", f.AddressRegion, errs.First("addressRegion"), false)
	FillInput(d, "address-postal", f.AddressPostalCode, errs.First("addressPostalCode"), false)
	FillSelect(d, "address-country", AddressCountryPrefix, country, errs.First("addressCountry"))

	FillGroupError(d, "emergency-error", errs.First("emergencyContact"))
	FillInput(d, "emergency-name", f.EmergencyName, errs.First("emergencyName"), false)
	Describe(d, "emergency-name", errs.First("emergencyContact"), "emergency-error")
	FillInput(d, "emergency-phone", f.EmergencyPhone, errs.First("emergencyPhone"), false)
	FillInput(d, "emergency-relationship", f.EmergencyRelationship, errs.First("emergencyRelationship"), false)

	FillGroupError(d, "passport-error", errs.First("passport"))
	// Shown whenever what is in the box has already lapsed. It never blocks the save — an
	// expired passport is exactly the record we want on file, since it is what makes the
	// renewal reminder fire.
	if validate.IsRealDate(f.PassportExpiry) && f.PassportExpiry < validate.TodayISO(now) {
		d.Keep("passport-expired")
	} else {
		d.Remove("passport-expired")
	}
	FillInput(d, "passport-expiry", f.PassportExpiry, errs.First("passportExpiry"), false)
	Describe(d, "passport-expiry", errs.First("passport"), "passport-error")
	FillSelect(d, "passport-country", PassportCountryPrefix, f.PassportCountry, errs.First("passportCountry"))
}

func FillInput(d *page.Doc, slot, value, message string, hint bool) {
	d.Attr(slot, "value", value)
	var ids []string
	if hint {
		ids = append(ids, InputID(slot)+"-hint")
	}
	if message == "" {
		d.Remove(slot + "-error")
	} else {
		d.Text(slot+"-error", message)
		d.Attr(slot, "aria-invalid", "true")
		ids = append(ids, InputID(slot)+"-error")
	}
	if len(ids) > 0 {
		d.Attr(slot, "aria-describedby", strings.Join(ids, " "))
	}
}

// describe threads a GROUP error onto the group's first input, because aria-describedby on a
// <fieldset> is NOT inherited by the controls inside it: assistive technology builds a
// control's description from its own attribute, so a group error attached only to the
// fieldset is never read to somebody who tabs straight into the group.
func Describe(d *page.Doc, slot, message, errorID string) {
	if message == "" {
		return
	}
	d.Attr(slot, "aria-describedby", errorID)
}

func FillGroupError(d *page.Doc, slot, message string) {
	if message == "" {
		d.Remove(slot)
		return
	}
	d.Text(slot, message)
}

// fillSelect fills a country picker: every option, with the chosen one selected.
func FillSelect(d *page.Doc, slot, prefix, selected, message string) {
	d.Keep(slot)
	if message != "" {
		d.Attr(slot, "aria-invalid", "true")
		d.Attr(slot, "aria-describedby", InputID(slot)+"-error")
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
func InputID(slot string) string {
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

// Read is the posted form, RAW. Showing somebody +13055550184 after they typed
// (305) 555-0184 and got a different field wrong would be its own small insult.
func Read(form url.Values) validate.ProfileForm {
	return validate.ProfileForm{
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
}

// The rows behind the fields. EVERY field is optional and anything unexpected simply does
// not decode: emergency_contact is a jsonb column with no constraint, and a column with no
// constraint is one that will eventually hold something else.
type clientProfileRow struct {
	Phone            *string           `json:"phone"`
	DateOfBirth      *string           `json:"date_of_birth"`
	EmergencyContact *emergencyContact `json:"emergency_contact"`
	MailingAddressID *string           `json:"mailing_address_id"`
}

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

// Load reads what is on file. A read that fails leaves its fields empty rather than failing
// the page: an empty box somebody can fill is better than a screen they cannot reach.
func Load(ctx context.Context, c *supa.Client, token string, log *slog.Logger) validate.ProfileForm {
	f := validate.ProfileForm{AddressCountry: validate.DefaultCountry}
	one := func(table string, q supa.Query, out any) {
		switch v := out.(type) {
		case *clientProfileRow:
			row, found, err := supa.MaybeOne[clientProfileRow](ctx, c, token, table, q)
			if err != nil {
				log.Warn("profileform: read failed", "table", table, "err", err)
			} else if found {
				*v = row
			}
		case *addressRow:
			row, found, err := supa.MaybeOne[addressRow](ctx, c, token, table, q)
			if err != nil {
				log.Warn("profileform: read failed", "table", table, "err", err)
			} else if found {
				*v = row
			}
		case *passportRow:
			row, found, err := supa.MaybeOne[passportRow](ctx, c, token, table, q)
			if err != nil {
				log.Warn("profileform: read failed", "table", table, "err", err)
			} else if found {
				*v = row
			}
		}
	}

	var client clientProfileRow
	one("client", supa.Q().Select("phone,date_of_birth,emergency_contact,mailing_address_id"), &client)
	f.Phone = trimmed(client.Phone)
	f.DateOfBirth = trimmed(client.DateOfBirth)
	if e := client.EmergencyContact; e != nil {
		f.EmergencyName = trimmed(e.Name)
		f.EmergencyPhone = trimmed(e.Phone)
		f.EmergencyRelationship = trimmed(e.Relationship)
	}
	if id := trimmed(client.MailingAddressID); id != "" {
		var address addressRow
		one("address", supa.Q().Select("line1,line2,city,region,postal_code,country").Eq("id", id), &address)
		f.AddressLine1 = trimmed(address.Line1)
		f.AddressLine2 = trimmed(address.Line2)
		f.AddressCity = trimmed(address.City)
		f.AddressRegion = trimmed(address.Region)
		f.AddressPostalCode = trimmed(address.PostalCode)
		if country := trimmed(address.Country); country != "" {
			f.AddressCountry = country
		}
	}
	var passport passportRow
	one("travel_document", supa.Q().Select("expires_on,issuing_country").Eq("kind", "passport").
		Is("companion_id", "null").Is("archived_at", "null"), &passport)
	f.PassportExpiry = trimmed(passport.ExpiresOn)
	f.PassportCountry = trimmed(passport.IssuingCountry)
	return f
}

func trimmed(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}
