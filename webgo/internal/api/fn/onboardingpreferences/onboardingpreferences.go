// Package onboardingpreferences ports supabase/functions/onboarding-preferences: Screen
// 2.1.11 Travel Preferences, the write path (client-auth.jsx C2111_PreferencesCapture). P1.
//
// One row, travel_preference, 1:1 with client. The table grants SELECT only to
// authenticated, so the write is the service role's, scoped by RequireClientID.
//
// WHY NOT AN UPSERT. client_id is UNIQUE, so upsert onConflict client_id looks right and is a
// trap: PostgREST sets every column in the payload from EXCLUDED, and the payload must carry
// id (no DEFAULT), so it rewrites the existing row's primary key on every save. Read the id,
// then insert or update.
//
// AUDITED although rule 3 does not name the table: Data-Model §6.2 marks the dietary and
// accessibility columns Sensitive PII and §20.3 asks for a row on every write to a tracked
// table. Field NAMES only, never contents: audit_event is append-only, kept seven years and
// exempt from erasure.
package onboardingpreferences

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"

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

// The closed vocabularies, matching the CHECK constraints in
// 20260904124903_travel_preference_vocabulary.sql. The database refuses a typo; these turn
// that into a 400 a caller can read instead of a 500 nobody can act on.
var (
	travelStyles  = []string{"resort", "cruise", "adventure", "family", "romantic", "group"}
	dietary       = []string{"none", "vegetarian", "pescatarian", "gluten_free", "halal"}
	accessibility = []string{"none", "mobility", "quiet_room", "service_animal"}
	budgetBands   = []string{"budget", "mid", "premium", "luxury"}
)

// Free text a traveler typed, capped where the screen caps it.
const (
	notesMax        = 500
	favoritesMax    = 1000
	maxLoyaltyRows  = 10
	programNameMax  = 60
	destinationsMax = 12
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
	patch, err := parse(body)
	if err != nil {
		return nil, err
	}
	// No updated_at trigger exists, and the DEFAULT fires on INSERT only, so an UPDATE that
	// omits it leaves 2.5.3's "last updated" wrong forever.
	patch = patch.Set("updated_at", js.ISOString(d.Now()))

	ctx := r.Context()
	rowID, err := savePreferences(ctx, d.DB, clientID, patch, c)
	if err != nil {
		return nil, err
	}
	if body.Get("advance").IsTrue() {
		if err := guard.AdvanceOnboarding(ctx, d.DB, c.PlatformUserID, onboarding.NextStep("preferences"), false, js.ISOString(d.Now())); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("ok", true, "id", rowID))
}

// loyaltyProgram is one row of loyalty_programs, Data-Model §6.2's {program, number, tier}.
// tier is in the documented shape and collected by neither artboard: written null, not
// omitted.
type loyaltyProgram struct {
	Program string  `json:"program"`
	Number  *string `json:"number"`
	Tier    *string `json:"tier"`
}

