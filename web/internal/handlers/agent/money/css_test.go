package money

import (
	"fmt"
	"io/fs"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/assets"
)

// A bar's height is DATA, and the Content-Security-Policy allows no inline style, so
// money.css carries one rule per whole percent and the handler writes `data-h`.
//
// internal/static's class-allowlist test cannot see this: it reads `.mny-bar` out of
// `.mny-bar[data-h="93"]` and is satisfied. A missing rule would not fail anything — the bar
// would simply stand at nothing, which on a commission chart reads as a month with no money
// in it. So the rules are checked here, against every value the handler can produce.

func TestEveryBarHeightHasARule(t *testing.T) {
	b, err := fs.ReadFile(assets.FS, "css/area/agent/money.css")
	if err != nil {
		t.Fatal(err)
	}
	css := string(b)
	for pct := 0; pct <= 100; pct++ {
		rule := fmt.Sprintf(`.mny-bar[data-h="%d"]`, pct)
		if !strings.Contains(css, rule) {
			t.Errorf("money.css has no rule for %s, so a bar at %d%% would stand at nothing", rule, pct)
		}
	}
}

// heightStep is what the handler actually writes, and it must never name a rule that is not
// there: dashboardMonths can hand it anything between 0 and 100 (the ratio is capped at
// 1/1.08 by value <= max, but the clamp is what the rules are promised against).
func TestHeightStepStaysInsideTheRules(t *testing.T) {
	for _, pct := range []int{-1, 0, 1, 2, 50, 93, 99, 100, 101, 1000} {
		got := heightStep(pct)
		b, err := fs.ReadFile(assets.FS, "css/area/agent/money.css")
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(b), `.mny-bar[data-h="`+got+`"]`) {
			t.Errorf("heightStep(%d) = %q, which money.css has no rule for", pct, got)
		}
	}
}
