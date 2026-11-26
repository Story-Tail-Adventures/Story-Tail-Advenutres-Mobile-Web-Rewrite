package uuid

import (
	"errors"
	"sort"
	"strings"
	"testing"
	"time"
)

func TestNewAtLayout(t *testing.T) {
	at := time.UnixMilli(1_762_000_000_123) // 2025-11-01, an arbitrary fixed instant
	id := NewAt(at)

	if len(id) != 36 {
		t.Fatalf("len = %d, want 36: %s", len(id), id)
	}
	for _, i := range []int{8, 13, 18, 23} {
		if id[i] != '-' {
			t.Fatalf("no dash at %d: %s", i, id)
		}
	}
	if id[14] != '7' {
		t.Errorf("version nibble = %c, want 7: %s", id[14], id)
	}
	if !strings.ContainsRune("89ab", rune(id[19])) {
		t.Errorf("variant nibble = %c, want one of 89ab: %s", id[19], id)
	}
	if id != strings.ToLower(id) {
		t.Errorf("not lower case: %s", id)
	}
	if !IsV7(id) || !IsUUID(id) {
		t.Errorf("own output not recognised: %s", id)
	}

	got, err := Timestamp(id)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Equal(at) {
		t.Errorf("Timestamp = %v, want %v", got, at)
	}
}

func TestNewIsUniqueAndSortsByTime(t *testing.T) {
	seen := make(map[string]bool)
	var ids []string
	base := time.UnixMilli(1_762_000_000_000)
	for i := range 2000 {
		id := NewAt(base.Add(time.Duration(i) * time.Millisecond))
		if seen[id] {
			t.Fatalf("duplicate id %s", id)
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if !sort.StringsAreSorted(ids) {
		t.Error("ids minted in time order do not sort in time order")
	}
}

func TestShapes(t *testing.T) {
	cases := []struct {
		in       string
		v7, uuid bool
	}{
		{"018f3e5c-9b7a-7c1d-8e2f-0123456789ab", true, true},
		{"018F3E5C-9B7A-7C1D-BE2F-0123456789AB", true, true},  // upper case is accepted
		{"018f3e5c-9b7a-4c1d-8e2f-0123456789ab", false, true}, // v4: a uuid, not a v7
		{"018f3e5c-9b7a-7c1d-ce2f-0123456789ab", false, true}, // wrong variant
		{"018f3e5c9b7a7c1d8e2f0123456789ab", false, false},    // no dashes
		{"018f3e5c-9b7a-7c1d-8e2f-0123456789a", false, false}, // short
		{"banana", false, false},
		{"", false, false},
		{" 018f3e5c-9b7a-7c1d-8e2f-0123456789ab", false, false},
	}
	for _, c := range cases {
		if got := IsV7(c.in); got != c.v7 {
			t.Errorf("IsV7(%q) = %v, want %v", c.in, got, c.v7)
		}
		if got := IsUUID(c.in); got != c.uuid {
			t.Errorf("IsUUID(%q) = %v, want %v", c.in, got, c.uuid)
		}
	}
}

func TestCheckRecent(t *testing.T) {
	now := time.UnixMilli(1_762_000_000_000)
	cases := []struct {
		name string
		id   string
		want error
	}{
		{"now", NewAt(now), nil},
		{"59 minutes old", NewAt(now.Add(-59 * time.Minute)), nil},
		{"exactly an hour old", NewAt(now.Add(-time.Hour)), nil},
		{"61 minutes old", NewAt(now.Add(-61 * time.Minute)), ErrTooOld},
		{"a week old", NewAt(now.Add(-7 * 24 * time.Hour)), ErrTooOld},
		{"59 minutes ahead", NewAt(now.Add(59 * time.Minute)), nil},
		{"61 minutes ahead", NewAt(now.Add(61 * time.Minute)), ErrInFuture},
		{"a v4", "018f3e5c-9b7a-4c1d-8e2f-0123456789ab", ErrNotV7},
		{"garbage", "banana", ErrNotV7},
	}
	for _, c := range cases {
		if got := CheckRecent(c.id, now); !errors.Is(got, c.want) {
			t.Errorf("%s: CheckRecent = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestTimestampUpperCase(t *testing.T) {
	at := time.UnixMilli(1_762_000_000_456)
	id := strings.ToUpper(NewAt(at))
	got, err := Timestamp(id)
	if err != nil || !got.Equal(at) {
		t.Errorf("Timestamp(%s) = %v, %v; want %v", id, got, err, at)
	}
}
