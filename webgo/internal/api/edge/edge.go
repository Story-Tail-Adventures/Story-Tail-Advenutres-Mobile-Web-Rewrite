// Package edge is the frame every ported Edge Function runs in: what Deno.serve,
// _shared/cors.ts, _shared/problem.ts and _shared/auth.ts gave the TypeScript versions.
//
// A port is a Func that returns a Reply or an error. Serve turns that into exactly the
// response the Deno function wrote: JSON.stringify bytes with the CORS headers, or
// application/problem+json {type, title, status, detail}, where a 500 never carries a
// detail and its real cause goes to the log (as a label, never a value: see logLabel).
//
// Gates run before the Func (internal/api's registry applies them): a user route has had its
// bearer token accepted by GoTrue before any handler code runs, because Go has no Supabase
// gateway doing verify_jwt in front of it.
package edge

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Deps are what a ported function may use.
type Deps struct {
	// DB is the service-role client: every read and write the Deno function made through
	// serviceClient() goes through it. RLS checks nothing on it.
	DB *service.Client
	// Auth asks GoTrue who a token belongs to (anon key + the caller's token).
	Auth *supa.Client
	Log  *slog.Logger
	// Now is the clock (tests pin it).
	Now func() time.Time
	// Env reads an integration secret, as Deno.env.get did, at request time. A missing
	// secret must fail its function closed, never open.
	Env func(string) string
	// AllowedOrigin is ALLOWED_ORIGIN for the CORS headers (http://localhost:3000 unset).
	AllowedOrigin string
}

// Reply is a successful response.
type Reply struct {
	Status int
	Body   any // marshalled with js.Marshal; nil writes no body
	Header http.Header
}

// OK is a 200 with a JSON body.
func OK(body any) (*Reply, error) { return &Reply{Status: http.StatusOK, Body: body}, nil }

// Func is one ported function.
type Func func(d *Deps, r *http.Request) (*Reply, error)

// CORS sets the headers _shared/cors.ts's buildCorsHeaders set on every reply.
func CORS(h http.Header, origin string) {
	if origin == "" {
		origin = "http://localhost:3000"
	}
	h.Set("Access-Control-Allow-Origin", origin)
	h.Set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type")
	h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
	h.Set("Access-Control-Max-Age", "86400")
	h.Set("Vary", "Origin")
}

// Preflight answers OPTIONS with 204 and the CORS headers, as handlePreflight did.
func Preflight(w http.ResponseWriter, origin string) {
	CORS(w.Header(), origin)
	w.WriteHeader(http.StatusNoContent)
}

// Serve runs f and writes its reply or its error. OPTIONS never reaches f.
func Serve(d *Deps, name string, f Func) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			Preflight(w, d.AllowedOrigin)
			return
		}
		reply, err := f(d, r)
		if err != nil {
			WriteProblem(w, d.Log, name, d.AllowedOrigin, err)
			return
		}
		WriteJSON(w, d.Log, name, d.AllowedOrigin, reply)
	})
}

// WriteJSON writes a reply as `new Response(JSON.stringify(body), { status, headers })`.
func WriteJSON(w http.ResponseWriter, log *slog.Logger, name, origin string, reply *Reply) {
	var body []byte
	if reply.Body != nil {
		b, err := js.Marshal(reply.Body)
		if err != nil {
			WriteProblem(w, log, name, origin, err)
			return
		}
		body = b
	}
	h := w.Header()
	CORS(h, origin)
	h.Set("Content-Type", "application/json")
	for k, v := range reply.Header {
		h[k] = v
	}
	status := reply.Status
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// WriteProblem is problem(err). A *problem.Error answers with its status, title and detail
// (no detail key when the detail is empty). Anything else is a bare 500, logged by label.
func WriteProblem(w http.ResponseWriter, log *slog.Logger, name, origin string, err error) {
	h := w.Header()
	CORS(h, origin)
	h.Set("Content-Type", "application/problem+json")
	p, ok := problem.As(err)
	if !ok {
		log.Error("unhandled error in function", append([]any{"function", name}, logLabel(err)...)...)
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"type":"about:blank","title":"Internal Server Error","status":500}`))
		return
	}
	for k, v := range p.Header {
		h[k] = v
	}
	o := js.O("type", "about:blank", "title", p.Title, "status", p.Status)
	if p.Detail != "" {
		o = append(o, js.Field{Key: "detail", Value: p.Detail})
	}
	b, _ := js.Marshal(o)
	w.WriteHeader(p.Status)
	_, _ = w.Write(b)
}

// logLabel is what a 500 logs: our own wrap prefix (the text before the first ": ", which
// a port writes itself, like "trip notes write failed") and, for a database error, its code
// and status. Never the rest of the message: Postgres quotes input values in its messages
// ("invalid input syntax for type uuid: \"...\""), and a log line must never carry a body,
// an address, a name or message text.
func logLabel(err error) []any {
	msg := err.Error()
	label, _, _ := strings.Cut(msg, ": ")
	if len(label) > 120 {
		label = label[:120]
	}
	out := []any{"error", label}
	var se *service.Error
	for e := err; e != nil; {
		if s, ok := e.(*service.Error); ok {
			se = s
			break
		}
		u, ok := e.(interface{ Unwrap() error })
		if !ok {
			break
		}
		e = u.Unwrap()
	}
	if se != nil {
		out = append(out, "db_code", se.Code, "db_status", se.Status)
	}
	return out
}

// maxBody is what a function will read from a request. JSON bodies are small; files go to
// Storage by signed URL. A bigger body is refused as unreadable, as a parse failure was.
const maxBody = 5 << 20

// Body reads the request body (up to maxBody).
func Body(r *http.Request) ([]byte, error) {
	if r.Body == nil {
		return nil, nil
	}
	return io.ReadAll(io.LimitReader(r.Body, maxBody))
}

// ReadObject is readJson: the body must be a JSON object, or a 400 with the module's own
// sentence. trip.ts said "Send a JSON object."; onboarding.ts said "Expected a JSON object.".
func ReadObject(r *http.Request, detail string) (js.Value, error) {
	b, err := Body(r)
	if err != nil {
		return js.Value{}, problem.BadRequest(detail)
	}
	v, err := js.ParseObject(b)
	if err != nil {
		return js.Value{}, problem.BadRequest(detail)
	}
	return v, nil
}

// The two readJson sentences.
const (
	SendJSONObject     = "Send a JSON object."     // _shared/trip.ts
	ExpectedJSONObject = "Expected a JSON object." // _shared/onboarding.ts
)

type ctxKey int

const (
	verifiedKey ctxKey = iota
	inProcessKey
)

// InProcess marks a request made by the web server itself through registry.Call, never by
// the HTTP door. cruise-search trusts it in place of the search token the web server used to
// send over the internet.
func InProcess(ctx context.Context) bool { v, _ := ctx.Value(inProcessKey).(bool); return v }

// WithInProcess marks ctx as an in-process call. Only internal/api's registry calls it.
func WithInProcess(ctx context.Context) context.Context {
	return context.WithValue(ctx, inProcessKey, true)
}
