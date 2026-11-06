package supa

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"regexp"
	"strings"
)

// PostgREST reads for page handlers (docs/GO-MIGRATION.md §4.3): the same calls supabase-js
// makes today, sent with the VISITOR's own access token so RLS and column grants decide what
// comes back. Writes go through the function registry, never through here.
//
// Rows decode into the caller's own struct type, never into any or map[string]any, where a
// JSON number would become a float64 and break the cents rule (CLAUDE.md rule 5): every
// *_cents field is an int64. Select, MaybeOne and RPC refuse an untyped T at runtime too.
//
// Table and function names come from the handler's code, never from a request: they are
// checked against a plain identifier pattern so a stray value cannot reach another path.

// ErrMultipleRows: MaybeOne found more than one row.
var ErrMultipleRows = errors.New("supa: more than one row")

// Error is a PostgREST refusal other than 401/403: a 4xx with PostgREST's error code (for
// example PGRST116, or a Postgres SQLSTATE such as 22P02). The message is deliberately not
// kept: it can quote the value that failed, and errors end up in logs.
type Error struct {
	Status int
	Code   string
}

func (e *Error) Error() string {
	if e.Code == "" {
		return fmt.Sprintf("supa: PostgREST returned %d", e.Status)
	}
	return fmt.Sprintf("supa: PostgREST returned %d (%s)", e.Status, e.Code)
}

const maxRestBody = 10 << 20

var ident = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

// Query is a PostgREST query string. Build it with the methods; each returns the query so
// calls chain: supa.Q().Select("id,title,total_cents").Eq("trip_id", id).Order("starts_on", true).
type Query struct{ v url.Values }

// Q starts an empty query.
func Q() Query { return Query{v: url.Values{}} }

func (q Query) set(k, v string) Query {
	if q.v == nil {
		q.v = url.Values{}
	}
	q.v.Add(k, v)
	return q
}

// Select names the columns (and embedded resources) to return, PostgREST syntax.
func (q Query) Select(cols string) Query { return q.set("select", cols) }

// Eq filters column = value. value may come from a request: it is a literal to PostgREST
// and is encoded on the way out.
func (q Query) Eq(col, value string) Query { return q.set(col, "eq."+value) }

// Neq filters column <> value.
func (q Query) Neq(col, value string) Query { return q.set(col, "neq."+value) }

// Is filters column IS null / true / false.
func (q Query) Is(col, value string) Query { return q.set(col, "is."+value) }

// Gte and Lte filter ranges (dates, numbers).
func (q Query) Gte(col, value string) Query { return q.set(col, "gte."+value) }
func (q Query) Lte(col, value string) Query { return q.set(col, "lte."+value) }

// In filters column IN (values). Each value is double-quoted with \ and " escaped, so a
// comma or parenthesis inside a value stays inside it.
func (q Query) In(col string, values ...string) Query {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(v) + `"`
	}
	return q.set(col, "in.("+strings.Join(quoted, ",")+")")
}

// Order sorts by col; call it again for a second key.
func (q Query) Order(col string, ascending bool) Query {
	dir := "desc"
	if ascending {
		dir = "asc"
	}
	return q.set("order", col+"."+dir)
}

// Limit caps the rows; Offset skips some.
func (q Query) Limit(n int) Query  { return q.set("limit", fmt.Sprint(n)) }
func (q Query) Offset(n int) Query { return q.set("offset", fmt.Sprint(n)) }

// Raw adds one parameter as is, for PostgREST syntax the helpers do not cover (or=, not.).
// The value is still URL-encoded; the key must be a column or a PostgREST keyword.
func (q Query) Raw(key, value string) Query { return q.set(key, value) }

// Encode is the query string.
func (q Query) Encode() string { return q.v.Encode() }

// Select reads rows from a table or view as the visitor. An empty accessToken reads as the
// anonymous role, which is what a public page would do.
func Select[T any](ctx context.Context, c *Client, accessToken, table string, q Query) ([]T, error) {
	if err := typed[T](); err != nil {
		return nil, err
	}
	if !ident.MatchString(table) {
		return nil, fmt.Errorf("supa: %q is not a table name", table)
	}
	target := "/rest/v1/" + table
	if s := q.Encode(); s != "" {
		target += "?" + s
	}
	var rows []T
	if err := c.rest(ctx, http.MethodGet, target, accessToken, nil, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// MaybeOne reads at most one row (supabase-js maybeSingle): found is false for none, and more
// than one is ErrMultipleRows.
func MaybeOne[T any](ctx context.Context, c *Client, accessToken, table string, q Query) (row T, found bool, err error) {
	rows, err := Select[T](ctx, c, accessToken, table, q)
	switch {
	case err != nil:
		return row, false, err
	case len(rows) == 0:
		return row, false, nil
	case len(rows) > 1:
		return row, false, ErrMultipleRows
	}
	return rows[0], true, nil
}

// RPC calls a Postgres function as the visitor (POST /rest/v1/rpc/{fn}) and decodes its
// result into T. args is marshalled to JSON; pass a struct with json tags, or nil.
func RPC[T any](ctx context.Context, c *Client, accessToken, fn string, args any) (T, error) {
	var out T
	if err := typed[T](); err != nil {
		return out, err
	}
	if !ident.MatchString(fn) {
		return out, fmt.Errorf("supa: %q is not a function name", fn)
	}
	if args == nil {
		args = struct{}{}
	}
	err := c.rest(ctx, http.MethodPost, "/rest/v1/rpc/"+fn, accessToken, args, &out)
	return out, err
}

func (c *Client) rest(ctx context.Context, method, path, token string, body any, out any) error {
	if c.baseURL == "" {
		return fmt.Errorf("%w: Supabase is not configured", ErrUnavailable)
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, rd)
	if err != nil {
		return err
	}
	if token == "" {
		token = c.anonKey // the anonymous role, as supabase-js sends it
	}
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		// Never the error itself: it carries the URL, and the query can carry an id or a name.
		return fmt.Errorf("%w: %s %s", ErrUnavailable, method, strings.SplitN(path, "?", 2)[0])
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxRestBody+1))
	if err != nil {
		return fmt.Errorf("%w: reading the reply", ErrUnavailable)
	}
	if len(raw) > maxRestBody {
		return fmt.Errorf("%w: reply over %d bytes", ErrUnavailable, maxRestBody)
	}
	switch {
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return ErrUnauthenticated
	case resp.StatusCode >= 500:
		return fmt.Errorf("%w: PostgREST returned %d", ErrUnavailable, resp.StatusCode)
	case resp.StatusCode >= 400:
		var p struct {
			Code string `json:"code"`
		}
		_ = json.Unmarshal(raw, &p)
		return &Error{Status: resp.StatusCode, Code: p.Code}
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil // 204, or a void function
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("supa: decoding %s: %w", strings.SplitN(path, "?", 2)[0], err)
	}
	return nil
}

// typed refuses a result type that would decode JSON numbers into float64: an interface
// (any), or a map, slice or pointer whose element is one.
func typed[T any]() error {
	t := reflect.TypeFor[T]()
	for t.Kind() == reflect.Slice || t.Kind() == reflect.Array || t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch {
	case t.Kind() == reflect.Interface:
		return errors.New("supa: decode into a struct type, never any (JSON numbers would become float64)")
	case t.Kind() == reflect.Map && t.Elem().Kind() == reflect.Interface:
		return errors.New("supa: decode into a struct type, never map[string]any (JSON numbers would become float64)")
	}
	return nil
}
