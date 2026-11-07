package validate

import "testing"

func TestJSTrimMatchesStringPrototypeTrim(t *testing.T) {
	// Every character String.prototype.trim removes: WhiteSpace (incl. U+FEFF and Zs) and
	// LineTerminator.
	js := "\t\v\f \u00a0\ufeff\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\n\r\u2028\u2029"
	if got := JSTrim(js + "x" + js); got != "x" {
		t.Errorf("JSTrim kept something JS removes: %q", got)
	}
	// And what it keeps, which Go's unicode.IsSpace would remove.
	for _, keep := range []string{"\u0085", "\u180e", "\u200b"} {
		if got := JSTrim(keep + "x" + keep); got != keep+"x"+keep {
			t.Errorf("JSTrim removed %U, which JS keeps", []rune(keep)[0])
		}
	}
}

func TestUTF16Len(t *testing.T) {
	cases := map[string]int{"": 0, "abc": 3, "é": 1, "\U0001F600": 2, "a\U0001F334b": 4}
	for in, want := range cases {
		if got := UTF16Len(in); got != want {
			t.Errorf("UTF16Len(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestHasControl(t *testing.T) {
	for _, in := range []string{"\x00", "a\nb", "\x1f", "\x7f", "\u0085", "\u009f"} {
		if !HasControl(in) {
			t.Errorf("HasControl(%q) = false", in)
		}
	}
	for _, in := range []string{"", "Jordan", "José", "\u00a0", "\u200b", "\U0001F334"} {
		if HasControl(in) {
			t.Errorf("HasControl(%q) = true", in)
		}
	}
}