// parse is the request as the patch the Deno function built, in its key order. Every key is
// optional and absent means "leave it alone"; "Skip for now" posts {} and still advances.
func parse(body js.Value) (js.Ordered, error) {
	patch := js.O()

	destinations, set, err := onboarding.OptionalTags(body, "destinations", destinationsMax, onboarding.DefaultMaxTagLength)
	if err != nil {
		return nil, err
	}
	if set {
		patch = patch.Set("preferred_destinations", destinations)
	}

	styles, set, err := onboarding.OptionalTags(body, "travelStyles", len(travelStyles), onboarding.DefaultMaxTagLength)
	if err != nil {
		return nil, err
	}
	if set {
		if err := closedVocabulary(styles, travelStyles, "travelStyles"); err != nil {
			return nil, err
		}
		patch = patch.Set("travel_styles", styles)
	}

	var dietaryValues, accessibilityValues []string
	diet, dietSet, err := onboarding.OptionalTags(body, "dietary", len(dietary), onboarding.DefaultMaxTagLength)
	if err != nil {
		return nil, err
	}
	if dietSet {
		if err := closedVocabulary(diet, dietary, "dietary"); err != nil {
			return nil, err
		}
		if err := sentinelAlone(diet, "dietary"); err != nil {
			return nil, err
		}
		dietaryValues = diet
		patch = patch.Set("dietary_restrictions", diet)
	}

	access, accessSet, err := onboarding.OptionalTags(body, "accessibility", len(accessibility), onboarding.DefaultMaxTagLength)
	if err != nil {
		return nil, err
	}
	if accessSet {
		if err := closedVocabulary(access, accessibility, "accessibility"); err != nil {
			return nil, err
		}
		if err := sentinelAlone(access, "accessibility"); err != nil {
			return nil, err
		}
		accessibilityValues = access
		patch = patch.Set("accessibility_needs", access)
	}

	dietaryNotes, err := boundedText(body, "dietaryNotes", notesMax)
	if err != nil {
		return nil, err
	}
	if dietaryNotes.Set {
		patch = patch.Set("dietary_notes", dietaryNotes.JS())
	}
	accessibilityNotes, err := boundedText(body, "accessibilityNotes", notesMax)
	if err != nil {
		return nil, err
	}
	if accessibilityNotes.Set {
		patch = patch.Set("accessibility_notes", accessibilityNotes.JS())
	}

	// "No restrictions" plus "severe shellfish allergy" is what a well-meaning traveler
	// produces by ticking the reassuring chip and typing the truth under it.
	if err := noNoteBesideSentinel(dietSet, dietaryValues, dietaryNotes, "dietary"); err != nil {
		return nil, err
	}
	if err := noNoteBesideSentinel(accessSet, accessibilityValues, accessibilityNotes, "accessibility"); err != nil {
		return nil, err
	}

	favorites, err := boundedText(body, "favoritePastTrips", favoritesMax)
	if err != nil {
		return nil, err
	}
	if favorites.Set {
		patch = patch.Set("favorite_past_trips", favorites.JS())
	}

	budget, err := parseBudgetBand(body)
	if err != nil {
		return nil, err
	}
	if budget.Set {
		patch = patch.Set("budget_band", budget.JS())
	}

	loyalty, loyaltySet, err := parseLoyalty(body)
	if err != nil {
		return nil, err
	}
	if loyaltySet {
		patch = patch.Set("loyalty_programs", loyalty)
	}
	return patch, nil
}

// closedVocabulary: every entry must be allowed, or a 400 naming the field and not echoing
// the value.
func closedVocabulary(values, allowed []string, key string) error {
	for _, v := range values {
		if !slices.Contains(allowed, v) {
			return problem.BadRequest(key + " accepts only: " + strings.Join(allowed, ", ") + ".")
		}
	}
	return nil
}

// sentinelAlone: "none" cannot travel with a real answer. A CHECK enforces it too, but a
// constraint violation reaches the caller as a 500 with no detail.
func sentinelAlone(values []string, key string) error {
	if slices.Contains(values, "none") && len(values) > 1 {
		return problem.BadRequest(key + ` cannot be "none" and something else at the same time.`)
	}
	return nil
}

// noNoteBesideSentinel checks only when BOTH keys are in this request: a patch setting only
// the array cannot see the stored note, and refusing on a guess would block exactly the
// correction that row needs. The CHECK catches the rest.
func noNoteBesideSentinel(valuesSet bool, values []string, note onboarding.Optional, key string) error {
	if !valuesSet || !note.Set {
		return nil
	}
	if slices.Contains(values, "none") && note.Value != nil {
		return problem.BadRequest(key + ` cannot be "none" and carry a note at the same time ` + "\U00002014" + ` the note is the answer.`)
	}
	return nil
}

// boundedText is trimmed free text with a ceiling (UTF-16 units, as .length counted); ""
// clears, an absent key leaves it alone.
func boundedText(body js.Value, key string, max int) (onboarding.Optional, error) {
	o, err := onboarding.OptionalText(body, key)
	if err != nil || o.Value == nil {
		return o, err
	}
	if js.Len(*o.Value) > max {
		return onboarding.Optional{}, problem.BadRequest(key + " is longer than " + strconv.Itoa(max) + " characters.")
	}
	return o, nil
}

func parseBudgetBand(body js.Value) (onboarding.Optional, error) {
	o, err := onboarding.OptionalText(body, "budgetBand")
	if err != nil || o.Value == nil {
		return o, err
	}
	if !slices.Contains(budgetBands, *o.Value) {
		return onboarding.Optional{}, problem.BadRequest("budgetBand accepts only: " + strings.Join(budgetBands, ", ") + ".")
	}
	return o, nil
}

