//go:build difftest

package difftest

import (
	"net/http"
	"strings"
	"testing"
)

// The harness against itself: fixtures sign in at the right assurance level, and a function
// that is NOT ported answers the same through the Go door (pass-through) as from Deno.
func TestHarnessSmoke(t *testing.T) {
	deno, goW := NewWorlds(t)
	for _, w := range []*World{deno, goW} {
		claims := strings.Split(w.Agent.Token, ".")
		if len(claims) != 3 {
			t.Fatalf("%s agent token is not a JWT", w.Name)
		}
	}
	Run(t, deno, goW, []Case{
		{
			Name: "no token", Fn: "agent-trip-notes", PassThrough: true, Token: func(*World) string { return "" },
			Body: func(*World) string { return `{}` },
		},
		{
			Name: "not a trip id", Fn: "agent-trip-notes", PassThrough: true, Expect: http.StatusBadRequest,
			Body: func(*World) string { return `{"tripId":"banana","notes":"x","expectedVersion":1}` },
		},
		{
			Name: "traveler on the agent side", Fn: "agent-trip-notes", PassThrough: true, Expect: http.StatusForbidden,
			Token: func(w *World) string { return w.Traveler.Token },
			Body:  func(*World) string { return `{}` },
		},
	})
}
