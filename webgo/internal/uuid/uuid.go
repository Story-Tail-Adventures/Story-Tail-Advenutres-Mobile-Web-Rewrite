// Package uuid mints and checks UUID v7 ids (CLAUDE.md rule 6, docs/Data-Model.md §21.6).
//
// It ports web/lib/uuid.ts and supabase/functions/_shared/uuid.ts. v7 puts a 48-bit
// millisecond timestamp in the high bits, so ids sort by creation time and B-tree inserts
// stay at the right edge of the index. Layout (RFC 9562):
//
//	0-5   48-bit big-endian milliseconds since the Unix epoch
//	6     version nibble (7) + 4 random bits
//	7     8 random bits
//	8     variant bits (10) + 6 random bits
//	9-15  56 random bits
//
// The client mints the id so a retried write is safe: the second attempt carries the same
// id and the backend sees a duplicate, not a second row.
package uuid

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"regexp"
	"time"
)

// New returns a UUID v7 for the current time.
func New() string { return NewAt(time.Now()) }

// NewAt returns a UUID v7 carrying t, to the millisecond.
func NewAt(t time.Time) string {
	var b [16]byte
	// crypto/rand, never math/rand: these are primary keys, and a collision is a lost write.
	// Since Go 1.24 Read never returns an error (it crashes the program instead).
	_, _ = rand.Read(b[:])

	ms := uint64(t.UnixMilli())
	b[0] = byte(ms >> 40)
	b[1] = byte(ms >> 32)
	b[2] = byte(ms >> 24)
	b[3] = byte(ms >> 16)
	b[4] = byte(ms >> 8)
	b[5] = byte(ms)

	b[6] = b[6]&0x0f | 0x70 // version 7
	b[8] = b[8]&0x3f | 0x80 // variant 10

	var out [36]byte
	hex.Encode(out[0:8], b[0:4])
	out[8] = '-'
	hex.Encode(out[9:13], b[4:6])
	out[13] = '-'
	hex.Encode(out[14:18], b[6:8])
	out[18] = '-'
	hex.Encode(out[19:23], b[8:10])
	out[23] = '-'
	hex.Encode(out[24:36], b[10:16])
	return string(out[:])
}

var (
	v7Shape  = regexp.MustCompile(`^(?i)[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	anyShape = regexp.MustCompile(`^(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

// IsV7 reports whether id is shaped like a UUID v7 (any letter case).
func IsV7(id string) bool { return v7Shape.MatchString(id) }

// IsUUID reports whether value is shaped like any UUID. Use it for ids the client echoes
// back (a trip id minted weeks ago), where a recency check would wrongly refuse; the point
// is only to keep non-uuids away from Postgres, which would otherwise raise a 500.
func IsUUID(value string) bool { return anyShape.MatchString(value) }

// Timestamp returns the time embedded in a UUID v7.
func Timestamp(id string) (time.Time, error) {
	if !IsV7(id) {
		return time.Time{}, ErrNotV7
	}
	var ms int64
	for _, c := range id[0:8] + id[9:13] {
		ms = ms<<4 | int64(hexValue(byte(c)))
	}
	return time.UnixMilli(ms), nil
}

func hexValue(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	default: // 'A'..'F'; IsV7 has already refused anything else
		return c - 'A' + 10
	}
}

// The window in both directions, per Data-Model §21.6 ("within the last hour"). An earlier
// draft of the Deno version used 24 hours, which quietly widened the documented window.
const (
	MaxAge  = time.Hour
	MaxSkew = time.Hour
)

var (
	// ErrNotV7 means the value is not a UUID v7 at all.
	ErrNotV7 = errors.New("not a UUID v7")
	// ErrTooOld means the embedded timestamp is more than MaxAge before now.
	ErrTooOld = errors.New("UUID v7 timestamp is more than an hour old")
	// ErrInFuture means the embedded timestamp is more than MaxSkew after now.
	ErrInFuture = errors.New("UUID v7 timestamp is more than an hour in the future")
)

// CheckRecent refuses a client-minted id whose timestamp is implausible, the Go port of
// assertRecentUuidV7. It is a sanity check against clock skew and replayed ids, not a
// security control: a caller can always forge a fresh timestamp. RLS and the audit trail
// are the real defence.
func CheckRecent(id string, now time.Time) error {
	ts, err := Timestamp(id)
	if err != nil {
		return err
	}
	delta := now.Sub(ts)
	if delta > MaxAge {
		return ErrTooOld
	}
	if delta < -MaxSkew {
		return ErrInFuture
	}
	return nil
}
