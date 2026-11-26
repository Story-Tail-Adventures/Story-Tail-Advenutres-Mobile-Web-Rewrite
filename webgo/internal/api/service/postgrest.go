package service

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// Query is a PostgREST request being built, the Go shape of supabase-js's query builder:
//
//	c.From("trip").Select("id, client_id").Eq("id", tripID).MaybeSingle(ctx, &row)
//
// Filters are added in call order, and values are written the way supabase-js wrote them
// (`${value}`), so the same filter reaches PostgREST. A Query is single-use and not safe for
// concurrent use.
type Query struct {
	c      *Client
	table  string
	params [][2]string
	// rpc is set for RPCQuery: the reads POST these arguments to rpc/<fn>.
	rpc     bool
	rpcArgs any
}

// RPCQuery is `.rpc(fn, args)` followed by query modifiers (`.select().order().limit()`):
// a POST to rpc/<fn> whose rows PostgREST filters, orders and limits like a table's. Read it
// with Rows or MaybeSingle.
func (c *Client) RPCQuery(fn string, args any) *Query {
	if args == nil {
		args = json.RawMessage("{}")
	}
	return &Query{c: c, table: "rpc/" + url.PathEscape(fn), rpc: true, rpcArgs: args}
}

// From starts a query on a table or view in the public schema.
func (c *Client) From(table string) *Query { return &Query{c: c, table: table} }

func (q *Query) add(k, v string) *Query {
	q.params = append(q.params, [2]string{k, v})
	return q
}

func (q *Query) set(k, v string) *Query {
	for i := range q.params {
		if q.params[i][0] == k {
			q.params[i][1] = v
			return q
		}
	}
	return q.add(k, v)
}

var selectSpace = regexp.MustCompile(`\s`)

// Select names the columns, embedded resources included ("id, account:account_id(locked_at)").
// Whitespace outside double quotes is removed, as supabase-js does.
func (q *Query) Select(columns string) *Query {
	var b strings.Builder
	quoted := false
	for _, r := range columns {
		if r == '"' {
			quoted = !quoted
		}
		if !quoted && selectSpace.MatchString(string(r)) {
			continue
		}
		b.WriteRune(r)
	}
	return q.set("select", b.String())
}

