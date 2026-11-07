// Package onboardingprofile ports supabase/functions/onboarding-profile: Screen 2.1.10
// Profile Completion, the write path (Screen Inventory §2.1.10, client-auth.jsx
// C2110_ProfileCompletion). P1.
//
// WHY A FUNCTION AND NOT A CLIENT WRITE. `client` is a rule-3 sensitive table: every
// mutation owes an audit_event. It also has SELECT-only RLS, so a browser update would match
// zero rows and report success. The same is true of `address` and `travel_document`. So the
// write runs as the service role, scoped by onboarding.RequireClientID, never by an id from
// the body (that would be an IDOR with a friendly name).
//
// WHAT IT DELIBERATELY DOES NOT TAKE: the passport NUMBER. Data-Model §18.2 wants it
// column-encrypted under a backend-only key, and nothing implements that yet. Expiry and
// issuing country drive the reminders, so those are collected; a number is refused loudly.
package onboardingprofile

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/onboarding"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	clientID, err := onboarding.RequireClientID(c)
	if err != nil {
		return nil, err
	}
	body, err := edge.ReadObject(r, edge.ExpectedJSONObject)
	if err != nil {
		return nil, err
	}
	req, err := parse(body)
	if err != nil {
		return nil, err
	}
	ctx := r.Context()
	now := func() string { return js.ISOString(d.Now()) }

	// The whole screen is optional. "Skip for now" posts {} and still has to advance.
	patch := js.O("updated_at", now())
	if req.phone.Set {
		patch = patch.Set("phone", req.phone.JS())
	}
	if req.dateOfBirth.Set {
		patch = patch.Set("date_of_birth", req.dateOfBirth.JS())
	}
	if req.emergencySet {
		var v any // null clears it
		if req.emergency != nil {
			v = req.emergency
		}
		patch = patch.Set("emergency_contact", v)
	}
	if req.addressSet {
		id, err := saveAddress(ctx, d.DB, clientID, req.address, now)
		if err != nil {
			return nil, err
		}
		patch = patch.Set("mailing_address_id", id)
	}

	// The KEYS, never the values: a copy of somebody's date of birth in a table kept seven
	// years is a second place PII lives.
	_, err = audit.With(ctx, d.DB, c, audit.Spec{
		EventType:    "client.updated",
		TargetEntity: "client",
		TargetID:     clientID,
		Metadata:     js.O("source", "onboarding-profile", "fields", sortedKeys(patch)),
	}, func() (struct{}, error) {
		if err := d.DB.From("client").Eq("id", clientID).Update(ctx, patch, nil); err != nil {
			return struct{}{}, fmt.Errorf("client update failed: %w", err)
		}
		return struct{}{}, nil
	})
	if err != nil {
		return nil, err
	}

	if req.passportSet {
		if err := savePassport(ctx, d.DB, clientID, req.passport, now); err != nil {
			return nil, err
		}
	}
	if req.advance {
		if err := guard.AdvanceOnboarding(ctx, d.DB, c.PlatformUserID, onboarding.NextStep("profile"), false, now()); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("ok", true))
}

// sortedKeys is Object.keys(patch).sort(): the keys are ASCII, so byte order is UTF-16 order.
func sortedKeys(o js.Ordered) []string {
	keys := make([]string, 0, len(o))
	for _, f := range o {
		keys = append(keys, f.Key)
	}
	sort.Strings(keys)
	return keys
}

// ---- the request ----

// emergencyContact is the jsonb {name, phone, relationship} of Data-Model §6.1.
type emergencyContact struct {
	Name         string  `json:"name"`
	Phone        string  `json:"phone"`
	Relationship *string `json:"relationship"`
}

type addressInput struct {
	Line1, City, Country      string
	Line2, Region, PostalCode *string
}

type passportInput struct {
	ExpiresOn, IssuingCountry *string
}

// request is the parsed body. For the three objects, set false is an absent key (leave it
// alone) and set with a nil pointer is null (clear it).
type request struct {
	phone, dateOfBirth onboarding.Optional
	emergencySet       bool
	emergency          *emergencyContact
	addressSet         bool
	address            *addressInput
	passportSet        bool
	passport           *passportInput
	advance            bool
}

