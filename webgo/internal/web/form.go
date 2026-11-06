package web

import (
	"errors"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
)

// MaxFormBytes caps a plain form post. The longest field the app takes is a message or a
// note, a few thousand characters; 64 KiB is far past any honest form and far short of a
// memory problem.
const MaxFormBytes = 64 << 10

// FormError says why a posted form could not be read. Status is what to answer with.
type FormError struct {
	Status int
	err    error
}

func (e *FormError) Error() string { return e.err.Error() }
func (e *FormError) Unwrap() error { return e.err }

// ParseForm reads an application/x-www-form-urlencoded POST body, at most MaxFormBytes. The
// query string is ignored: a write takes its values from the body only. On an error, answer
// with web.Error(w, err.(*FormError).Status), or use Form, which does.
func ParseForm(w http.ResponseWriter, r *http.Request) (url.Values, error) {
	if r.Method != http.MethodPost {
		return nil, &FormError{http.StatusMethodNotAllowed, errors.New("web: form is not a POST")}
	}
	ct, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || ct != "application/x-www-form-urlencoded" {
		return nil, &FormError{http.StatusUnsupportedMediaType, errors.New("web: form is not urlencoded")}
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxFormBytes)
	if err := r.ParseForm(); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return nil, &FormError{http.StatusRequestEntityTooLarge, err}
		}
		return nil, &FormError{http.StatusBadRequest, err}
	}
	return r.PostForm, nil
}

// Form is ParseForm that answers the error itself. ok is false when it already has.
func Form(w http.ResponseWriter, r *http.Request) (values url.Values, ok bool) {
	v, err := ParseForm(w, r)
	if err != nil {
		var fe *FormError
		status := http.StatusBadRequest
		if errors.As(err, &fe) {
			status = fe.Status
		}
		Error(w, status)
		return nil, false
	}
	return v, true
}

// ParseMultipart reads a multipart/form-data POST (a file upload) of at most maxBytes in
// total. Files over the in-memory share go to temporary files, which the caller removes with
// form.RemoveAll() when done.
func ParseMultipart(w http.ResponseWriter, r *http.Request, maxBytes int64) (*multipart.Form, error) {
	if r.Method != http.MethodPost {
		return nil, &FormError{http.StatusMethodNotAllowed, errors.New("web: upload is not a POST")}
	}
	ct, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || ct != "multipart/form-data" {
		return nil, &FormError{http.StatusUnsupportedMediaType, errors.New("web: upload is not multipart")}
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	if err := r.ParseMultipartForm(min(maxBytes, 8<<20)); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return nil, &FormError{http.StatusRequestEntityTooLarge, err}
		}
		return nil, &FormError{http.StatusBadRequest, err}
	}
	return r.MultipartForm, nil
}
