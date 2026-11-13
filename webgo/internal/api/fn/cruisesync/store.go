package cruisesync

import (
	"context"
	"encoding/json"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/cruise"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// store is every database call sync.ts and budget.ts made, one method per supabase-js chain,
// so the ported Deno tests (and ours) run against a fake exactly as sync_test.ts stubbed Db.
// dbStore is the real one: the same PostgREST calls, through the service client.
//
// Writes take js.Ordered so the payload keys and their order are the ones the Deno object
// literals had (and a test can ask whether a key was sent at all, which is the difference
// between "leave last_run_at alone" and "set it").
type store interface {
	// InsertRows is the audit.Inserter, for writeSystemAuditEvent.
	InsertRows(ctx context.Context, table string, rows any) error

	// budget.ts
	countRequestsSince(ctx context.Context, since string) (int64, error)
	latestQuotaSince(ctx context.Context, since string) (*quotaRow, error)
	insertRequest(ctx context.Context, row js.Ordered) error

	// the run row
	insertRun(ctx context.Context, row js.Ordered) error
	liveRun(ctx context.Context, runID, since string) (bool, error)
	updateRun(ctx context.Context, runID string, patch js.Ordered) error

	// the scopes
	readScopes(ctx context.Context, onlyLabel string) ([]scopeRow, error)
	updateScope(ctx context.Context, scopeID string, patch js.Ordered) error

	// the catalog
	upsert(ctx context.Context, table string, rows []js.Ordered, onConflict string) error
	keyPage(ctx context.Context, table, columns string, from, to int) ([]json.RawMessage, error)
	archiveMissing(ctx context.Context, table, stamp string) (int64, error)
	lineIDBySlug(ctx context.Context, slug string) (*string, error)
	sailingIDByKey(ctx context.Context, provider, key, locale string) (*string, error)
	upsertSailing(ctx context.Context, row js.Ordered) (*string, error)
	deletePortCalls(ctx context.Context, sailingID string) error
	insertPortCalls(ctx context.Context, rows []js.Ordered) error
	upsertCabinPrices(ctx context.Context, rows []js.Ordered) error
	shipID(ctx context.Context, lineID, name string) (*string, error)
	createShip(ctx context.Context, row js.Ordered) (*string, error)
	portsByName(ctx context.Context, names []string) ([]portRef, error)
	createPorts(ctx context.Context, rows []js.Ordered) ([]portRef, error)

	// refetchSailing
	sailingByID(ctx context.Context, id string) (*sailingRef, error)
	lineProviderKey(ctx context.Context, lineID string) (*string, error)
	updateSailing(ctx context.Context, id string, patch js.Ordered) error
}

// quotaRow is the newest relay quota on record.
type quotaRow struct {
	QuotaLimit     *int64 `json:"quota_limit"`
	QuotaRemaining *int64 `json:"quota_remaining"`
}

// scopeRow is one cruise_sync_scope row, as the scope read selects it.
type scopeRow struct {
	ID                  string  `json:"id"`
	Label               string  `json:"label"`
	Endpoint            string  `json:"endpoint"`
	Priority            int64   `json:"priority"`
	Company             *string `json:"company"`
	Locale              *string `json:"locale"`
	Destination         *string `json:"destination"`
	DepartureWithinDays *int64  `json:"departure_within_days"`
	DepartureOffsetDays *int64  `json:"departure_offset_days"`
	Sort                string  `json:"sort"`
	MinIntervalDays     int64   `json:"min_interval_days"`
	LastRunAt           *string `json:"last_run_at"`
	MaxRowsPerRequest   int64   `json:"max_rows_per_request"`
	MaxRequestsPerRun   int64   `json:"max_requests_per_run"`
	Cursor              *string `json:"cursor"`
	HighWaterUpdatedAt  *string `json:"high_water_updated_at"`
}

const scopeColumns = "id, label, endpoint, priority, company, locale, destination, " +
	"departure_within_days, departure_offset_days, sort, min_interval_days, last_run_at, " +
	"max_rows_per_request, max_requests_per_run, cursor, high_water_updated_at"

type idRow struct {
	ID *string `json:"id"`
}

type portRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type sailingRef struct {
	ID             string  `json:"id"`
	Provider       *string `json:"provider"`
	ProviderKey    *string `json:"provider_key"`
	ProviderLocale *string `json:"provider_locale"`
	CruiseLineID   string  `json:"cruise_line_id"`
}

type lineKeyRow struct {
	ProviderKey *string `json:"provider_key"`
}

// dbStore is the service-role store. serviceClient because there is no caller to act as:
// cruise_* tables have RLS on with no policies at all, audit_event has no insert policy, and
// the actor is a machine.
type dbStore struct{ db *service.Client }

func (s dbStore) InsertRows(ctx context.Context, table string, rows any) error {
	return s.db.InsertRows(ctx, table, rows)
}

func (s dbStore) countRequestsSince(ctx context.Context, since string) (int64, error) {
	return s.db.From("cruise_api_request").Select("id").Gte("created_at", since).Count(ctx)
}

func (s dbStore) latestQuotaSince(ctx context.Context, since string) (*quotaRow, error) {
	var row quotaRow
	found, err := s.db.From("cruise_api_request").Select("quota_limit, quota_remaining").
		Gte("created_at", since).Not("quota_remaining", "is", nil).
		Order("created_at", false).Limit(1).MaybeSingle(ctx, &row)
	if err != nil || !found {
		return nil, err
	}
	return &row, nil
}

func (s dbStore) insertRequest(ctx context.Context, row js.Ordered) error {
	return s.db.From("cruise_api_request").Insert(ctx, row, nil)
}

func (s dbStore) insertRun(ctx context.Context, row js.Ordered) error {
	return s.db.From("cruise_sync_run").Insert(ctx, row, nil)
}

func (s dbStore) liveRun(ctx context.Context, runID, since string) (bool, error) {
	var rows []idRow
	err := s.db.From("cruise_sync_run").Select("id").Eq("status", "running").Neq("id", runID).
		Gte("started_at", since).Limit(1).Rows(ctx, &rows)
	return len(rows) > 0, err
}

func (s dbStore) updateRun(ctx context.Context, runID string, patch js.Ordered) error {
	return s.db.From("cruise_sync_run").Eq("id", runID).Update(ctx, patch, nil)
}

func (s dbStore) readScopes(ctx context.Context, onlyLabel string) ([]scopeRow, error) {
	q := s.db.From("cruise_sync_scope").Select(scopeColumns).Eq("enabled", true)
	if onlyLabel != "" {
		q = q.Eq("label", onlyLabel)
	}
	var rows []scopeRow
	err := q.Order("priority", true).Rows(ctx, &rows)
	return rows, err
}

func (s dbStore) updateScope(ctx context.Context, scopeID string, patch js.Ordered) error {
	return s.db.From("cruise_sync_scope").Eq("id", scopeID).Update(ctx, patch, nil)
}

func (s dbStore) upsert(ctx context.Context, table string, rows []js.Ordered, onConflict string) error {
	return s.db.From(table).Upsert(ctx, rows, service.UpsertOptions{OnConflict: onConflict}, nil)
}

func (s dbStore) keyPage(ctx context.Context, table, columns string, from, to int) ([]json.RawMessage, error) {
	var rows []json.RawMessage
	err := s.db.From(table).Select(columns).Range(from, to).Rows(ctx, &rows)
	return rows, err
}

func (s dbStore) archiveMissing(ctx context.Context, table, stamp string) (int64, error) {
	var rows []idRow
	err := s.db.From(table).Eq("provider", cruise.Provider).Is("archived_at", nil).Lt("last_seen_at", stamp).
		Select("id").Update(ctx, js.O("archived_at", stamp, "updated_at", stamp), &rows)
	return int64(len(rows)), err
}

func (s dbStore) lineIDBySlug(ctx context.Context, slug string) (*string, error) {
	var row idRow
	found, err := s.db.From("cruise_line").Select("id").Eq("slug", slug).MaybeSingle(ctx, &row)
	if err != nil || !found {
		return nil, err
	}
	return row.ID, nil
}

func (s dbStore) sailingIDByKey(ctx context.Context, prov, key, locale string) (*string, error) {
	var row idRow
	found, err := s.db.From("cruise_sailing").Select("id").Eq("provider", prov).Eq("provider_key", key).
		Eq("provider_locale", locale).MaybeSingle(ctx, &row)
	if err != nil || !found {
		return nil, err
	}
	return row.ID, nil
}

// firstID is `.select("id").maybeSingle()` after a write: the one row's id, or null.
func firstID(rows []idRow) *string {
	if len(rows) == 0 {
		return nil
	}
	return rows[0].ID
}

func (s dbStore) upsertSailing(ctx context.Context, row js.Ordered) (*string, error) {
	var rows []idRow
	err := s.db.From("cruise_sailing").Select("id").Upsert(ctx, row,
		service.UpsertOptions{OnConflict: "provider,provider_key,provider_locale"}, &rows)
	return firstID(rows), err
}

func (s dbStore) deletePortCalls(ctx context.Context, sailingID string) error {
	return s.db.From("cruise_port_call").Eq("sailing_id", sailingID).Delete(ctx, nil)
}

func (s dbStore) insertPortCalls(ctx context.Context, rows []js.Ordered) error {
	return s.db.From("cruise_port_call").Insert(ctx, rows, nil)
}

func (s dbStore) upsertCabinPrices(ctx context.Context, rows []js.Ordered) error {
	return s.db.From("cruise_sailing_cabin_price").Upsert(ctx, rows,
		service.UpsertOptions{OnConflict: "sailing_id,cabin_code"}, nil)
}

func (s dbStore) shipID(ctx context.Context, lineID, name string) (*string, error) {
	var row idRow
	found, err := s.db.From("cruise_ship").Select("id").Eq("cruise_line_id", lineID).Eq("name", name).
		MaybeSingle(ctx, &row)
	if err != nil || !found {
		return nil, err
	}
	return row.ID, nil
}

func (s dbStore) createShip(ctx context.Context, row js.Ordered) (*string, error) {
	var rows []idRow
	err := s.db.From("cruise_ship").Select("id").Upsert(ctx, row,
		service.UpsertOptions{OnConflict: "cruise_line_id,name"}, &rows)
	return firstID(rows), err
}

func (s dbStore) portsByName(ctx context.Context, names []string) ([]portRef, error) {
	var rows []portRef
	err := s.db.From("cruise_port").Select("id, name").In("name", names).Rows(ctx, &rows)
	return rows, err
}

func (s dbStore) createPorts(ctx context.Context, rows []js.Ordered) ([]portRef, error) {
	var out []portRef
	err := s.db.From("cruise_port").Select("id, name").Upsert(ctx, rows,
		service.UpsertOptions{OnConflict: "name"}, &out)
	return out, err
}

func (s dbStore) sailingByID(ctx context.Context, id string) (*sailingRef, error) {
	var row sailingRef
	found, err := s.db.From("cruise_sailing").Select("id, provider, provider_key, provider_locale, cruise_line_id").
		Eq("id", id).MaybeSingle(ctx, &row)
	if err != nil || !found {
		return nil, err
	}
	return &row, nil
}

func (s dbStore) lineProviderKey(ctx context.Context, lineID string) (*string, error) {
	var row lineKeyRow
	found, err := s.db.From("cruise_line").Select("provider_key").Eq("id", lineID).MaybeSingle(ctx, &row)
	if err != nil || !found {
		return nil, err
	}
	return row.ProviderKey, nil
}

func (s dbStore) updateSailing(ctx context.Context, id string, patch js.Ordered) error {
	return s.db.From("cruise_sailing").Eq("id", id).Update(ctx, patch, nil)
}
