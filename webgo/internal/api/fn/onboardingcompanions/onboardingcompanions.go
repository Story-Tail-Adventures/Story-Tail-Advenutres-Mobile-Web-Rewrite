// Package onboardingcompanions ports supabase/functions/onboarding-companions: Screen 2.1.12
// Travel Companions, the write path (client-auth.jsx C2112_Companions). P1.
//
// Add, edit and remove the people a traveler usually travels with. companion grants SELECT
// only to authenticated, so the writes are the service role's.
//
// OWNERSHIP IS RE-CHECKED, NEVER TRUSTED. Edit and remove carry a companion id from the
// caller, and companion.client_id is the only thing scoping a companion into an advisor's
// book (Data-Model §19.1). Every statement carries client_id alongside the id: a service-role
// update matched on id alone would let anybody who guesses a uuid rewrite a stranger's row.
//
// NO PASSPORT NUMBER, for the reason 2.1.10 collects none (§18.2 encryption is not built).
//
// EDIT IS A FULL REPLACE, unlike onboarding-profile: the form shows every field at once, so a
// field arriving empty means the traveler cleared it. A partial body blanks what it omits.
//
// REMOVE ARCHIVES (Data-Model §20.1), and is the same 200 whether the row was theirs, was
// already archived, or never existed: a different answer would confirm a guessed uuid.
//
// AUDITED although rule 3 does not name the table: a companion's details belong to a THIRD
// PARTY who has no account. Field names only, never values.
//
// NO PLATFORM INVITE yet (§2.1.12 lists one): companion has no email column and a
// client-initiated invite would write a new record into an advisor's book. Deferred to P3.
package onboardingcompanions

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/onboarding"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const (
	nameMax         = 80
	relationshipMax = 40
	// maxCompanions is enough for a household; past this an advisor should be adding.
	maxCompanions = 12
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
	ctx := r.Context()
	now := func() string { return js.ISOString(d.Now()) }

	action, err := parseAction(body)
	if err != nil {
		return nil, err
	}
	var id *string
	switch action {
	case "remove":
		target, err := requireID(body)
		if err != nil {
			return nil, err
		}
		if err := removeCompanion(ctx, d.DB, clientID, target, c, now()); err != nil {
			return nil, err
		}
		id = &target
	case "add", "edit":
		saved, err := saveCompanion(ctx, d.DB, clientID, body, action == "edit", c, now)
		if err != nil {
			return nil, err
		}
		id = &saved
	case "none":
	default:
		return nil, problem.BadRequest("action must be add, edit, remove or none.")
	}

	// "Save & continue" with nothing left to add posts action "none": only the cursor moves.
	if body.Get("advance").IsTrue() {
		if err := guard.AdvanceOnboarding(ctx, d.DB, c.PlatformUserID, onboarding.NextStep("companions"), false, now()); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("ok", true, "id", id))
}

// parseAction is `optionalText(body, "action") ?? "add"`: absent, null and "" all mean add.
func parseAction(body js.Value) (string, error) {
	o, err := onboarding.OptionalText(body, "action")
	if err != nil {
		return "", err
	}
	if o.Value == nil {
		return "add", nil
	}
	return *o.Value, nil
}

// requireID is the companion's id, or a 400.
func requireID(body js.Value) (string, error) {
	o, err := onboarding.OptionalText(body, "id")
	if err != nil {
		return "", err
	}
	if o.Value == nil || *o.Value == "" {
		return "", problem.BadRequest("This action needs the companion's id.")
	}
	if !uuid.IsUUID(*o.Value) {
		return "", problem.BadRequest("That is not a companion id.")
	}
	return *o.Value, nil
}

// companionRow is the row parseCompanion builds, in its key order.
type companionRow struct {
	FirstName       string  `json:"first_name"`
	LastName        string  `json:"last_name"`
	Relationship    *string `json:"relationship"`
	DateOfBirth     *string `json:"date_of_birth"`
	PassportExpiry  *string `json:"passport_expiry"`
	PassportCountry *string `json:"passport_country"`
	UpdatedAt       string  `json:"updated_at"`
}

func (r companionRow) object() js.Ordered {
	return js.O(
		"first_name", r.FirstName,
		"last_name", r.LastName,
		"relationship", r.Relationship,
		"date_of_birth", r.DateOfBirth,
		"passport_expiry", r.PassportExpiry,
		"passport_country", r.PassportCountry,
		"updated_at", r.UpdatedAt,
	)
}

// rowFields is Object.keys(row).sort().
var rowFields = func() []string {
	keys := []string{}
	for _, f := range (companionRow{}).object() {
		keys = append(keys, f.Key)
	}
	sort.Strings(keys)
	return keys
}()

