package client_test

import (
	"os"
	"strings"
	"testing"
)

// The helper, tested as a helper.
//
// readForm is shared code, so testing it only through whichever screens happen to be nearby
// leaves whole paths unreached: nothing in this area posts a hidden op, and until the
// documents row arrived nothing had a nameless submit either. The people area could not
// reach the nameless-submit path through its own screens at all — every form there names
// its buttons — which is how the bug survived.
//
// So this feeds it markup written for the purpose. The shapes below come from the three
// areas that share this file, not just from this one.

const probeForm = `<!DOCTYPE html><html><body><main>
<form data-slot="probe" method="post" action="/thing?edit=7">
  <input type="hidden" name="op" value="send">
  <input type="text" name="title" value="Aruba">
  <input type="text" name="ghost" value="x" disabled>
  <input type="text" name="nameless-is-skipped" value="y">
  <input type="checkbox" name="tick" value="yes" checked>
  <input type="checkbox" name="untouched" value="no">
  <input type="checkbox" name="plain" checked>
  <input type="checkbox" name="blank" value="" checked>
  <input type="radio" name="band" value="" checked>
  <textarea name="note">Two nights.</textarea>
  <select name="column">
    <option value="date">Date</option>
    <option value="" selected>Ignore this column</option>
  </select>
  <select name="labelled">
    <option selected>Its own words</option>
  </select>
  <input type="text" name="must" value="" required>
  <input type="text" name="must-but-off" value="" required disabled>
  <button type="submit">Save</button>
  <button type="submit" name="op" value="archive">Archive</button>
  <button type="submit" name="op" value="delete" disabled>Delete</button>
  <button type="submit" name="op" value="draft" formnovalidate>Draft</button>
  <button type="button" name="op" value="toggle">Not a submit</button>
</form>
<form data-slot="buttonless" method="post" action="/other"><input type="hidden" name="k" value="v"></form>
</main></body></html>`

func TestReadFormSerializesWhatABrowserWouldSend(t *testing.T) {
	f := readForm(t, probeForm, "probe")

	if f.action != "/thing?edit=7" {
		t.Errorf("action = %q; the query a form was rendered with has to survive", f.action)
	}

	for _, tc := range []struct{ name, want string }{
		{"title", "Aruba"},
		{"tick", "yes"},
		// No value attribute at all: "on" is the browser's stand-in.
		{"plain", "on"},
		// An explicit value="": the empty string, NOT "on". A "none of these" control means
		// no answer, and posting "on" sends a value nobody offered.
		{"blank", ""},
		{"band", ""},
		{"note", "Two nights."},
		// Same rule for an option: its text stands in only when it carries no value.
		{"column", ""},
		{"labelled", "Its own words"},
	} {
		if _, ok := f.fields[tc.name]; !ok {
			t.Errorf("%s was not sent at all", tc.name)
			continue
		}
		if got := f.fields.Get(tc.name); got != tc.want {
			t.Errorf("%s = %q, want %q", tc.name, got, tc.want)
		}
	}

	for _, name := range []string{"ghost", "untouched", "must-but-off"} {
		if _, ok := f.fields[name]; ok {
			t.Errorf("%s was sent; a browser leaves a disabled or unchecked control out", name)
		}
	}

	// A disabled control cannot be required either: the form submits with it empty.
	if got := strings.Join(f.required, ","); got != "must" {
		t.Errorf("required = %q, want just the one that is actually in play", got)
	}
}

// The hidden-op defect, in the shape the people area shipped it: a hidden op ahead of the
// buttons. Nothing here draws one, which is exactly why it is written out by hand.
func TestAHiddenOpBeatsTheButtonThatWasClicked(t *testing.T) {
	f := readForm(t, probeForm, "probe")
	if got := f.fields.Get("op"); got != "send" {
		t.Fatalf("the hidden op read back as %q", got)
	}
	// click appends the button's name and value, so the post carries op twice — and
	// url.Values.Get, which every handler uses, returns the hidden one.
	values := f.fields
	values.Add("op", "archive")
	if got := values.Get("op"); got != "send" {
		t.Errorf("Get returned %q; the whole point is that it returns the FIRST", got)
	}
}

// The failure mode is not that an Enter test fails. It runs, passes, and checks the wrong
// button — on a destructive form, the worst possible shape.
func TestANamelessSubmitIsStillTheButtonEnterPresses(t *testing.T) {
	f := readForm(t, probeForm, "probe")
	if len(f.submits) != 4 {
		t.Fatalf("submits = %+v; type=button is not one, the other four are", f.submits)
	}
	if f.submits[0].name != "" || f.submits[0].value != "" {
		t.Errorf("the default button is %+v; the nameless Save is first in the markup",
			f.submits[0])
	}
	if f.submits[1].value != "archive" {
		t.Errorf("second = %+v", f.submits[1])
	}
	// The page drew Delete off. It is recorded so a test can click it on purpose and prove
	// the SERVER refuses the post rather than trusting the markup.
	del := f.submitNamed(t, "delete")
	if !del.disabled {
		t.Error("the disabled button came back as live")
	}
	if f.submitNamed(t, "archive").disabled {
		t.Error("a live button came back as disabled")
	}
	if !f.submitNamed(t, "draft").novalidate {
		t.Error("formnovalidate was not read")
	}
	if f.submitNamed(t, "archive").novalidate {
		t.Error("a button without formnovalidate came back as skipping the checks")
	}
}

// A form can have no submit at all — one a script drives. It must read as empty rather than
// as a form whose first button is something else on the page.
func TestAFormWithNoButtonsHasNoDefault(t *testing.T) {
	f := readForm(t, probeForm, "buttonless")
	if len(f.submits) != 0 {
		t.Errorf("submits = %+v", f.submits)
	}
	if f.fields.Get("k") != "v" {
		t.Error("its fields were not read")
	}
}

// The two copies of this helper — one per package, because the tests that use it live in
// two test packages — must not drift. A fix applied to one and not the other is how the
// next lift inherits a bug that was already found.
func TestBothCopiesOfTheHelperAgree(t *testing.T) {
	mine, err := os.ReadFile("browserform_test.go")
	if err != nil {
		t.Fatal(err)
	}
	other, err := os.ReadFile("../onboarding/browserform_test.go")
	if err != nil {
		t.Fatal(err)
	}
	body := func(b []byte) string {
		s := string(b)
		return s[strings.Index(s, "\n")+1:]
	}
	if body(mine) != body(other) {
		t.Error("the two copies differ below the package line; port the change to both")
	}
}
