// Package agentclient ports supabase/functions/agent-client: create, edit, archive and
// bulk-tag a client. Screens 3.3.9, 3.3.10, 3.3.12 and 3.3.1's bulk tag.
//
// ONE FUNCTION, FOUR OPS, as agent-client-notes is one function with three: each op is the
// same requireUser, requireAgentId, rpc, audit chain differing only in a string.
//
// ONLY `stale` IS A 409. The web's transport carries exactly one typed failure signal, the
// 409, and a caller must never recover a second one from an English sentence. So every other
// answer is a 200 with an `outcome`, which also lets `duplicate_email` carry the EXISTING
// client's id so the form can link to the record the advisor already has.
//
// WHAT GOES IN THE AUDIT ROW. A client is PII and an audit_event is kept seven years, so an
// update audits the NAMES of the fields that moved (agent_update_client returns them), never
// their values. The archive REASON is the exception and is stored on purpose: `client` has
// no column for it, and "why was this archived" is what an audit trail exists to answer. A
// bulk tag owes ONE AUDIT ROW PER CLIENT, all in one insert so they cannot half-land.
package agentclient

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const (
	maxName   = 120
	maxTag    = 40
	maxTags   = 20
	maxNotes  = 4000
	maxReason = 500
	maxDates  = 12
	// agent_bulk_tag_clients refuses more than this too; checked here as well so an
	// oversized request is answered in English rather than as a 500 off a RAISE.
	maxBulk = 100
)

// backend is what the function needs from the service client (*service.Client); the tests
// fake it.
type backend interface {
	RPC(ctx context.Context, fn string, args any, out any) error
	RPCRow(ctx context.Context, fn string, args any, out any) (bool, error)
	audit.Inserter
}

// newID mints the client id on create (v7, Data-Model §21.6); tests replace it.
var newID = uuid.New

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	agentID, err := guard.RequireAgentID(r.Context(), d.DB, c)
	if err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	return handle(r.Context(), d.DB, c, agentID, payload)
}

func handle(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	op, err := requireOp(payload.Get("op"))
	if err != nil {
		return nil, err
	}
	switch op {
	case "create":
		return create(ctx, db, c, agentID, payload)
	case "update":
		return update(ctx, db, c, agentID, payload)
	case "bulk_tag":
		return bulkTag(ctx, db, c, agentID, payload)
	default:
		return archive(ctx, db, c, agentID, payload)
	}
}

// ---- reading the request ----

func requireOp(v js.Value) (string, error) {
	s, ok := v.Str()
	if ok {
		switch s {
		case "create", "update", "archive", "bulk_tag":
			return s, nil
		}
	}
	return "", problem.BadRequest("op must be create, update, archive or bulk_tag.")
}

func requireClientID(v js.Value) (string, error) {
	s, ok := v.Str()
	if !ok || !uuid.IsUUID(s) {
		return "", problem.BadRequest("That is not a client id.")
	}
	return s, nil
}

// str is the TypeScript str(): nil for absent, null or "", the trimmed text otherwise, with
// the field's own sentence for a required one left blank, a non-string and an overlong one.
// Length is JavaScript's (UTF-16 units).
func str(v js.Value, field string, max int, required bool) (*string, error) {
	if s, isStr := v.Str(); v.IsNullish() || (isStr && s == "") {
		if required {
			return nil, problem.BadRequest(field + " is required.")
		}
		return nil, nil
	}
	s, ok := v.Str()
	if !ok {
		return nil, problem.BadRequest(field + " must be text.")
	}
	trimmed := js.Trim(s)
	if required && trimmed == "" {
		return nil, problem.BadRequest(field + " is required.")
	}
	if js.Len(trimmed) > max {
		return nil, problem.BadRequest(field + " is too long.")
	}
	if trimmed == "" {
		return nil, nil
	}
	return &trimmed, nil
}

