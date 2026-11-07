package agentclient

import (
	"strings"
	"unicode"
)

// JavaScript's toLowerCase and toUpperCase where they differ from Go's per-character
// mapping (js.ToLower / js.ToUpper). Private here rather than a change to internal/domain/js,
// which other ports depend on. Tags are lower-cased and folded by the result, and a country
// is upper-cased into a char(2) column, so a difference would change what is stored (or turn
// a refusal into a write).

// lowerJS is toLowerCase: "İ" (U+0130) becomes "i" plus a combining dot, and a capital
// sigma at the end of a word becomes the final form "ς". Everything else is Go's mapping.
func lowerJS(s string) string {
	ascii := true
	for i := 0; i < len(s); i++ {
		if s[i] >= 0x80 {
			ascii = false
			break
		}
	}
	if ascii {
		return strings.ToLower(s)
	}
	rs := []rune(s)
	var b strings.Builder
	for i, r := range rs {
		switch r {
		case 0x130:
			b.WriteString("i\U00000307")
		case 0x3a3:
			if finalSigma(rs, i) {
				b.WriteRune(0x3c2)
			} else {
				b.WriteRune(0x3c3)
			}
		default:
			b.WriteRune(unicode.ToLower(r))
		}
	}
	return b.String()
}

// finalSigma is Unicode's Final_Sigma condition: a cased letter (then any case-ignorables)
// before, and no cased letter (after any case-ignorables) after.
func finalSigma(rs []rune, i int) bool {
	j := i - 1
	for j >= 0 && caseIgnorable(rs[j]) {
		j--
	}
	if j < 0 || !cased(rs[j]) {
		return false
	}
	k := i + 1
	for k < len(rs) && caseIgnorable(rs[k]) {
		k++
	}
	return k >= len(rs) || !cased(rs[k])
}

func cased(r rune) bool {
	return unicode.IsUpper(r) || unicode.IsLower(r) || unicode.IsTitle(r) ||
		unicode.Is(unicode.Other_Lowercase, r) || unicode.Is(unicode.Other_Uppercase, r)
}

// caseIgnorable is Case_Ignorable: marks, format characters, modifiers, and the Word_Break
// MidLetter, MidNumLet and Single_Quote characters.
func caseIgnorable(r rune) bool {
	switch r {
	case 0x27, 0x2e, 0x3a, 0xb7, 0x387, 0x55f, 0x5f4, 0x2018, 0x2019, 0x2024, 0x2027,
		0xfe13, 0xfe52, 0xfe55, 0xff07, 0xff0e, 0xff1a:
		return true
	}
	return unicode.In(r, unicode.Mn, unicode.Me, unicode.Cf, unicode.Lm, unicode.Sk)
}

// upperJS is toUpperCase: SpecialCasing's unconditional mappings (ß to SS, the ligatures,
// the Greek iota-subscript forms...), which grow a character into several, then Go's
// mapping for the rest. "ß" upper-cases to "SS", which still fits char(2); "ßß" does not.
func upperJS(s string) string {
	var b strings.Builder
	for _, r := range s {
		if m, ok := specialUpper[r]; ok {
			b.WriteString(m)
			continue
		}
		b.WriteRune(unicode.ToUpper(r))
	}
	return b.String()
}

