package message

import (
	"crypto/rand"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Ported from supabase/functions/_shared/message_test.ts, one Go test per Deno.test.

const (
	a = "0195a2c0-1a00-7000-8000-0000000000b0"
	c = "0195a2c0-1a00-7000-8000-000000000101"
	t = "0195a2c0-1a00-7000-8000-000000000040"
)

func str(s string) js.Value { return js.StringValue(s) }

func obj(kv ...any) js.Value { return js.ObjectValue(kv...) }

// mustBadRequest is assertThrows(fn, HttpError) for the 400s these readers throw.
func mustBadRequest(tb testing.TB, err error, what string) {
	tb.Helper()
	p, ok := problem.As(err)
	if !ok {
		tb.Fatalf("%s: want an HttpError, got %v", what, err)
	}
	if p.Status != 400 {
		tb.Fatalf("%s: want 400, got %d (%s)", what, p.Status, p.Detail)
	}
}

func noErr(tb testing.TB, err error, what string) {
	tb.Helper()
	if err != nil {
		tb.Fatalf("%s: unexpected error %v", what, err)
	}
}

// randomV4 is crypto.randomUUID(): a version 4 id, which readMessageId must refuse.
func randomV4() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// Deno.test("readMessageBody: trimmed, not empty, under the ceiling")
func TestReadMessageBodyTrimmedNotEmptyUnderTheCeiling(tt *testing.T) {
	got, err := ReadMessageBody(str("  hello  "))
	noErr(tt, err, "hello")
	if got != "hello" {
		tt.Errorf("got %q", got)
	}
	got, err = ReadMessageBody(str(strings.Repeat("x", MaxMessageBody)))
	noErr(tt, err, "at the ceiling")
	if js.Len(got) != MaxMessageBody {
		tt.Errorf("length %d", js.Len(got))
	}
	for _, v := range []js.Value{str("   "), js.UndefinedValue(), js.NumberValue(42), str(strings.Repeat("x", MaxMessageBody+1))} {
		_, err := ReadMessageBody(v)
		mustBadRequest(tt, err, fmt.Sprint(v))
	}
}

// Deno.test("readThreadAddress: a thread, or a client with an optional trip, never both")
func TestReadThreadAddressAThreadOrAClientNeverBoth(tt *testing.T) {
	got, err := ReadThreadAddress(obj("conversationId", str(a)))
	noErr(tt, err, "thread")
	if got != (ThreadAddress{Kind: KindThread, ConversationID: a}) {
		tt.Errorf("thread: got %+v", got)
	}
	got, err = ReadThreadAddress(obj("clientId", str(c)))
	noErr(tt, err, "client")
	if got.Kind != KindClient || got.ClientID != c || got.TripID != nil || got.ConversationID != "" {
		tt.Errorf("client: got %+v", got)
	}
	got, err = ReadThreadAddress(obj("clientId", str(c), "tripId", str(t)))
	noErr(tt, err, "client and trip")
	if got.Kind != KindClient || got.ClientID != c || got.TripID == nil || *got.TripID != t {
		tt.Errorf("client and trip: got %+v", got)
	}
	got, err = ReadThreadAddress(obj("conversationId", str(a), "clientId", js.NullValue(), "tripId", js.NullValue()))
	noErr(tt, err, "thread with nulls")
	if got.Kind != KindThread {
		tt.Errorf("thread with nulls: got %+v", got)
	}
	for i, payload := range []js.Value{
		obj("conversationId", str(a), "clientId", str(c)),
		obj("conversationId", str(a), "tripId", str(t)),
		obj(),
		obj("conversationId", str("nope")),
		obj("clientId", str(c), "tripId", str("nope")),
	} {
		_, err := ReadThreadAddress(payload)
		mustBadRequest(tt, err, fmt.Sprint("case ", i))
	}
}

// Deno.test("readMessageId: required, a recent v7")
func TestReadMessageIDRequiredARecentV7(tt *testing.T) {
	now := time.Now()
	fresh := uuid.NewAt(now)
	got, err := ReadMessageID(str(fresh), now)
	noErr(tt, err, "fresh")
	if got != fresh {
		tt.Errorf("got %q", got)
	}
	for _, v := range []js.Value{
		js.UndefinedValue(),
		js.NullValue(),
		str(a),          // v7, but from 2025
		str(randomV4()), // v4
		js.NumberValue(7),
	} {
		_, err := ReadMessageID(v, now)
		mustBadRequest(tt, err, fmt.Sprint(v))
	}
}

// Deno.test("readInternalNote: a boolean, never defaulted")
func TestReadInternalNoteABooleanNeverDefaulted(tt *testing.T) {
	for _, want := range []bool{true, false} {
		got, err := ReadInternalNote(js.BoolValue(want))
		noErr(tt, err, fmt.Sprint(want))
		if got != want {
			tt.Errorf("got %v want %v", got, want)
		}
	}
	// Missing is NOT "public": that default is how a private note would reach the client.
	for _, v := range []js.Value{js.UndefinedValue(), js.NullValue(), str("true"), js.NumberValue(1)} {
		_, err := ReadInternalNote(v)
		mustBadRequest(tt, err, fmt.Sprint(v))
	}
}

// Deno.test("readSeenUpTo: PostgREST's timestamp, kept as text to the microsecond")
func TestReadSeenUpToKeptAsTextToTheMicrosecond(tt *testing.T) {
	pg := "2026-10-13T14:02:11.123456+00:00"
	for _, tc := range []struct {
		in       js.Value
		required bool
		want     *string
	}{
		{str(pg), true, &pg},
		{str("2026-10-13T14:02:11Z"), true, ptr("2026-10-13T14:02:11Z")},
		{str("2026-10-13 14:02:11.5+00"), false, ptr("2026-10-13 14:02:11.5+00")},
		{js.UndefinedValue(), false, nil},
		{js.NullValue(), false, nil},
	} {
		got, err := ReadSeenUpTo(tc.in, tc.required)
		noErr(tt, err, fmt.Sprint(tc.in))
		if (got == nil) != (tc.want == nil) || (got != nil && *got != *tc.want) {
			tt.Errorf("%v: got %v want %v", tc.in, deref(got), deref(tc.want))
		}
	}
	_, err := ReadSeenUpTo(js.UndefinedValue(), true)
	mustBadRequest(tt, err, "missing but required")
	for _, v := range []js.Value{
		str("yesterday"),
		str("2026-10-13T14:02:11"), // no zone
		str("2026-13-45T14:02:11Z"),
		js.NumberValue(1760364131000),
	} {
		_, err := ReadSeenUpTo(v, false)
		mustBadRequest(tt, err, fmt.Sprint(v))
	}
}

// Deno.test("readConversationIds: at least one, at most the cap, repeats folded")
func TestReadConversationIDsAtLeastOneAtMostTheCapRepeatsFolded(tt *testing.T) {
	got, err := ReadConversationIDs(js.ArrayValue(str(a), str(strings.ToUpper(a))))
	noErr(tt, err, "repeat")
	if !slices.Equal(got, []string{a}) {
		tt.Errorf("got %v", got)
	}
	for _, v := range []js.Value{js.ArrayValue(), str(a), js.ArrayValue(str("nope"))} {
		_, err := ReadConversationIDs(v)
		mustBadRequest(tt, err, fmt.Sprint(v))
	}
	tooMany := make([]js.Value, MaxArchive+1)
	for i := range tooMany {
		tooMany[i] = str(uuid.New())
	}
	_, err = ReadConversationIDs(js.ArrayValue(tooMany...))
	mustBadRequest(tt, err, "too many")
}

func ptr(s string) *string { return &s }

func deref(p *string) string {
	if p == nil {
		return "<null>"
	}
	return *p
}
