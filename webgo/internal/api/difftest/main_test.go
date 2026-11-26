//go:build difftest

package difftest

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	if !Setup() {
		os.Exit(0)
	}
	code := m.Run()
	S.Go.Close()
	os.Exit(code)
}
