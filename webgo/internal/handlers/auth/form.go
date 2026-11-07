package auth

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// The fill helpers for what every auth form shares, so each handler reads as a list of fields.

// fillFormError fills a form's error alert (components/auth/FormError.tsx): the sentence, and
// the "somewhere useful to go" link most of them carry. nil removes the alert. The link's href
// comes from the closed table in web.AuthError, never from the request.
func fillFormError(d *page.Doc, prefix string, m *web.AuthMessage) {
	if m == nil {
		d.Remove(prefix + "-error")
		return
	}
	d.Keep(prefix + "-error")
	d.Text(prefix+"-error-text", m.Message)
	if m.Action == nil {
		d.Remove(prefix + "-error-action")
		return
	}
	d.Keep(prefix + "-error-action")
	d.URL(prefix+"-error-link", "href", m.Action.Href)
	d.Text(prefix+"-error-link", m.Action.Label)
}

// field is one input's state on a re-render.
type field struct {
	slot  string // the input's slot (and the prefix of its -error and -hint slots)
	id    string // the input's id, when it is not the slot name (the -error/-hint ids follow it)
	key   string // its key in validate.Errors (the form field's name), when not the slot name
	value string // echoed back when echo is set; never a password
	echo  bool
	err   string // the first message, or ""
	hint  bool   // the field has a hint line, shown only while there is no error
}

func (f field) elementID() string {
	if f.id != "" {
		return f.id
	}
	return f.slot
}

// fillField fills one components/ui/Field: the value, aria-invalid, aria-describedby pointing
// at the error line or the hint, and the error line itself.
func fillField(d *page.Doc, f field) {
	described := ""
	if f.err != "" {
		d.Attr(f.slot, "aria-invalid", "true")
		d.Text(f.slot+"-error", f.err)
		described = f.elementID() + "-error"
	} else {
		d.Remove(f.slot + "-error")
	}
	if f.hint {
		if f.err == "" {
			d.Keep(f.slot + "-hint")
			described = f.elementID() + "-hint"
		} else {
			d.Remove(f.slot + "-hint")
		}
	}
	if described != "" {
		d.Attr(f.slot, "aria-describedby", described)
	}
	if f.echo {
		d.Attr(f.slot, "value", f.value)
	}
	if !f.echo && described == "" {
		d.Keep(f.slot)
	}
}

// fillFields fills each field from errs.
func fillFields(d *page.Doc, errs validate.Errors, fields ...field) {
	for _, f := range fields {
		key := f.key
		if key == "" {
			key = f.slot
		}
		if f.err == "" {
			f.err = errs.First(key)
		}
		fillField(d, f)
	}
}

// fillSocial shows each OAuth button live or disabled with its reason, as configured.
func fillSocial(d *page.Doc, googleOn, appleOn bool) {
	pick := func(name string, on bool) {
		if on {
			d.Keep(name + "-on")
			d.Remove(name + "-off")
		} else {
			d.Remove(name + "-on")
			d.Keep(name + "-off")
		}
	}
	pick("google", googleOn)
	pick("apple", appleOn)
}

// nextFrom is a request's ?next=, made safe (web/lib/safe-next.ts), with /dashboard as the
// fallback. It is sanitised at render as well as at submit: an unchecked value in a hidden
// input is one refactor away from being read by something that trusts it.
func nextFrom(r *http.Request) string {
	return gate.SafeNext(r.URL.Query().Get("next"), "/dashboard")
}

// postedNext is a posted next, made safe.
func postedNext(form map[string][]string) string {
	v := ""
	if vs := form["next"]; len(vs) > 0 {
		v = vs[0]
	}
	return gate.SafeNext(v, "/dashboard")
}