// format writes a filter value as a JavaScript template literal would.
func format(v any) string {
	switch t := v.(type) {
	case nil:
		return "null"
	case string:
		return t
	case bool:
		return strconv.FormatBool(t)
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case int32:
		return strconv.FormatInt(int64(t), 10)
	case float64:
		return js.NumberString(t)
	case *string:
		if t == nil {
			return "null"
		}
		return *t
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

// Eq is `.eq(column, value)`.
func (q *Query) Eq(column string, v any) *Query { return q.add(column, "eq."+format(v)) }

// Neq is `.neq`.
func (q *Query) Neq(column string, v any) *Query { return q.add(column, "neq."+format(v)) }

// Gt is `.gt`.
func (q *Query) Gt(column string, v any) *Query { return q.add(column, "gt."+format(v)) }

// Gte is `.gte`.
func (q *Query) Gte(column string, v any) *Query { return q.add(column, "gte."+format(v)) }

// Lt is `.lt`.
func (q *Query) Lt(column string, v any) *Query { return q.add(column, "lt."+format(v)) }

// Lte is `.lte`.
func (q *Query) Lte(column string, v any) *Query { return q.add(column, "lte."+format(v)) }

// Like is `.like`.
func (q *Query) Like(column, pattern string) *Query { return q.add(column, "like."+pattern) }

// Ilike is `.ilike`.
func (q *Query) Ilike(column, pattern string) *Query { return q.add(column, "ilike."+pattern) }

// Is is `.is(column, null|true|false)`; pass nil for null.
func (q *Query) Is(column string, v any) *Query { return q.add(column, "is."+format(v)) }

var inReserved = regexp.MustCompile(`[,()]`)

// In is `.in(column, values)`. A value holding a comma or a parenthesis is double-quoted, as
// supabase-js does.
func (q *Query) In(column string, values []string) *Query {
	parts := make([]string, len(values))
	for i, v := range values {
		if inReserved.MatchString(v) {
			parts[i] = `"` + v + `"`
		} else {
			parts[i] = v
		}
	}
	return q.add(column, "in.("+strings.Join(parts, ",")+")")
}

// Contains is `.contains(column, value)` for arrays: cs.{a,b}.
func (q *Query) Contains(column string, values []string) *Query {
	return q.add(column, "cs.{"+strings.Join(values, ",")+"}")
}

// Overlaps is `.overlaps(column, values)` for arrays: ov.{a,b}.
func (q *Query) Overlaps(column string, values []string) *Query {
	return q.add(column, "ov.{"+strings.Join(values, ",")+"}")
}

// Not is `.not(column, operator, value)`.
func (q *Query) Not(column, operator string, v any) *Query {
	return q.add(column, "not."+operator+"."+format(v))
}

// Or is `.or(filters)`: or=(filters).
func (q *Query) Or(filters string) *Query { return q.add("or", "("+filters+")") }

// Filter is `.filter(column, operator, value)`, the escape hatch for any PostgREST operator.
func (q *Query) Filter(column, operator string, v any) *Query {
	return q.add(column, operator+"."+format(v))
}

// Order is `.order(column, { ascending })`.
func (q *Query) Order(column string, ascending bool) *Query {
	dir := "desc"
	if ascending {
		dir = "asc"
	}
	return q.appendOrder(column + "." + dir)
}

// OrderNulls is `.order(column, { ascending, nullsFirst })`.
func (q *Query) OrderNulls(column string, ascending, nullsFirst bool) *Query {
	dir := "desc"
	if ascending {
		dir = "asc"
	}
	nulls := ".nullslast"
	if nullsFirst {
		nulls = ".nullsfirst"
	}
	return q.appendOrder(column + "." + dir + nulls)
}

func (q *Query) appendOrder(term string) *Query {
	for i := range q.params {
		if q.params[i][0] == "order" {
			q.params[i][1] += "," + term
			return q
		}
	}
	return q.add("order", term)
}

// Limit is `.limit(n)`.
func (q *Query) Limit(n int) *Query { return q.set("limit", strconv.Itoa(n)) }

// Range is `.range(from, to)`, inclusive.
func (q *Query) Range(from, to int) *Query {
	q.set("offset", strconv.Itoa(from))
	return q.set("limit", strconv.Itoa(to-from+1))
}

func (q *Query) url() string {
	v := url.Values{}
	var b strings.Builder
	if q.rpc {
		b.WriteString(q.c.base + "/rest/v1/" + q.table) // already escaped by RPCQuery
	} else {
		b.WriteString(q.c.base + "/rest/v1/" + url.PathEscape(q.table))
	}
	for i, p := range q.params {
		if i == 0 {
			b.WriteByte('?')
		} else {
			b.WriteByte('&')
		}
		v.Set(p[0], p[1])
		b.WriteString(v.Encode())
		v.Del(p[0])
	}
	return b.String()
}

func jsonHeader() http.Header {
	return http.Header{"Content-Type": {"application/json"}, "Accept": {"application/json"}}
}

// read runs the query: a GET for a table, a POST of the arguments for RPCQuery.
func (q *Query) read(ctx context.Context) ([]byte, error) {
	if q.rpc {
		b, err := marshal(q.rpcArgs)
		if err != nil {
			return nil, err
		}
		_, _, raw, err := q.c.do(ctx, http.MethodPost, q.url(), bytes.NewReader(b), jsonHeader())
		return raw, err
	}
	_, _, raw, err := q.c.do(ctx, http.MethodGet, q.url(), nil, jsonHeader())
	return raw, err
}

// Rows runs the read and decodes the array into out (a pointer to a slice of typed rows).
func (q *Query) Rows(ctx context.Context, out any) error {
	raw, err := q.read(ctx)
	if err != nil {
		return err
	}
	return decode(raw, out)
}

// MaybeSingle is `.maybeSingle()`: no row is (false, nil), one row decodes into out, more
// than one is PGRST116, as supabase-js reports it.
func (q *Query) MaybeSingle(ctx context.Context, out any) (bool, error) {
	raw, err := q.read(ctx)
	if err != nil {
		return false, err
	}
	return one(raw, out, true)
}

// Single is `.single()`: exactly one row, or PGRST116.
func (q *Query) Single(ctx context.Context, out any) error {
	raw, err := q.read(ctx)
	if err != nil {
		return err
	}
	_, err = one(raw, out, false)
	return err
}

// one picks the single row out of an array reply.
func one(raw []byte, out any, maybe bool) (bool, error) {
	var rows []json.RawMessage
	if err := json.Unmarshal(raw, &rows); err != nil {
		return false, &Error{Message: "decoding the reply: not an array"}
	}
	switch {
	case len(rows) == 1:
		return true, decode(rows[0], out)
	case len(rows) == 0 && maybe:
		return false, nil
	default:
		return false, &Error{
			Status:  http.StatusNotAcceptable,
			Code:    "PGRST116",
			Message: "JSON object requested, multiple (or no) rows returned",
			Details: "Results contain " + strconv.Itoa(len(rows)) + " rows, application/vnd.pgrst.object+json requires 1 row",
		}
	}
}

// Count is `.select(cols, { count: "exact", head: true })`: a HEAD request whose count comes
// back in Content-Range.
func (q *Query) Count(ctx context.Context) (int64, error) {
	if !q.has("select") {
		q.set("select", "*")
	}
	h := jsonHeader()
	h.Set("Prefer", "count=exact")
	_, header, _, err := q.c.do(ctx, http.MethodHead, q.url(), nil, h)
	if err != nil {
		return 0, err
	}
	_, total, ok := strings.Cut(header.Get("Content-Range"), "/")
	if !ok {
		return 0, &Error{Message: "count missing from Content-Range"}
	}
	n, err := strconv.ParseInt(total, 10, 64)
	if err != nil {
		return 0, &Error{Message: "count unreadable in Content-Range"}
	}
	return n, nil
}

func (q *Query) has(k string) bool {
	for _, p := range q.params {
		if p[0] == k {
			return true
		}
	}
	return false
}

// write sends a body. With out == nil the write asks for return=minimal, as supabase-js does
// when no .select() follows; with out != nil it asks for the rows back.
func (q *Query) write(ctx context.Context, method string, body any, prefer []string, out any) error {
	b, err := marshal(body)
	if err != nil {
		return err
	}
	h := jsonHeader()
	if out != nil {
		prefer = append(prefer, "return=representation")
		if !q.has("select") {
			q.set("select", "*")
		}
	} else {
		prefer = append(prefer, "return=minimal")
	}
	h.Set("Prefer", strings.Join(prefer, ","))
	_, _, raw, err := q.c.do(ctx, method, q.url(), bytes.NewReader(b), h)
	if err != nil {
		return err
	}
	return decode(raw, out)
}

// columnsOf is the union of keys across an array of rows, in first-seen order, which
// supabase-js sends as `columns` so PostgREST fills a row's missing keys with NULL.
func columnsOf(body []byte) string {
	v, err := js.Parse(body)
	if err != nil {
		return ""
	}
	rows, ok := v.Array()
	if !ok {
		return ""
	}
	seen := map[string]bool{}
	var cols []string
	for _, r := range rows {
		o, ok := r.Object()
		if !ok {
			continue
		}
		for _, k := range o.Keys() {
			if !seen[k] {
				seen[k] = true
				cols = append(cols, `"`+k+`"`)
			}
		}
	}
	return strings.Join(cols, ",")
}

// Insert is `.insert(rows)`; rows is one row or a slice. out (a pointer to a slice) asks for
// the inserted rows back, as `.insert(...).select()` did.
func (q *Query) Insert(ctx context.Context, rows any, out any) error {
	b, err := marshal(rows)
	if err != nil {
		return err
	}
	if cols := columnsOf(b); cols != "" {
		q.set("columns", cols)
	}
	return q.write(ctx, http.MethodPost, json.RawMessage(b), nil, out)
}

// UpsertOptions are `.upsert`'s options.
type UpsertOptions struct {
	OnConflict       string
	IgnoreDuplicates bool
}

// Upsert is `.upsert(rows, { onConflict, ignoreDuplicates })`.
func (q *Query) Upsert(ctx context.Context, rows any, opt UpsertOptions, out any) error {
	b, err := marshal(rows)
	if err != nil {
		return err
	}
	if cols := columnsOf(b); cols != "" {
		q.set("columns", cols)
	}
	if opt.OnConflict != "" {
		q.set("on_conflict", opt.OnConflict)
	}
	res := "resolution=merge-duplicates"
	if opt.IgnoreDuplicates {
		res = "resolution=ignore-duplicates"
	}
	return q.write(ctx, http.MethodPost, json.RawMessage(b), []string{res}, out)
}

// Update is `.update(patch)` with the filters already added. out asks for the updated rows.
func (q *Query) Update(ctx context.Context, patch any, out any) error {
	return q.write(ctx, http.MethodPatch, patch, nil, out)
}

// Delete is `.delete()` with the filters already added. out asks for the deleted rows.
func (q *Query) Delete(ctx context.Context, out any) error {
	h := jsonHeader()
	if out != nil {
		h.Set("Prefer", "return=representation")
		if !q.has("select") {
			q.set("select", "*")
		}
	} else {
		h.Set("Prefer", "return=minimal")
	}
	_, _, raw, err := q.c.do(ctx, http.MethodDelete, q.url(), nil, h)
	if err != nil {
		return err
	}
	return decode(raw, out)
}

// RPC is `.rpc(fn, args)`: POST /rest/v1/rpc/fn. args is a js.O or a struct; a key whose
// value is js.Undef is left out (Postgres then uses the parameter's default), where a nil
// value sends null. out decodes whatever the function returns: a scalar, an object, or an
// array for a set-returning function. Use RPCRow when the Deno code read
// `Array.isArray(data) ? data[0] : data`.
func (c *Client) RPC(ctx context.Context, fn string, args any, out any) error {
	if args == nil {
		args = json.RawMessage("{}")
	}
	b, err := marshal(args)
	if err != nil {
		return err
	}
	_, _, raw, err := c.do(ctx, http.MethodPost, c.base+"/rest/v1/rpc/"+url.PathEscape(fn), bytes.NewReader(b), jsonHeader())
	if err != nil {
		return err
	}
	return decode(raw, out)
}

// RPCRow calls a function and decodes its first row: an array reply gives its first element,
// an object reply is the row itself, and an empty array or null is found == false.
func (c *Client) RPCRow(ctx context.Context, fn string, args any, out any) (found bool, err error) {
	var raw json.RawMessage
	if err := c.RPC(ctx, fn, args, &raw); err != nil {
		return false, err
	}
	trimmed := bytes.TrimSpace(raw)
	switch {
	case len(trimmed) == 0 || string(trimmed) == "null":
		return false, nil
	case trimmed[0] == '[':
		var rows []json.RawMessage
		if err := json.Unmarshal(trimmed, &rows); err != nil {
			return false, &Error{Message: "decoding the reply: not an array"}
		}
		if len(rows) == 0 || string(bytes.TrimSpace(rows[0])) == "null" {
			return false, nil
		}
		return true, decode(rows[0], out)
	default:
		return true, decode(trimmed, out)
	}
}

// InsertRows inserts with return=minimal. It makes the client an audit.Inserter, so
// internal/audit can write audit_event without holding the key itself.
func (c *Client) InsertRows(ctx context.Context, table string, rows any) error {
	return c.From(table).Insert(ctx, rows, nil)
}