// parse validates every field before anything is written, in the Deno order: phone, date
// of birth, emergency contact, address, passport.
func parse(body js.Value) (request, error) {
	var req request
	var err error
	if req.phone, err = onboarding.OptionalPhone(body, "phone", "phone"); err != nil {
		return request{}, err
	}
	if req.dateOfBirth, err = onboarding.OptionalDate(body, "dateOfBirth"); err != nil {
		return request{}, err
	}
	if req.emergencySet, req.emergency, err = parseEmergencyContact(body); err != nil {
		return request{}, err
	}
	if req.addressSet, req.address, err = parseAddress(body); err != nil {
		return request{}, err
	}
	if req.passportSet, req.passport, err = parsePassport(body); err != nil {
		return request{}, err
	}
	req.advance = body.Get("advance").IsTrue()
	return req, nil
}

// parseEmergencyContact is all or nothing: a name with no number looks like somebody can be
// reached when they cannot.
func parseEmergencyContact(body js.Value) (bool, *emergencyContact, error) {
	if !body.Has("emergencyContact") {
		return false, nil, nil
	}
	v := body.Get("emergencyContact")
	if v.IsNull() {
		return true, nil, nil
	}
	if !v.IsPlainObject() {
		return false, nil, problem.BadRequest("emergencyContact must be an object or null.")
	}
	name, err := onboarding.OptionalText(v, "name")
	if err != nil {
		return false, nil, err
	}
	phone, err := onboarding.OptionalPhone(v, "phone", "The emergency contact's phone")
	if err != nil {
		return false, nil, err
	}
	relationship, err := onboarding.OptionalText(v, "relationship")
	if err != nil {
		return false, nil, err
	}
	if name.Value == nil && phone.Value == nil && relationship.Value == nil {
		return true, nil, nil
	}
	if name.Value == nil || phone.Value == nil {
		return false, nil, problem.BadRequest("An emergency contact needs both a name and a phone number.")
	}
	return true, &emergencyContact{Name: *name.Value, Phone: *phone.Value, Relationship: relationship.Value}, nil
}

// parseAddress: line1, city and country are NOT NULL in the schema, so they come together.
func parseAddress(body js.Value) (bool, *addressInput, error) {
	if !body.Has("address") {
		return false, nil, nil
	}
	v := body.Get("address")
	if v.IsNull() {
		return true, nil, nil
	}
	if !v.IsPlainObject() {
		return false, nil, problem.BadRequest("address must be an object or null.")
	}
	var vals [6]onboarding.Optional
	readers := []func() (onboarding.Optional, error){
		func() (onboarding.Optional, error) { return onboarding.OptionalText(v, "line1") },
		func() (onboarding.Optional, error) { return onboarding.OptionalText(v, "city") },
		func() (onboarding.Optional, error) { return onboarding.OptionalCountry(v, "country") },
		func() (onboarding.Optional, error) { return onboarding.OptionalText(v, "line2") },
		func() (onboarding.Optional, error) { return onboarding.OptionalText(v, "region") },
		func() (onboarding.Optional, error) { return onboarding.OptionalText(v, "postalCode") },
	}
	anything := false
	for i, read := range readers {
		o, err := read()
		if err != nil {
			return false, nil, err
		}
		vals[i] = o
		anything = anything || o.Value != nil
	}
	if !anything {
		return true, nil, nil
	}
	line1, city, country := vals[0].Value, vals[1].Value, vals[2].Value
	if line1 == nil || city == nil || country == nil {
		return false, nil, problem.BadRequest("An address needs a street, a city and a country.")
	}
	return true, &addressInput{Line1: *line1, City: *city, Country: *country,
		Line2: vals[3].Value, Region: vals[4].Value, PostalCode: vals[5].Value}, nil
}