func parseCompanion(body js.Value, now string) (companionRow, error) {
	first, err := onboarding.OptionalText(body, "firstName")
	if err != nil {
		return companionRow{}, err
	}
	last, err := onboarding.OptionalText(body, "lastName")
	if err != nil {
		return companionRow{}, err
	}
	// NOT NULL in the DDL; an all-whitespace name would otherwise be a constraint violation
	// the caller cannot read.
	if first.Value == nil || last.Value == nil {
		return companionRow{}, problem.BadRequest("A companion needs a first and a last name.")
	}
	if js.Len(*first.Value) > nameMax || js.Len(*last.Value) > nameMax {
		return companionRow{}, problem.BadRequest("A name is at most " + strconv.Itoa(nameMax) + " characters.")
	}
	relationship, err := onboarding.OptionalText(body, "relationship")
	if err != nil {
		return companionRow{}, err
	}
	if relationship.Value != nil && js.Len(*relationship.Value) > relationshipMax {
		return companionRow{}, problem.BadRequest("A relationship is at most " + strconv.Itoa(relationshipMax) + " characters.")
	}
	// Refused loudly rather than dropped: a caller that sends a number needs to know it was
	// not stored.
	if body.Has("passportNumber") {
		return companionRow{}, problem.BadRequest(
			"Passport numbers are not accepted yet \U00002014 send only passportExpiry and passportCountry.")
	}
	dob, err := onboarding.OptionalDate(body, "dateOfBirth")
	if err != nil {
		return companionRow{}, err
	}
	expiry, err := onboarding.OptionalDate(body, "passportExpiry")
	if err != nil {
		return companionRow{}, err
	}
	country, err := onboarding.OptionalCountry(body, "passportCountry")
	if err != nil {
		return companionRow{}, err
	}
	return companionRow{
		FirstName:       *first.Value,
		LastName:        *last.Value,
		Relationship:    relationship.Value,
		DateOfBirth:     dob.Value,
		PassportExpiry:  expiry.Value,
		PassportCountry: country.Value,
		UpdatedAt:       now,
	}, nil
}

func saveCompanion(ctx context.Context, db *service.Client, clientID string, body js.Value, editing bool, c *caller.Context, now func() string) (string, error) {
	row, err := parseCompanion(body, now())
	if err != nil {
		return "", err
	}
	// The id exists before the audit wrapper does, because the audit row names it.
	var id string
	event := "companion.created"
	if editing {
		if id, err = requireID(body); err != nil {
			return "", err
		}
		event = "companion.updated"
	} else {
		id = uuid.New()
	}

	_, err = audit.With(ctx, db, c, audit.Spec{
		EventType:    event,
		TargetEntity: "companion",
		TargetID:     id,
		Metadata:     js.O("source", "onboarding-companions", "fields", rowFields),
	}, func() (struct{}, error) {
		if editing {
			// client_id in the predicate, not just id: the only thing between a guessed uuid
			// and somebody else's traveler record.
			var updated []struct {
				ID string `json:"id"`
			}
			if err := db.From("companion").Eq("id", id).Eq("client_id", clientID).Is("archived_at", nil).
				Select("id").Update(ctx, row.object(), &updated); err != nil {
				return struct{}{}, fmt.Errorf("companion update failed: %w", err)
			}
			// The same answer for somebody else's row and no row: telling them apart would
			// confirm a guessed uuid is real.
			if len(updated) == 0 {
				return struct{}{}, problem.NotFound("That companion is not on your list.")
			}
			return struct{}{}, nil
		}

		// Advisory: the companion_cap trigger is what makes the limit true (two tabs can
		// both read eleven). This turns it into a sentence instead of a constraint error.
		n, err := db.From("companion").Select("id").Eq("client_id", clientID).Is("archived_at", nil).Count(ctx)
		if err != nil {
			return struct{}{}, fmt.Errorf("companion count failed: %w", err)
		}
		if n >= maxCompanions {
			return struct{}{}, problem.BadRequest("That is as many companions as we can hold \U00002014 up to " + strconv.Itoa(maxCompanions) + ".")
		}
		// Minted here, not taken from the caller: a form post has no offline concern.
		ins := js.O("id", id, "client_id", clientID).Spread(row.object())
		if err := db.From("companion").Insert(ctx, ins, nil); err != nil {
			return struct{}{}, fmt.Errorf("companion insert failed: %w", err)
		}
		return struct{}{}, nil
	})
	if err != nil {
		return "", err
	}
	return id, nil
}

// removeCompanion archives; idempotent and the same 200 whatever the id named.
func removeCompanion(ctx context.Context, db *service.Client, clientID, id string, c *caller.Context, now string) error {
	_, err := audit.With(ctx, db, c, audit.Spec{
		EventType:    "companion.archived",
		TargetEntity: "companion",
		TargetID:     id,
		Metadata:     js.O("source", "onboarding-companions"),
	}, func() (struct{}, error) {
		if err := db.From("companion").Eq("id", id).Eq("client_id", clientID).Is("archived_at", nil).
			Update(ctx, js.O("archived_at", now), nil); err != nil {
			return struct{}{}, fmt.Errorf("companion archive failed: %w", err)
		}
		return struct{}{}, nil
	})
	return err
}