var membershipNumber = regexp.MustCompile(`^[A-Za-z0-9-]{1,40}$`)

// parseLoyalty is a repeater, [{program, number, tier}], not the prototype's single string:
// splitting that on "·" and the last space fails on "Marriott Bonvoy 123".
func parseLoyalty(body js.Value) ([]loyaltyProgram, bool, error) {
	if !body.Has("loyalty") {
		return nil, false, nil
	}
	value := body.Get("loyalty")
	if value.IsNull() {
		return []loyaltyProgram{}, true, nil
	}
	entries, ok := value.Array()
	if !ok {
		return nil, false, problem.BadRequest("loyalty must be an array.")
	}
	if len(entries) > maxLoyaltyRows {
		return nil, false, problem.BadRequest("loyalty accepts at most " + strconv.Itoa(maxLoyaltyRows) + " programs.")
	}
	rows := []loyaltyProgram{}
	for _, entry := range entries {
		if !entry.IsPlainObject() {
			return nil, false, problem.BadRequest("Each loyalty entry must be an object.")
		}
		program, err := onboarding.OptionalText(entry, "program")
		if err != nil {
			return nil, false, err
		}
		number, err := onboarding.OptionalText(entry, "number")
		if err != nil {
			return nil, false, err
		}
		// A wholly empty row is the repeater's last blank line, not a mistake.
		if program.Value == nil && number.Value == nil {
			continue
		}
		if program.Value == nil {
			return nil, false, problem.BadRequest("Every loyalty number needs the program it belongs to.")
		}
		if js.Len(*program.Value) > programNameMax {
			return nil, false, problem.BadRequest("That program name is too long.")
		}
		// Membership ids are alphanumeric; anything else is a paste accident, and this is a
		// number somebody will read back to an airline.
		if number.Value != nil && !membershipNumber.MatchString(*number.Value) {
			return nil, false, problem.BadRequest("A membership number is letters, digits and hyphens.")
		}
		rows = append(rows, loyaltyProgram{Program: *program.Value, Number: number.Value})
	}
	return rows, true, nil
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

// savePreferences inserts or updates the one row, with the audit wrapped around whichever it
// is. The read and the write are not locked together, so two devices saving at once race;
// travel_preference has no version column (§20.4), so this is last-write-wins by design.
func savePreferences(ctx context.Context, db *service.Client, clientID string, patch js.Ordered, c *caller.Context) (string, error) {
	var existing struct {
		ID string `json:"id"`
	}
	found, err := db.From("travel_preference").Select("id").Eq("client_id", clientID).MaybeSingle(ctx, &existing)
	if err != nil {
		return "", fmt.Errorf("travel_preference read failed: %w", err)
	}
	id := existing.ID
	event := "travel_preference.updated"
	if !found {
		id = uuid.New()
		event = "travel_preference.created"
	}

	_, err = audit.With(ctx, db, c, audit.Spec{
		EventType:    event,
		TargetEntity: "travel_preference",
		TargetID:     id,
		// Column NAMES only: two of these columns hold allergies and mobility needs.
		Metadata: js.O("source", "onboarding-preferences", "fields", sortedKeys(patch)),
	}, func() (struct{}, error) {
		if found {
			if err := db.From("travel_preference").Eq("id", id).Update(ctx, patch, nil); err != nil {
				return struct{}{}, fmt.Errorf("travel_preference update failed: %w", err)
			}
			return struct{}{}, nil
		}
		row := append(js.O(), patch...).Set("id", id).Set("client_id", clientID)
		err := db.From("travel_preference").Insert(ctx, row, nil)
		if err == nil {
			return struct{}{}, nil
		}
		// 23505: another request created the row between the read and this insert (two tabs
		// on step 3, or a retry after a timeout). Fall through to what the read would have
		// done a moment earlier.
		var se *service.Error
		if !errors.As(err, &se) || se.Code != "23505" {
			return struct{}{}, fmt.Errorf("travel_preference insert failed: %w", err)
		}
		if err := db.From("travel_preference").Eq("client_id", clientID).Update(ctx, patch, nil); err != nil {
			return struct{}{}, fmt.Errorf("travel_preference update failed: %w", err)
		}
		return struct{}{}, nil
	})
	if err != nil {
		return "", err
	}
	return id, nil
}
