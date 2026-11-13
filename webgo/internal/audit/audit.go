// Package audit ports supabase/functions/_shared/audit.ts: the audit trail of CLAUDE.md
// rule 3 (docs/Data-Model.md §15 and §20).
//
// Every mutation to a sensitive table (payment_milestone, commission, client) writes an
// audit_event saying who did what to which record. This package is the only sanctioned way
// to write one from Go, so the shape stays the one the Deno functions wrote: the same
// columns, the same metadata, a UUID v7 id.
//
// It never holds the service key. audit_event has RLS on and no insert policy, so the write
// needs the service role, and the service client lives only in internal/api (ruling 14).
// Callers pass it in as an Inserter; internal/api/service.Client satisfies it through
// service.AuditInserter.
//
// Errors must not be swallowed. A swallowed audit error is exactly the silent gap rule 3
// exists to prevent: the mutation lands, the record of it does not, and nobody finds out
// until an auditor asks. "After" is not atomic with the mutation; the financial ledgers
// (commission, pay links) write their audit rows inside their own SQL transaction through
// RPCs that take p_audit_id, and do not use this package.
package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Inserter inserts rows into a table as the service role, with return=minimal.
type Inserter interface {
	InsertRows(ctx context.Context, table string, rows any) error
}

// Spec is AuditSpec.
type Spec struct {
	// EventType is dotted and past tense: "payment_milestone.deleted", "trip.notes_changed".
	EventType    string
	TargetEntity string
	TargetID     string
	// Metadata is the jsonb metadata column. Build it with js.O so its key order is the one
	// the Deno function wrote; nil writes {}.
	Metadata any
	// Before writes the row before the action runs, for an action whose REQUEST must be on
	// the record even if the process dies partway. No caller uses it today.
	Before bool
}

// Row is one audit_event row, in the column order the Deno insert named them.
type Row struct {
	ID           string          `json:"id"`
	ActorUserID  *string         `json:"actor_user_id"`
	ActorRole    *string         `json:"actor_role"`
	EventType    string          `json:"event_type"`
	TargetEntity string          `json:"target_entity"`
	TargetID     string          `json:"target_id"`
	Metadata     json.RawMessage `json:"metadata"`
	IPAddress    *string         `json:"ip_address"`
	UserAgent    *string         `json:"user_agent"`
}

// now is the clock for ids; tests replace it.
var now = time.Now

func metadata(m any) (json.RawMessage, error) {
	if m == nil {
		return json.RawMessage("{}"), nil
	}
	b, err := js.Marshal(m)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// row builds the row for a human actor.
func row(actor *caller.Context, spec Spec) (Row, error) {
	md, err := metadata(spec.Metadata)
	if err != nil {
		return Row{}, err
	}
	pu, role := actor.PlatformUserID, actor.Role
	return Row{
		ID:           uuid.NewAt(now()),
		ActorUserID:  &pu,
		ActorRole:    &role,
		EventType:    spec.EventType,
		TargetEntity: spec.TargetEntity,
		TargetID:     spec.TargetID,
		Metadata:     md,
		IPAddress:    actor.IP,
		UserAgent:    actor.UserAgent,
	}, nil
}

// Write is writeAuditEvent.
func Write(ctx context.Context, db Inserter, actor *caller.Context, spec Spec) error {
	r, err := row(actor, spec)
	if err != nil {
		return err
	}
	if err := db.InsertRows(ctx, "audit_event", r); err != nil {
		return fmt.Errorf("audit write failed for %s on %s/%s: %w", spec.EventType, spec.TargetEntity, spec.TargetID, err)
	}
	return nil
}

// WriteMany is writeAuditEvents: one row per target, in ONE insert, so the rows land
// together or not at all. A bulk action over twenty-five clients owes twenty-five rows.
func WriteMany(ctx context.Context, db Inserter, actor *caller.Context, specs []Spec) error {
	if len(specs) == 0 {
		return nil
	}
	rows := make([]Row, 0, len(specs))
	for _, s := range specs {
		r, err := row(actor, s)
		if err != nil {
			return err
		}
		rows = append(rows, r)
	}
	if err := db.InsertRows(ctx, "audit_event", rows); err != nil {
		return fmt.Errorf("audit write failed for %d %s events: %w", len(specs), specs[0].EventType, err)
	}
	return nil
}

// WriteSystem is writeSystemAuditEvent: a job with no human actor (a pg_cron tick). The
// actor, role, address and user agent are all null; inventing "127.0.0.1" would put a fact
// in the trail nobody can act on. One row per run, with counts in the metadata; not a way to
// bulk-audit rows.
func WriteSystem(ctx context.Context, db Inserter, spec Spec) error {
	md, err := metadata(spec.Metadata)
	if err != nil {
		return err
	}
	r := Row{
		ID:           uuid.NewAt(now()),
		EventType:    spec.EventType,
		TargetEntity: spec.TargetEntity,
		TargetID:     spec.TargetID,
		Metadata:     md,
	}
	if err := db.InsertRows(ctx, "audit_event", r); err != nil {
		return fmt.Errorf("system audit write failed for %s on %s/%s: %w", spec.EventType, spec.TargetEntity, spec.TargetID, err)
	}
	return nil
}

// With is withAudit: run fn and write its row, after by default, before when spec.Before.
func With[T any](ctx context.Context, db Inserter, actor *caller.Context, spec Spec, fn func() (T, error)) (T, error) {
	var zero T
	if spec.Before {
		if err := Write(ctx, db, actor, spec); err != nil {
			return zero, err
		}
		return fn()
	}
	out, err := fn()
	if err != nil {
		return zero, err
	}
	if err := Write(ctx, db, actor, spec); err != nil {
		return zero, err
	}
	return out, nil
}
