package client

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/profileform"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screen 2.5.2 Personal Info (web/app/(client)/account/personal).
//
// IT IS 2.1.10'S WRITE WITHOUT THE WIZARD: the same validation, the same payload and the
// same Edge Function, with `advance` omitted — which is what takes the write and leaves the
// onboarding cursor alone. The fields are filled by internal/profileform, so a field added
// to one screen cannot be forgotten on the other.

// PersonalCopy is PERSONAL, word for word.
var PersonalCopy = struct {
	Title, Subtitle               string
	IdentityHeading               string
	NameLabel, EmailLabel, NotSet string
	IdentityNote                  string
	Save, Cancel                  string
}{
	Title:           "Personal info",
	Subtitle:        "What Gyasi needs to book without chasing you for paperwork.",
	IdentityHeading: "YOUR ACCOUNT",
	NameLabel:       "Name",
	EmailLabel:      "Email",
	NotSet:          "Not set",
	// It has to explain a read-only field without sounding like a fault. The honest framing
	// is that these two are the account itself rather than a preference — and it points at
	// the person who can change them, which is true today.
	IdentityNote: "Changing your name or the address you sign in with isn’t something you " +
		"can do here yet — message Gyasi and he’ll sort it.",
	Save:   "Save",
	Cancel: "Cancel",
}

var personalSpec = page.Spec{
	File:   "client/account-personal.html",
	Layout: shell.Client,
	Slots: append([]string{
		"title", "subtitle", "identity-heading",
		"name-label", "name-value", "email-label", "email-value", "identity-note",
		"form-error", "personal-form", "save", "cancel",
	}, profileform.Slots()...),
}

func (a *area) mountPersonal(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(personalSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, v visitor, status int,
		f validate.ProfileForm, errs validate.Errors, formError string) {

		d := tmpl.New()
		d.Text("title", PersonalCopy.Title)
		d.Text("subtitle", PersonalCopy.Subtitle)
		d.Text("identity-heading", PersonalCopy.IdentityHeading)
		d.Text("name-label", PersonalCopy.NameLabel)
		d.Text("email-label", PersonalCopy.EmailLabel)
		d.Text("identity-note", PersonalCopy.IdentityNote)

		name, email := a.identity(r, v)
		d.Text("name-value", name)
		d.Text("email-value", email)

		if formError == "" {
			d.Remove("form-error")
		} else {
			d.Text("form-error", formError)
		}
		profileform.Fill(d, f, errs, a.now())
		d.Keep("personal-form")
		d.Text("save", PersonalCopy.Save)
		d.Text("cancel", PersonalCopy.Cancel)
		d.URL("cancel", "href", "/account")
		a.render(w, r, v, d, status)
	}

	rt.Protected("GET /account/personal", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, v, http.StatusOK, profileform.Load(r.Context(), a.Supa, v.AccessToken, a.Log), nil, "")
	}))

	rt.Protected("POST /account/personal", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		f := profileform.Read(form)
		values, errs := validate.ParseProfile(f, a.now())
		if !errs.Empty() {
			show(w, r, v, http.StatusUnprocessableEntity, f, errs, "")
			return
		}
		if a.off {
			web.SeeOther(w, r, "/account")
			return
		}

		// advance: false. onboarding-profile gates the cursor move behind that flag, so
		// leaving it off takes the write and leaves onboarding alone.
		//
		// WHAT THIS DELIBERATELY DOES NOT SEND: the email address, because changing one is
		// GoTrue's job rather than a column write and account.email is mirrored back by a
		// trigger that does not exist yet — a function writing it directly would leave the
		// login address and the CRM record disagreeing. Nor the name: no function writes
		// client.first_name or last_name at all.
		res := a.API.Call(r.Context(), "onboarding-profile", v.AccessToken, api.Input{
			Method: http.MethodPost,
			Body:   values.Payload(false),
		})
		out := web.FromResult(res, personalSaveFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			msg := out.Message
			if out.Status == http.StatusServiceUnavailable {
				msg = personalSaveFailed
			}
			show(w, r, v, out.Status, f, nil, msg)
		default:
			web.SeeOther(w, r, "/account")
		}
	}))
	return nil
}

// personalSaveFailed is the sentence a refusal with no detail shows. The wizard's version
// offers to skip; there is nothing to skip from here, so this one points at the trip thread.
const personalSaveFailed = "That didn't save — nothing's lost. Give it another try, or " +
	"message Gyasi and he'll sort it."

// identity is the name and address the account itself holds, both read-only here.
func (a *area) identity(r *http.Request, v visitor) (name, email string) {
	if a.off {
		return PersonalCopy.NotSet, PersonalCopy.NotSet
	}
	row, found, err := supa.MaybeOne[accountClientRow](r.Context(), a.Supa, v.AccessToken,
		"client", supa.Q().Select("first_name,last_name,preferred_name,email,created_at"))
	if err != nil || !found {
		if err != nil {
			a.Log.Warn("client: personal identity read failed", "err", err)
		}
		return PersonalCopy.NotSet, PersonalCopy.NotSet
	}
	first := text(row.PreferredName)
	if first == "" {
		first = text(row.FirstName)
	}
	name = joinName(first, text(row.LastName))
	if name == "" {
		name = PersonalCopy.NotSet
	}
	email = text(row.Email)
	if email == "" {
		email = PersonalCopy.NotSet
	}
	return name, email
}
