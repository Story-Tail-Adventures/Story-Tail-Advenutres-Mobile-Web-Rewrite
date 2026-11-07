package edge

import (
	"crypto/sha256"
	"crypto/subtle"
)

// constantTimeEqual compares two secrets in constant time. Hashing first makes the time
// independent of the lengths too, which subtle.ConstantTimeCompare alone is not.
func constantTimeEqual(a, b string) bool {
	ha, hb := sha256.Sum256([]byte(a)), sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(ha[:], hb[:]) == 1
}