func parsePassport(body js.Value) (bool, *passportInput, error) {
	if !body.Has("passport") {
		return false, nil, nil
	}
	v := body.Get("passport")
	if v.IsNull() {
		return true, nil, nil
	}
	if !v.IsPlainObject() {
		return false, nil, problem.BadRequest("passport must be an object or null.")
	}
	// Refused loudly rather than ignored: a caller that sends a number needs to know it
	// was not stored.
	if v.Has("number") {
		return false, nil, problem.BadRequest(
			"Passport numbers are not accepted yet \U00002014 send only expiresOn and issuingCountry.")
	}
	expiresOn, err := onboarding.OptionalDate(v, "expiresOn")
	if err != nil {
		return false, nil, err
	}
	country, err := onboarding.OptionalCountry(v, "issuingCountry")
	if err != nil {
		return false, nil, err
	}
	if expiresOn.Value == nil && country.Value == nil {
		return true, nil, nil
	}
	return true, &passportInput{ExpiresOn: expiresOn.Value, IssuingCountry: country.Value}, nil
}

// ---- the writes ----

func dbCode(err error) string {
	var se *service.Error
	if errors.As(err, &se) {
		return se.Code
	}
	return ""
}

// saveAddress updates the address already linked, or creates one; it returns the id for
// client.mailing_address_id, or nil when clearing.
func saveAddress(ctx context.Context, db *service.Client, clientID string, a *addressInput, now func() string) (*string, error) {
	var client struct {
		MailingAddressID *string `json:"mailing_address_id"`
	}
	if err := db.From("client").Select("mailing_address_id").Eq("id", clientID).Single(ctx, &client); err != nil {
		return nil, fmt.Errorf("client read failed: %w", err)
	}
	existing := client.MailingAddressID
	if existing != nil && *existing == "" {
		existing = nil
	}

	if a == nil {
		// Unlink, then remove the row: an address nobody can reach through the app still
		// holds where somebody lives (§18.5). If something else references it now, keep it.
		if existing != nil {
			// The Deno function did not check this update's error either.
			_ = db.From("client").Eq("id", clientID).Update(ctx, js.O("mailing_address_id", nil), nil)
			if err := db.From("address").Eq("id", *existing).Delete(ctx, nil); err != nil && dbCode(err) != "23503" {
				return nil, fmt.Errorf("address delete failed: %w", err)
			}
		}
		return nil, nil
	}

	row := js.O(
		"line1", a.Line1,
		"line2", a.Line2,
		"city", a.City,
		"region", a.Region,
		"postal_code", a.PostalCode,
		"country", a.Country,
		"updated_at", now(),
	)
	if existing != nil {
		if err := db.From("address").Eq("id", *existing).Update(ctx, row, nil); err != nil {
			return nil, fmt.Errorf("address update failed: %w", err)
		}
		return existing, nil
	}
	id := uuid.New()
	if err := db.From("address").Insert(ctx, js.O("id", id).Spread(row), nil); err != nil {
		return nil, fmt.Errorf("address insert failed: %w", err)
	}
	return &id, nil
}

// savePassport writes the traveler's own passport row: kind 'passport' with no
// companion_id. document_id stays null; the scan arrives later from the camera flow.
func savePassport(ctx context.Context, db *service.Client, clientID string, p *passportInput, now func() string) error {
	var existing struct {
		ID string `json:"id"`
	}
	found, err := db.From("travel_document").Select("id").
		Eq("client_id", clientID).Eq("kind", "passport").Is("companion_id", nil).Is("archived_at", nil).
		MaybeSingle(ctx, &existing)
	if err != nil {
		return fmt.Errorf("travel_document read failed: %w", err)
	}

	if p == nil {
		// Archived rather than deleted: a travel document is on the §20.1 soft-delete list.
		if found {
			if err := db.From("travel_document").Eq("id", existing.ID).Update(ctx, js.O("archived_at", now()), nil); err != nil {
				return fmt.Errorf("travel_document archive failed: %w", err)
			}
		}
		return nil
	}

	row := js.O("expires_on", p.ExpiresOn, "issuing_country", p.IssuingCountry, "updated_at", now())
	if found {
		if err := db.From("travel_document").Eq("id", existing.ID).Update(ctx, row, nil); err != nil {
			return fmt.Errorf("travel_document update failed: %w", err)
		}
		return nil
	}
	ins := js.O("id", uuid.New(), "client_id", clientID, "kind", "passport").Spread(row)
	if err := db.From("travel_document").Insert(ctx, ins, nil); err != nil {
		return fmt.Errorf("travel_document insert failed: %w", err)
	}
	return nil
}
