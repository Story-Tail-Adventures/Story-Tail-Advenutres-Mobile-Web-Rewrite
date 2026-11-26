package js

import (
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// MaxSafeInteger is Number.MAX_SAFE_INTEGER.
const MaxSafeInteger = 1<<53 - 1

// IsFinite is Number.isFinite.
func IsFinite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

// IsInteger is Number.isInteger.
func IsInteger(f float64) bool { return IsFinite(f) && f == math.Trunc(f) }

// IsSafeInteger is Number.isSafeInteger.
func IsSafeInteger(f float64) bool { return IsInteger(f) && math.Abs(f) <= MaxSafeInteger }

// Round is Math.round: halves go toward +Infinity, so Round(-2.5) is -2 where math.Round
// gives -3.
func Round(f float64) float64 {
	if !IsFinite(f) || f == math.Trunc(f) {
		return f
	}
	fl := math.Floor(f)
	if f-fl >= 0.5 {
		return fl + 1
	}
	return fl
}

var decimalLiteral = regexp.MustCompile(`^[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)$`)

// ToNumber is Number(s) for a string: surrounding whitespace ignored, "" is 0, 0x/0o/0b
// prefixes read (without a sign), "Infinity" with an optional sign, anything else NaN.
// strconv.ParseFloat alone would also take "inf", "nan", hex floats and underscores.
func ToNumber(s string) float64 {
	t := Trim(s)
	if t == "" {
		return 0
	}
	switch t {
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	if len(t) > 2 && t[0] == '0' {
		base := 0
		switch t[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			digits := t[2:]
			if strings.ContainsRune(digits, '_') {
				return math.NaN()
			}
			n, ok := new(big.Int).SetString(digits, base)
			if !ok {
				return math.NaN()
			}
			f, _ := new(big.Float).SetInt(n).Float64()
			return f
		}
	}
	if !decimalLiteral.MatchString(t) {
		return math.NaN()
	}
	f, err := strconv.ParseFloat(t, 64)
	if err != nil {
		if ne, ok := err.(*strconv.NumError); ok && ne.Err == strconv.ErrRange {
			return f // ±Inf or 0, as JavaScript gives
		}
		return math.NaN()
	}
	return f
}

// ToFixed is Number.prototype.toFixed(digits) for 0 to 100 digits. It rounds the exact
// binary value, and on an exact tie picks the larger magnitude ((0.125).toFixed(2) is
// "0.13"; strconv's half-to-even gives "0.12").
func ToFixed(f float64, digits int) string {
	if math.IsNaN(f) {
		return "NaN"
	}
	if math.Abs(f) >= 1e21 || math.IsInf(f, 0) {
		return NumberString(f)
	}
	neg := f < 0
	x := new(big.Float).SetPrec(2048).SetFloat64(math.Abs(f))
	scale := new(big.Float).SetPrec(2048).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(digits)), nil))
	x.Mul(x, scale)
	whole, _ := x.Int(nil)
	frac := new(big.Float).SetPrec(2048).Sub(x, new(big.Float).SetPrec(2048).SetInt(whole))
	if frac.Cmp(big.NewFloat(0.5)) >= 0 {
		whole.Add(whole, big.NewInt(1))
	}
	s := whole.String()
	if digits > 0 {
		if len(s) <= digits {
			s = strings.Repeat("0", digits-len(s)+1) + s
		}
		s = s[:len(s)-digits] + "." + s[len(s)-digits:]
	}
	if neg { // (-0.004).toFixed(2) is "-0.00"; -0 itself is not < 0 and stays "0.00"
		s = "-" + s
	}
	return s
}

// ISOString is Date.prototype.toISOString: UTC, always three fractional digits.
func ISOString(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

var isoDate = regexp.MustCompile(`^([+-]\d{6}|\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})?)?$`)

// ParseDate is `new Date(s)` for the ISO forms the functions build and receive, read the
// way V8 reads them: a date alone is UTC; a date-time with no offset is local time, which in
// the Edge runtime was UTC; a day past the month's end rolls over (Feb 30 is Mar 2), while
// a month outside 1-12 or a day outside 1-31 is Invalid Date. ok is false for Invalid Date,
// and for the non-ISO strings V8's legacy parser would accept ("Jan 5 2026"), which no
// function in this code base relies on.
func ParseDate(s string) (t time.Time, ok bool) {
	m := isoDate.FindStringSubmatch(s)
	if m == nil {
		return time.Time{}, false
	}
	year, _ := strconv.Atoi(m[1])
	month, day := 1, 1
	if m[2] != "" {
		month, _ = strconv.Atoi(m[2])
	}
	if m[3] != "" {
		day, _ = strconv.Atoi(m[3])
	}
	if month < 1 || month > 12 || day < 1 || day > 31 {
		return time.Time{}, false
	}
	var hour, minute, sec, nsec int
	if m[4] != "" {
		hour, _ = strconv.Atoi(m[4])
		minute, _ = strconv.Atoi(m[5])
		if m[6] != "" {
			sec, _ = strconv.Atoi(m[6])
		}
		if m[7] != "" {
			ms := (m[7] + "00")[:3] // V8 keeps milliseconds and drops the rest
			n, _ := strconv.Atoi(ms)
			nsec = n * int(time.Millisecond)
		}
		if minute > 59 || sec > 59 || hour > 24 || (hour == 24 && (minute != 0 || sec != 0 || nsec != 0)) {
			return time.Time{}, false
		}
	}
	loc := time.UTC
	if z := m[8]; z != "" && z != "Z" {
		h, _ := strconv.Atoi(z[1:3])
		mm, _ := strconv.Atoi(z[4:6])
		if h > 23 || mm > 59 {
			return time.Time{}, false
		}
		off := h*3600 + mm*60
		if z[0] == '-' {
			off = -off
		}
		loc = time.FixedZone("", off)
	}
	return time.Date(year, time.Month(month), day, hour, minute, sec, nsec, loc).UTC(), true
}