// isoDay is JavaScript's /^\d{4}-\d{2}-\d{2}$/: ASCII digits, and $ is the end of input.
var isoDay = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`)

// isoDate is a yyyy-mm-dd day or nil. Postgres would reject anything else; this says so in
// English. The shape only: "2026-13-45" passes here and fails in Postgres, as it did.
func isoDate(v js.Value, field string) (*string, error) {
	if s, isStr := v.Str(); v.IsNullish() || (isStr && s == "") {
		return nil, nil
	}
	s, ok := v.Str()
	if !ok || !isoDay.MatchString(s) {
		return nil, problem.BadRequest(field + " must be a date.")
	}
	return &s, nil
}

// tags is the client's tag list: trimmed, lower-cased, empties dropped, repeats folded
// (client.tags is a plain text[] with no unique constraint, and a chip shown twice is the
// kind of thing nobody notices until a filter count disagrees with it).
func tags(v js.Value) ([]string, error) {
	if v.IsNullish() {
		return []string{}, nil
	}
	items, ok := v.Array()
	if !ok {
		return nil, problem.BadRequest("Tags must be a list.")
	}
	if len(items) > maxTags {
		return nil, problem.BadRequest("That is too many tags.")
	}
	cleaned := []string{}
	for _, item := range items {
		s, isStr := item.Str()
		if !isStr {
			continue
		}
		if t := lowerJS(js.Trim(s)); t != "" {
			cleaned = append(cleaned, t)
		}
	}
	for _, t := range cleaned {
		if js.Len(t) > maxTag {
			return nil, problem.BadRequest("That tag is too long.")
		}
	}
	out := []string{}
	seen := map[string]bool{}
	for _, t := range cleaned {
		if !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return out, nil
}

// importantDate is one entry of client.important_dates, Data-Model §6.1's {label, date,
// recurring} (and NOT the prototype's "surprise flag", which has never existed). The column
// is jsonb with no schema in Postgres, so the shape is enforced here or nowhere.
type importantDate struct {
	Label     string `json:"label"`
	Date      string `json:"date"`
	Recurring bool   `json:"recurring"`
}

func importantDates(v js.Value) ([]importantDate, error) {
	if v.IsNullish() {
		return []importantDate{}, nil
	}
	items, ok := v.Array()
	if !ok {
		return nil, problem.BadRequest("Important dates must be a list.")
	}
	if len(items) > maxDates {
		return nil, problem.BadRequest("That is too many dates.")
	}
	out := make([]importantDate, 0, len(items))
	for _, raw := range items {
		// `!raw || typeof raw !== "object"`: an array is an object here, so it gets as far
		// as its (missing) label.
		if k := raw.Kind(); k != js.Object && k != js.Array {
			return nil, problem.BadRequest("That date is not readable.")
		}
		label, err := str(raw.Get("label"), "Date label", 60, true)
		if err != nil {
			return nil, err
		}
		date, err := isoDate(raw.Get("date"), "Date")
		if err != nil {
			return nil, err
		}
		if date == nil {
			return nil, problem.BadRequest(`"` + *label + `" needs a date.`)
		}
		out = append(out, importantDate{Label: *label, Date: *date, Recurring: raw.Get("recurring").IsTrue()})
	}
	return out, nil
}

// clientFields are the RPC arguments create and update share, in the TypeScript's order.
type clientFields struct {
	FirstName, LastName, Email                      string
	PreferredName, Phone, DateOfBirth, Notes        *string
	Tags                                            []string
	ImportantDates                                  []importantDate
	Line1, Line2, City, Region, PostalCode, Country *string
}

func (f clientFields) args() js.Ordered {
	return js.O(
		"p_first_name", f.FirstName,
		"p_last_name", f.LastName,
		"p_preferred_name", f.PreferredName,
		"p_email", f.Email,
		"p_phone", f.Phone,
		"p_date_of_birth", f.DateOfBirth,
		"p_tags", f.Tags,
		"p_important_dates", f.ImportantDates,
		"p_notes", f.Notes,
		"p_line1", f.Line1,
		"p_line2", f.Line2,
		"p_city", f.City,
		"p_region", f.Region,
		"p_postal_code", f.PostalCode,
		"p_country", f.Country,
	)
}

// readClient reads payload.client in the order the TypeScript did, so a request with two
// problems gets the same sentence: the email and its shape first, then the country, then the
// rest in the object literal's order.
func readClient(payload js.Value) (clientFields, error) {
	c := payload.Get("client")
	if c.IsNullish() {
		c = js.ObjectValue()
	}
	address := c.Get("address")
	if address.IsNullish() {
		address = js.ObjectValue()
	}
	var f clientFields

	email, err := str(c.Get("email"), "Email", 200, true)
	if err != nil {
		return f, err
	}
	// Deliberately loose: the authoritative check is whether mail reaches them, and the
	// advisor is typing the address of someone they have already spoken to.
	if !strings.Contains(*email, "@") || strings.HasPrefix(*email, "@") || strings.HasSuffix(*email, "@") {
		return f, problem.BadRequest("That does not look like an email address.")
	}
	f.Email = *email

	country, err := str(address.Get("country"), "Country", 2, false)
	if err != nil {
		return f, err
	}

	steps := []func() error{
		func() error { return required(&f.FirstName, c.Get("firstName"), "First name", maxName) },
		func() error { return required(&f.LastName, c.Get("lastName"), "Last name", maxName) },
		func() error { return optional(&f.PreferredName, c.Get("preferredName"), "Preferred name", maxName) },
		func() error { return optional(&f.Phone, c.Get("phone"), "Phone", 40) },
		func() (err error) { f.DateOfBirth, err = isoDate(c.Get("dateOfBirth"), "Date of birth"); return },
		func() (err error) { f.Tags, err = tags(c.Get("tags")); return },
		func() (err error) { f.ImportantDates, err = importantDates(c.Get("importantDates")); return },
		func() error { return optional(&f.Notes, c.Get("notes"), "Notes", maxNotes) },
		func() error { return optional(&f.Line1, address.Get("line1"), "Address", 200) },
		func() error { return optional(&f.Line2, address.Get("line2"), "Address line 2", 200) },
		func() error { return optional(&f.City, address.Get("city"), "City", 120) },
		func() error { return optional(&f.Region, address.Get("region"), "Region", 120) },
		func() error { return optional(&f.PostalCode, address.Get("postalCode"), "Postal code", 20) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return clientFields{}, err
		}
	}
	if country != nil {
		up := upperJS(*country)
		f.Country = &up
	}
	return f, nil
}

func required(dst *string, v js.Value, field string, max int) error {
	s, err := str(v, field, max, true)
	if err != nil {
		return err
	}
	*dst = *s
	return nil
}

func optional(dst **string, v js.Value, field string, max int) error {
	s, err := str(v, field, max, false)
	*dst = s
	return err
}

// ---- the ops ----

type createRow struct {
	Outcome  string  `json:"outcome"`
	ClientID *string `json:"client_id"`
}

// create is 3.3.9.
func create(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	fields, err := readClient(payload)
	if err != nil {
		return nil, err
	}
	clientID := newID()
	var row createRow
	found, err := db.RPCRow(ctx, "agent_create_client",
		js.O("p_agent_id", agentID, "p_client_id", clientID).Spread(fields.args()), &row)
	if err != nil {
		return nil, fmt.Errorf("client create failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("That advisor cannot create clients.")
	}
	if row.Outcome == "duplicate_email" {
		// 200, not 4xx: the form needs the EXISTING id to offer a link.
		return edge.OK(js.O("outcome", "duplicate_email", "existingClientId", row.ClientID))
	}
	if err := audit.Write(ctx, db, c, audit.Spec{
		EventType: "client.created", TargetEntity: "client", TargetID: clientID,
		// No field values. See the package comment.
		Metadata: js.O("has_address", fields.Line1 != nil, "tag_count", len(fields.Tags)),
	}); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "created", "clientId", clientID))
}

type updateRow struct {
	Outcome       string   `json:"outcome"`
	Version       *int64   `json:"version"`
	ChangedFields []string `json:"changed_fields"`
}

const staleClient = "This client changed since you opened it. Reload and try again."

// update is 3.3.10.
func update(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	clientID, err := requireClientID(payload.Get("clientId"))
	if err != nil {
		return nil, err
	}
	expected, err := agent.RequireExpectedVersion(payload.Get("expectedVersion"))
	if err != nil {
		return nil, err
	}
	fields, err := readClient(payload)
	if err != nil {
		return nil, err
	}
	args := js.O("p_client_id", clientID, "p_agent_id", agentID).Spread(fields.args()).
		Set("p_expected_version", expected)
	var row updateRow
	found, err := db.RPCRow(ctx, "agent_update_client", args, &row)
	if err != nil {
		return nil, fmt.Errorf("client update failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("No such client.")
	}
	switch row.Outcome {
	case "stale":
		return nil, problem.Conflict(staleClient)
	case "duplicate_email":
		return edge.OK(js.O("outcome", "duplicate_email", "version", row.Version))
	case "noop":
		return edge.OK(js.O("outcome", "noop", "clientId", clientID, "version", row.Version))
	}
	changed := row.ChangedFields
	if changed == nil {
		changed = []string{}
	}
	if err := audit.Write(ctx, db, c, audit.Spec{
		EventType: "client.updated", TargetEntity: "client", TargetID: clientID,
		Metadata: js.O("fields", changed, "version", row.Version),
	}); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "changed", "clientId", clientID, "version", row.Version))
}

type tagRow struct {
	ClientID string `json:"client_id"`
	Version  *int64 `json:"version"`
}

// bulkTag is 3.3.1's bulk action: one tag, one direction.
func bulkTag(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	list, ok := payload.Get("clientIds").Array()
	if !ok {
		return nil, problem.BadRequest("clientIds must be a list.")
	}
	if len(list) == 0 {
		return nil, problem.BadRequest("Pick at least one client.")
	}
	if len(list) > maxBulk {
		return nil, problem.BadRequest("That is too many clients.")
	}
	ids := make([]string, len(list))
	for i, v := range list {
		id, err := requireClientID(v)
		if err != nil {
			return nil, err
		}
		ids[i] = id
	}
	t, err := str(payload.Get("tag"), "Tag", maxTag, true)
	if err != nil {
		return nil, err
	}
	tag := lowerJS(*t)
	add, isBool := payload.Get("add").Bool()
	if !isBool {
		return nil, problem.BadRequest("add must be true or false.")
	}

	var changed []tagRow
	if err := db.RPC(ctx, "agent_bulk_tag_clients",
		js.O("p_client_ids", ids, "p_agent_id", agentID, "p_tag", tag, "p_add", add), &changed); err != nil {
		return nil, fmt.Errorf("bulk tag failed: %w", err)
	}
	// One row per client that ACTUALLY changed. The rest are "not this advisor's", "already
	// carried the tag" and "at the tag cap", deliberately indistinguishable.
	event := "client.tag_removed"
	if add {
		event = "client.tag_added"
	}
	specs := make([]audit.Spec, len(changed))
	for i, row := range changed {
		// The tag IS the fact worth keeping: the advisor's own label, not the client's data.
		specs[i] = audit.Spec{EventType: event, TargetEntity: "client", TargetID: row.ClientID,
			Metadata: js.O("tag", tag, "version", row.Version, "bulk", true)}
	}
	if err := audit.WriteMany(ctx, db, c, specs); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "tagged", "tag", tag, "add", add,
		"changedCount", len(changed), "requestedCount", len(ids)))
}

type archiveRow struct {
	Outcome string `json:"outcome"`
	Version *int64 `json:"version"`
}

// archive is 3.3.12, both halves (archived: false restores).
func archive(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	clientID, err := requireClientID(payload.Get("clientId"))
	if err != nil {
		return nil, err
	}
	expected, err := agent.RequireExpectedVersion(payload.Get("expectedVersion"))
	if err != nil {
		return nil, err
	}
	archived, isBool := payload.Get("archived").Bool()
	if !isBool {
		return nil, problem.BadRequest("archived must be true or false.")
	}
	reason, err := str(payload.Get("reason"), "Reason", maxReason, false)
	if err != nil {
		return nil, err
	}

	var row archiveRow
	found, err := db.RPCRow(ctx, "agent_set_client_archived", js.O("p_client_id", clientID,
		"p_agent_id", agentID, "p_archived", archived, "p_expected_version", expected), &row)
	if err != nil {
		return nil, fmt.Errorf("client archive failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("No such client.")
	}
	switch row.Outcome {
	case "stale":
		return nil, problem.Conflict(staleClient)
	case "noop":
		return edge.OK(js.O("outcome", "noop", "clientId", clientID, "version", row.Version))
	}
	event := "client.restored"
	if row.Outcome == "archived" {
		event = "client.archived"
	}
	// The reason IS stored (see the package comment), and only on an archive.
	metadata := js.O("version", row.Version)
	if reason != nil && row.Outcome == "archived" {
		metadata = js.O("reason", *reason, "version", row.Version)
	}
	if err := audit.Write(ctx, db, c, audit.Spec{
		EventType: event, TargetEntity: "client", TargetID: clientID, Metadata: metadata,
	}); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", row.Outcome, "clientId", clientID, "version", row.Version))
}
