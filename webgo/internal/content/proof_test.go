package content

import (
	"regexp"
	"slices"
	"strings"
	"testing"
)

// Ports of web/content/public/proof.test.ts.

// expectedUnverified is the point of this file: adding a placeholder claim, or verifying
// one, must show up as a diff here as well as in data/proof.json.
var expectedUnverified = []string{
	"travelersServed",
	"ratingValue",
	"reviewCount",
	"avgReplyTime",
	"yearsSpecialist",
	"credInteletravel",
	"credClia",
	"credSandals",
	"credRoyal",
	"bioParent",
	"bioIslands",
	"bioStarted",
	"bioNamed",
	"plannedRoyalBahamian",
	"catalogUpdatedMonthly",
	"sailsEachLineYearly",
	"replyWithin48h",
	"islandsPlannedAll",
	"tripDetails",
	// Live hotel rates. Unverified on purpose: a strict production build must refuse to ship
	// a public price claim until a human has approved the wording (Free-Travel-APIs §9.2).
	"hotelRateBasis",
}

func TestPinsExactlyWhichClaimsAreUnverified(t *testing.T) {
	c := Get()
	if got := c.PlaceholderReport().Claims; !slices.Equal(got, expectedUnverified) {
		t.Errorf("unverified claims = %v\nwant %v", got, expectedUnverified)
	}
	// The TypeScript compared CLAIM_IDS with the registry's keys; here the ids must be unique.
	ids := map[string]bool{}
	for _, cl := range c.Claims {
		if ids[cl.ID] {
			t.Errorf("claim %q is listed twice", cl.ID)
		}
		ids[cl.ID] = true
	}
}

func TestVerifiedClaimsNeedASourceAndDate(t *testing.T) {
	for _, cl := range Get().Claims {
		if !cl.Verified {
			continue
		}
		if cl.Source == nil || *cl.Source == "" {
			t.Errorf("%s needs a source", cl.ID)
		}
		if cl.VerifiedOn == nil || !isoDate.MatchString(*cl.VerifiedOn) {
			t.Errorf("%s needs a verifiedOn date", cl.ID)
		}
	}
}

func TestReportsEveryPlaceholderClass(t *testing.T) {
	c := Get()
	r := c.PlaceholderReport()
	if !HasPlaceholders(r) {
		t.Error("HasPlaceholders = false")
	}
	if r.Testimonials != len(c.Testimonials) {
		t.Errorf("testimonials = %d, want %d", r.Testimonials, len(c.Testimonials))
	}
	if len(r.UnlicensedImages) == 0 {
		t.Error("no unlicensed images reported")
	}
	if want := []LegalSlug{"privacy", "terms", "cookies", "accessibility"}; !slices.Equal(r.DraftLegal, want) {
		t.Errorf("draft legal = %v, want %v", r.DraftLegal, want)
	}
	if len(r.PlaceholderPrices) == 0 {
		t.Error("no placeholder prices reported")
	}
}

func TestOnlyStrictModeBlocks(t *testing.T) {
	c := Get()
	if err := c.AssertProductionReady(""); err != nil {
		t.Errorf("no mode: %v", err)
	}
	err := c.AssertProductionReady("strict")
	if err == nil || !strings.Contains(err.Error(), "placeholder content") {
		t.Fatalf("strict: %v, want a placeholder content error", err)
	}
	lines := strings.Split(err.Error(), "\n")
	if first, last := lines[0], lines[len(lines)-1]; first != "PUBLIC_CLAIMS_MODE=strict: the public pages still contain placeholder content." ||
		last != "See web/content/public/proof.ts." {
		t.Errorf("strict message lines:\n%s", err)
	}
	if err := assertReady("strict", PlaceholderReport{}); err != nil {
		t.Errorf("strict with a clean report: %v", err)
	}
}

func TestStrictMessageListsOnlyWhatIsLeft(t *testing.T) {
	err := assertReady("strict", PlaceholderReport{Testimonials: 2, PlaceholderPrices: []string{"a", "b", "c"}})
	want := "PUBLIC_CLAIMS_MODE=strict: the public pages still contain placeholder content.\n" +
		"  testimonials without consent: 2\n" +
		"  placeholder prices: 3 trips\n" +
		"See web/content/public/proof.ts."
	if err == nil || err.Error() != want {
		t.Errorf("got  %v\nwant %s", err, want)
	}
}

func TestAdvisorCopyUsesHeHim(t *testing.T) {
	c := Get()
	if c.Advisor.Pronouns != "he/him" {
		t.Errorf("pronouns = %q", c.Advisor.Pronouns)
	}
	if regexp.MustCompile(`(?i)\bmom\b`).MatchString(c.AdvisorHeroLine()) {
		t.Errorf("hero line says mom: %q", c.AdvisorHeroLine())
	}
	sheHer := regexp.MustCompile(`(?i)\b(she|her|hers)\b`)
	initials := regexp.MustCompile(`^[A-Z]{2}$`)
	for _, tm := range c.Testimonials {
		if sheHer.MatchString(tm.Quote) {
			t.Errorf("%s: quote uses she/her", tm.Who)
		}
		if tm.Consented {
			t.Errorf("%s: consented, but no consent has been collected yet", tm.Who)
		}
		if !initials.MatchString(tm.Initials) {
			t.Errorf("%s: initials %q", tm.Who, tm.Initials)
		}
	}
}

func TestSentencesBuiltFromClaims(t *testing.T) {
	c := Get()
	if got := c.TrustLine(); !strings.Contains(got, c.Claim("ratingValue")+"★ from "+c.Claim("reviewCount")+" travelers") {
		t.Errorf("TrustLine = %q", got)
	}
	if got := c.AdvisorHeroLine(); !strings.HasPrefix(got, "Caribbean specialist, "+c.Claim("bioParent")+", ") {
		t.Errorf("AdvisorHeroLine = %q", got)
	}
}

func TestClaimLookups(t *testing.T) {
	c := Get()
	if cl, ok := c.ClaimEntry("credClia"); !ok || cl.Display != "CLIA Member" {
		t.Errorf("ClaimEntry(credClia) = %+v, %v", cl, ok)
	}
	if _, ok := c.ClaimEntry("nope"); ok {
		t.Error("ClaimEntry found a claim that does not exist")
	}
	defer func() {
		if recover() == nil {
			t.Error("Claim with an unknown id did not panic")
		}
	}()
	c.Claim("nope")
}