// specialUpper is every character whose toUpperCase is more than one character, generated
// from V8 (String.fromCodePoint(cp).toUpperCase() over every code point).
var specialUpper = map[rune]string{
	0x00DF: "\U00000053\U00000053", 0x0149: "\U000002BC\U0000004E", 0x01F0: "\U0000004A\U0000030C",
	0x0390: "\U00000399\U00000308\U00000301", 0x03B0: "\U000003A5\U00000308\U00000301", 0x0587: "\U00000535\U00000552",
	0x1E96: "\U00000048\U00000331", 0x1E97: "\U00000054\U00000308", 0x1E98: "\U00000057\U0000030A",
	0x1E99: "\U00000059\U0000030A", 0x1E9A: "\U00000041\U000002BE", 0x1F50: "\U000003A5\U00000313",
	0x1F52: "\U000003A5\U00000313\U00000300", 0x1F54: "\U000003A5\U00000313\U00000301", 0x1F56: "\U000003A5\U00000313\U00000342",
	0x1F80: "\U00001F08\U00000399", 0x1F81: "\U00001F09\U00000399", 0x1F82: "\U00001F0A\U00000399",
	0x1F83: "\U00001F0B\U00000399", 0x1F84: "\U00001F0C\U00000399", 0x1F85: "\U00001F0D\U00000399",
	0x1F86: "\U00001F0E\U00000399", 0x1F87: "\U00001F0F\U00000399", 0x1F88: "\U00001F08\U00000399",
	0x1F89: "\U00001F09\U00000399", 0x1F8A: "\U00001F0A\U00000399", 0x1F8B: "\U00001F0B\U00000399",
	0x1F8C: "\U00001F0C\U00000399", 0x1F8D: "\U00001F0D\U00000399", 0x1F8E: "\U00001F0E\U00000399",
	0x1F8F: "\U00001F0F\U00000399", 0x1F90: "\U00001F28\U00000399", 0x1F91: "\U00001F29\U00000399",
	0x1F92: "\U00001F2A\U00000399", 0x1F93: "\U00001F2B\U00000399", 0x1F94: "\U00001F2C\U00000399",
	0x1F95: "\U00001F2D\U00000399", 0x1F96: "\U00001F2E\U00000399", 0x1F97: "\U00001F2F\U00000399",
	0x1F98: "\U00001F28\U00000399", 0x1F99: "\U00001F29\U00000399", 0x1F9A: "\U00001F2A\U00000399",
	0x1F9B: "\U00001F2B\U00000399", 0x1F9C: "\U00001F2C\U00000399", 0x1F9D: "\U00001F2D\U00000399",
	0x1F9E: "\U00001F2E\U00000399", 0x1F9F: "\U00001F2F\U00000399", 0x1FA0: "\U00001F68\U00000399",
	0x1FA1: "\U00001F69\U00000399", 0x1FA2: "\U00001F6A\U00000399", 0x1FA3: "\U00001F6B\U00000399",
	0x1FA4: "\U00001F6C\U00000399", 0x1FA5: "\U00001F6D\U00000399", 0x1FA6: "\U00001F6E\U00000399",
	0x1FA7: "\U00001F6F\U00000399", 0x1FA8: "\U00001F68\U00000399", 0x1FA9: "\U00001F69\U00000399",
	0x1FAA: "\U00001F6A\U00000399", 0x1FAB: "\U00001F6B\U00000399", 0x1FAC: "\U00001F6C\U00000399",
	0x1FAD: "\U00001F6D\U00000399", 0x1FAE: "\U00001F6E\U00000399", 0x1FAF: "\U00001F6F\U00000399",
	0x1FB2: "\U00001FBA\U00000399", 0x1FB3: "\U00000391\U00000399", 0x1FB4: "\U00000386\U00000399",
	0x1FB6: "\U00000391\U00000342", 0x1FB7: "\U00000391\U00000342\U00000399", 0x1FBC: "\U00000391\U00000399",
	0x1FC2: "\U00001FCA\U00000399", 0x1FC3: "\U00000397\U00000399", 0x1FC4: "\U00000389\U00000399",
	0x1FC6: "\U00000397\U00000342", 0x1FC7: "\U00000397\U00000342\U00000399", 0x1FCC: "\U00000397\U00000399",
	0x1FD2: "\U00000399\U00000308\U00000300", 0x1FD3: "\U00000399\U00000308\U00000301", 0x1FD6: "\U00000399\U00000342",
	0x1FD7: "\U00000399\U00000308\U00000342", 0x1FE2: "\U000003A5\U00000308\U00000300", 0x1FE3: "\U000003A5\U00000308\U00000301",
	0x1FE4: "\U000003A1\U00000313", 0x1FE6: "\U000003A5\U00000342", 0x1FE7: "\U000003A5\U00000308\U00000342",
	0x1FF2: "\U00001FFA\U00000399", 0x1FF3: "\U000003A9\U00000399", 0x1FF4: "\U0000038F\U00000399",
	0x1FF6: "\U000003A9\U00000342", 0x1FF7: "\U000003A9\U00000342\U00000399", 0x1FFC: "\U000003A9\U00000399",
	0xFB00: "\U00000046\U00000046", 0xFB01: "\U00000046\U00000049", 0xFB02: "\U00000046\U0000004C",
	0xFB03: "\U00000046\U00000046\U00000049", 0xFB04: "\U00000046\U00000046\U0000004C", 0xFB05: "\U00000053\U00000054",
	0xFB06: "\U00000053\U00000054", 0xFB13: "\U00000544\U00000546", 0xFB14: "\U00000544\U00000535",
	0xFB15: "\U00000544\U0000053B", 0xFB16: "\U0000054E\U00000546", 0xFB17: "\U00000544\U0000053D",
}
