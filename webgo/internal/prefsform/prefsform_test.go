package prefsform

import "testing"

func TestChipSlotNames(t *testing.T) {
	for in, want := range map[string]string{
		"Costa Rica":  "dest-costa-rica",  // a space is not a slot-name character
		"gluten_free": "dest-gluten-free", // nor is an underscore
		"romantic":    "dest-romantic",
	} {
		if got := ChipSlot("dest-", in); got != want {
			t.Errorf("ChipSlot(%q) = %q, want %q", in, got, want)
		}
	}
}
