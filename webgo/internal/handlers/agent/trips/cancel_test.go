package trips

import (
	"regexp"
	"strings"
	"testing"
)

// Ported from web/lib/agent/cancelTrip.test.ts, plus content.ts's cancelReceipt and
// cancelLinesCheckbox and TEMPLATE_COPY.savedReceipt.

func base() *overview {
	return &overview{totalCommission: "$0", totalPaidLabel: "$0", componentCount: 0}
}

func TestRefundVocabulary(t *testing.T) {
	var got []string
	for _, s := range refundStatuses {
		got = append(got, s.value)
	}
	if strings.Join(got, ",") != "none_expected,pending,partial,full" {
		t.Errorf("vocabulary = %v", got)
	}
	// "not stated" is NULL, never a fifth status.
	if isRefundStatus("") {
		t.Error(`"" is a refund status`)
	}
	if refundStatusLabel("partial") != "Partial" || refundStatusLabel("") != "" {
		t.Error("labels")
	}
	// The prose the column held before it had a vocabulary is not echoed as a label.
	if refundStatusLabel("Refunded $1,640 on Feb 12") != "" {
		t.Error("free text echoed as a label")
	}
}

func TestCancelImpact(t *testing.T) {
	if lines := cancelImpact(base()); len(lines) != 0 {
		t.Errorf("a trip with nothing attached says %v", lines)
	}
	ov := base()
	ov.totalCommission = "$1,318"
	lines := cancelImpact(ov)
	if len(lines) != 1 || !strings.Contains(lines[0].text, "$1,318") || !strings.Contains(strings.ToLower(lines[0].text), "forecast") {
		t.Errorf("commission line = %v", lines)
	}
	ov = base()
	ov.totalPaidLabel = "$2,560"
	lines = cancelImpact(ov)
	if len(lines) != 1 || !lines[0].warn || !strings.Contains(lines[0].text, "$2,560") || !strings.Contains(lines[0].text, "does not move money") {
		t.Errorf("paid line = %v", lines)
	}
	// Never a card line, never an invented supplier fee.
	ov = base()
	ov.totalPaidLabel, ov.totalCommission, ov.componentCount = "$2,560", "$1,318", 6
	card := regexp.MustCompile(`(?i)\bcard\b|authoriz|cancellation fee`)
	for _, l := range cancelImpact(ov) {
		if card.MatchString(l.text) {
			t.Errorf("impact line mentions a card or a fee: %q", l.text)
		}
	}
	ov = base()
	ov.componentCount = 6
	if l := cancelImpact(ov); len(l) != 1 || l[0].text != "6 booked items stay on the trip. Cancelling here does not tell any supplier." {
		t.Errorf("6 items = %v", l)
	}
	ov.componentCount = 1
	if l := cancelImpact(ov); len(l) != 1 || l[0].text != "1 booked item stays on the trip. Cancelling here does not tell any supplier." {
		t.Errorf("1 item = %v", l)
	}
	// A formatted label is read for non-zero digits, never re-parsed.
	for label, want := range map[string]int{"$1,000": 1, "$0": 0, "$0.00": 0, "—": 0} {
		ov = base()
		ov.totalPaidLabel = label
		if got := len(cancelImpact(ov)); got != want {
			t.Errorf("paid %q gives %d lines, want %d", label, got, want)
		}
	}
}

func TestCancelReceiptAndCheckbox(t *testing.T) {
	if cancelLinesCheckbox(1) != "Mark this line as Lost" || cancelLinesCheckbox(2) != "Mark these 2 lines as Lost" {
		t.Error("checkbox")
	}
	cases := []struct {
		cancelled              bool
		named, closed, skipped int
		want                   string
	}{
		{true, 0, 0, 0, ""},
		{true, 2, 2, 0, "Trip cancelled. 2 commission lines marked Lost."},
		{false, 1, 1, 0, "Details saved. 1 commission line marked Lost."},
		{true, 3, 1, 1, "Trip cancelled. 1 commission line marked Lost. 1 line changed since the page loaded, so it was left alone. We couldn't confirm 1 line was marked Lost. Check it in the ledger."},
		{true, 4, 0, 2, "Trip cancelled. 2 lines changed since the page loaded, so they were left alone. We couldn't confirm 2 lines were marked Lost. Check them in the ledger."},
	}
	for _, c := range cases {
		if got := cancelReceipt(c.cancelled, c.named, c.closed, c.skipped); got != c.want {
			t.Errorf("cancelReceipt(%v,%d,%d,%d) = %q, want %q", c.cancelled, c.named, c.closed, c.skipped, got, c.want)
		}
	}
	if savedReceipt(6, 4) != "Saved. 6 bookings and 4 days captured." || savedReceipt(1, 0) != "Saved. 1 booking captured." {
		t.Error("savedReceipt")
	}
}

func TestDetailFormatting(t *testing.T) {
	for in, want := range map[int64]string{512: "512 B", 245760: "240 KB", 1536: "2 KB", 5 * 1024 * 1024: "5.0 MB"} {
		if got := sizeLabel(in); got != want {
			t.Errorf("sizeLabel(%d) = %q, want %q", in, got, want)
		}
	}
	for in, want := range map[string]string{"15:00:00": "15:00", "09:30": "09:30", "": ""} {
		if got := hhmm(in); got != want {
			t.Errorf("hhmm(%q) = %q", in, got)
		}
	}
	chicago := zone("America/Chicago")
	// 00:30Z on the 8th is the evening of the 7th in Chicago.
	if got := localDate("2026-09-08T00:30:00+00:00", chicago); got != "2026-09-07" {
		t.Errorf("localDate = %q", got)
	}
	if got := localDate("2026-09-08T00:30:00.123456+00:00", chicago); got != "2026-09-07" {
		t.Errorf("localDate (micro) = %q", got)
	}
	for kind, icon := range map[string]string{"flight": "plane", "hotel": "building", "custom": "receipt", "zeppelin": "receipt"} {
		if componentKindIcon(kind) != icon {
			t.Errorf("icon(%s)", kind)
		}
	}
}
