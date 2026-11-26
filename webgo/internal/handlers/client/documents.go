package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screens 2.2.6 Trip Documents and 2.5.4 the document library
// (web/app/(client)/trips/[tripId]/documents and web/app/(client)/documents), plus the one
// route that opens a file.
//
// OPENING A FILE IS A POST. The link is a short-lived signed URL the `trip-document-url`
// function mints, and the page never holds one: a URL rendered into HTML would be in the
// history, in a shared screenshot and in any proxy's log for as long as it lived. The form
// posts, the function mints, and the response redirects straight to Storage — and because
// it is a POST, a prefetch or a mail scanner following the page's links mints nothing.

// Document is one filed document.
type Document struct {
	ID        string
	Kind      string
	Filename  string
	MimeType  string
	SizeBytes int64
	CreatedAt string
	// Mine is true when the traveler added it themselves rather than Gyasi.
	Mine bool
	// TripTitle is set on the library screen, where documents from several trips meet.
	TripTitle string
	TripID    string
}

type documentRow struct {
	ID          string  `json:"id"`
	OwnerUserID *string `json:"owner_user_id"`
	TripID      *string `json:"trip_id"`
	Kind        string  `json:"kind"`
	Filename    string  `json:"filename"`
	MimeType    string  `json:"mime_type"`
	SizeBytes   *int64  `json:"size_bytes"`
	CreatedAt   string  `json:"created_at"`
}

const documentColumns = "id,owner_user_id,trip_id,kind,filename,mime_type,size_bytes,created_at"

// The document groups, in the order they are shown (DOCUMENT_GROUP_IDS).
var documentGroups = []struct {
	id    string
	label string
	kinds []string
}{
	{"confirmations", "Supplier confirmations", []string{"supplier_confirmation"}},
	{"identity", "Passports & visas", []string{"passport", "visa"}},
	{"insurance", "Insurance", []string{"insurance_cert"}},
	{"itinerary", "Your itinerary", []string{"pdf_itinerary"}},
	{"photos", "Photos", []string{"photo"}},
	{"other", "Everything else", nil},
}

// DocumentGroup is one heading and the documents under it.
type DocumentGroup struct {
	ID    string
	Label string
	Docs  []Document
}

// GroupDocuments buckets documents by kind and sorts each bucket newest first
// (groupDocuments). A group with nothing in it is left out entirely.
func GroupDocuments(docs []Document) []DocumentGroup {
	var out []DocumentGroup
	for _, g := range documentGroups {
		var bucket []Document
		for _, d := range docs {
			if groupIDFor(d.Kind) == g.id {
				bucket = append(bucket, d)
			}
		}
		if len(bucket) == 0 {
			continue
		}
		slices.SortStableFunc(bucket, func(a, b Document) int {
			return strings.Compare(b.CreatedAt, a.CreatedAt)
		})
		out = append(out, DocumentGroup{ID: g.id, Label: g.label, Docs: bucket})
	}
	return out
}

func groupIDFor(kind string) string {
	for _, g := range documentGroups {
		if slices.Contains(g.kinds, kind) {
			return g.id
		}
	}
	return "other"
}

// DocumentBadge is the two letters on a row's tile (documentBadge).
func DocumentBadge(mimeType string) string {
	if mimeType == "application/pdf" {
		return "PDF"
	}
	return "IMG"
}

// FormatFileSize is formatFileSize, to the byte for small files and one decimal for the
// megabytes nobody counts exactly.
func FormatFileSize(bytes int64) string {
	switch {
	case bytes < 0:
		return "—"
	case bytes < 1024:
		return strconv.FormatInt(bytes, 10) + " B"
	case bytes < 1024*1024:
		return strconv.FormatInt((bytes+512)/1024, 10) + " KB"
	}
	mb := float64(bytes) / (1024 * 1024)
	if mb < 10 {
		return strconv.FormatFloat(mb, 'f', 1, 64) + " MB"
	}
	return strconv.FormatInt(int64(mb+0.5), 10) + " MB"
}

// UploadedByLabel is uploadedByLabel.
func UploadedByLabel(mine bool) string {
	if mine {
		return "added by you"
	}
	return "added by Gyasi"
}

// The copy these screens assemble.
const (
	docsOpenFailed      = "That file would not open just now. Give it a moment and try again."
	docsUploadDeferred  = "Adding documents from the web arrives with the upload screen"
	docsLibraryDeferred = "Coming with the next release — for now, add documents from a trip"
	docsEmptyTitle      = "Nothing filed yet"
	docsEmptyBody       = "As Gyasi confirms each piece of the trip, the paperwork lands here. Add your passport whenever you have a moment — there is no rush."
	libraryEmptyTitle   = "Nothing here yet"
	libraryEmptyBody    = "Documents you or Gyasi add to a trip show up here too, so you always have one place to look."
)

// platformUserRow is the caller's own platform_user id, for "added by you". There are two
// ids in play — auth.users.id and platform_user.id — and document.owner_user_id is the
// second one.
type platformUserRow struct {
	ID       string  `json:"id"`
	TimeZone *string `json:"time_zone"`
}

func (a *area) platformUserID(ctx context.Context, token string) string {
	row, found, err := supa.MaybeOne[platformUserRow](ctx, a.Supa, token, "platform_user",
		supa.Q().Select("id,time_zone"))
	if err != nil || !found {
		return ""
	}
	return row.ID
}

func (r documentRow) view(myUserID string) Document {
	d := Document{
		ID: r.ID, Kind: r.Kind, Filename: r.Filename, MimeType: r.MimeType,
		CreatedAt: r.CreatedAt, TripID: text(r.TripID),
	}
	if r.SizeBytes != nil {
		d.SizeBytes = *r.SizeBytes
	}
	d.Mine = myUserID != "" && text(r.OwnerUserID) == myUserID
	return d
}

// loadTripDocuments reads one trip's documents.
func (a *area) loadTripDocuments(ctx context.Context, token, tripID string) ([]Document, error) {
	rows, err := supa.Select[documentRow](ctx, a.Supa, token, "document",
		supa.Q().Select(documentColumns).Eq("trip_id", tripID).Order("created_at", false))
	if err != nil {
		return nil, err
	}
	me := a.platformUserID(ctx, token)
	out := make([]Document, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.view(me))
	}
	return out, nil
}

// loadAllDocuments reads every document this traveler can see, with the trip each belongs
// to so the library can name it.
func (a *area) loadAllDocuments(ctx context.Context, token string) ([]Document, error) {
	rows, err := supa.Select[documentRow](ctx, a.Supa, token, "document",
		supa.Q().Select(documentColumns).Order("created_at", false))
	if err != nil {
		return nil, err
	}
	me := a.platformUserID(ctx, token)
	titles := map[string]string{}
	if trips, err := supa.Select[tripRow](ctx, a.Supa, token, "trip",
		supa.Q().Select("id,title")); err != nil {
		a.Log.Warn("client: trip titles read failed", "err", err)
	} else {
		for _, t := range trips {
			titles[t.ID] = t.Title
		}
	}
	out := make([]Document, 0, len(rows))
	for _, r := range rows {
		d := r.view(me)
		d.TripTitle = titles[d.TripID]
		out = append(out, d)
	}
	return out, nil
}

var tripDocumentsSpec = page.Spec{
	File:   "client/documents.html",
	Layout: shell.Client,
	Slots: []string{
		"back", "title", "subtitle", "count", "upload", "error", "empty",
		"empty-title", "empty-body", "empty-cta", "privacy", "groups",
	},
	Repeats: map[string][]string{
		"groups": {
			"group-label", "group-rows", "doc-badge", "doc-name", "doc-meta",
			"doc-next", "doc-open",
		},
	},
}

func (a *area) mountDocuments(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(tripDocumentsSpec.File)
	if err != nil {
		return err
	}

	// One renderer, two screens: a trip's documents and the whole library. They differ in
	// their heading, their empty state and whether a row names its trip.
	show := func(w http.ResponseWriter, r *http.Request, v visitor, library bool, tripTitle, tripID string,
		docs []Document, readErr error) {
		d := tmpl.New()
		if readErr != nil {
			a.Log.Warn("client: documents read failed", "err", readErr)
			d.Keep("error")
			// The head still renders (it is the only way back), so it decides "upload" and
			// "privacy" for itself; only the shelf goes.
			a.fillDocumentsHead(d, library, tripTitle, tripID)
			for _, slot := range []string{"empty", "groups", "count"} {
				d.Remove(slot)
			}
			a.render(w, r, v, d, http.StatusServiceUnavailable)
			return
		}
		d.Remove("error")
		a.fillDocumentsHead(d, library, tripTitle, tripID)

		groups := GroupDocuments(docs)
		if len(groups) == 0 {
			d.Keep("empty")
			d.Remove("groups")
			d.Remove("count")
			if library {
				d.Text("empty-title", libraryEmptyTitle)
				d.Text("empty-body", libraryEmptyBody)
				d.URL("empty-cta", "href", "/dashboard")
				d.Text("empty-cta", "Back to your trips")
			} else {
				d.Text("empty-title", docsEmptyTitle)
				d.Text("empty-body", docsEmptyBody)
				d.Remove("empty-cta")
			}
			a.render(w, r, v, d, http.StatusOK)
			return
		}

		d.Remove("empty")
		d.Keep("groups")
		d.Text("count", plural(len(docs), "1 document", "documents"))

		// One flat sequence again: a repeat cannot nest, so each group heading is followed
		// by its own rows in the same list.
		type row struct {
			group *DocumentGroup
			doc   *Document
		}
		var rows []row
		for i := range groups {
			rows = append(rows, row{group: &groups[i]})
			for j := range groups[i].Docs {
				rows = append(rows, row{doc: &groups[i].Docs[j]})
			}
		}

		d.Repeat("groups", len(rows), func(i int, rw *page.Row) {
			if g := rows[i].group; g != nil {
				rw.Keep("group-label")
				rw.Text("group-label", g.Label)
				rw.Remove("group-rows")
				return
			}
			doc := rows[i].doc
			rw.Remove("group-label")
			rw.Keep("group-rows")
			rw.Text("doc-badge", DocumentBadge(doc.MimeType))
			rw.Text("doc-name", doc.Filename)
			meta := FormatFileSize(doc.SizeBytes) + " · " + UploadedByLabel(doc.Mine)
			if library && doc.TripTitle != "" {
				meta = doc.TripTitle + " · " + meta
			}
			rw.Text("doc-meta", meta)
			// The document is named by the form's ACTION, so a post cannot name another.
			rw.URL("group-rows", "action", "/documents/"+doc.ID+"/open")
			rw.Attr("doc-next", "value", r.URL.Path)
			rw.Keep("doc-next")
			rw.Keep("doc-open")
			rw.Attr("doc-open", "aria-label", "Open "+doc.Filename)
		})
		a.render(w, r, v, d, http.StatusOK)
	}

	rt.Protected("GET /trips/{tripId}/documents", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		tripID := r.PathValue("tripId")
		title := a.tripTitle(r.Context(), v.AccessToken, tripID)
		docs, err := a.loadTripDocuments(r.Context(), v.AccessToken, tripID)
		show(w, r, v, false, title, tripID, docs, err)
	}))

	rt.Protected("GET /documents", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		docs, err := a.loadAllDocuments(r.Context(), v.AccessToken)
		show(w, r, v, true, "", "", docs, err)
	}))

	rt.Protected("POST /documents/{documentId}/open", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		back := gate.SafeNext(form.Get("next"), "/documents")
		if a.off {
			web.SeeOther(w, r, back)
			return
		}
		res := a.API.Call(r.Context(), "trip-document-url", v.AccessToken, api.Input{
			Method: http.MethodGet,
			Query:  url.Values{"documentId": {r.PathValue("documentId")}},
		})
		out := web.FromResult(res, docsOpenFailed)
		if out.SignIn {
			web.SeeOther(w, r, web.SignInURL(r))
			return
		}
		if !out.OK {
			web.SetFlash(w, docOpenFailedFlash, a.SecureCookies)
			web.SeeOther(w, r, back)
			return
		}
		var body struct {
			Path string `json:"path"`
		}
		if err := json.Unmarshal(res.Data, &body); err != nil || body.Path == "" {
			a.Log.Warn("client: document url reply had no path")
			web.SetFlash(w, docOpenFailedFlash, a.SecureCookies)
			web.SeeOther(w, r, back)
			return
		}
		// Straight to Storage, and ONLY to Storage: the signed path is resolved against the
		// configured Supabase URL, so a reply that tried to send the traveler somewhere else
		// cannot.
		target, err := storageURL(a.Config.SupabaseURL, body.Path)
		if err != nil {
			a.Log.Warn("client: document url was not a storage path", "err", err)
			web.SetFlash(w, docOpenFailedFlash, a.SecureCookies)
			web.SeeOther(w, r, back)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		http.Redirect(w, r, target, http.StatusSeeOther)
	}))
	return nil
}

var docOpenFailedFlash = web.NewFlash("client.document.open-failed", docsOpenFailed)

// storageURL resolves a signed path against the Supabase host (absoluteStorageUrl). It
// refuses anything that would leave that host: the path comes from a function reply, and a
// reply is still data.
func storageURL(supabaseURL, path string) (string, error) {
	base, err := url.Parse(supabaseURL)
	if err != nil {
		return "", err
	}
	ref, err := url.Parse(path)
	if err != nil {
		return "", err
	}
	out := base.ResolveReference(ref)
	if out.Scheme != base.Scheme || out.Host != base.Host {
		return "", errNotStorage
	}
	return out.String(), nil
}

var errNotStorage = errorString("the signed path does not resolve to the Supabase host")

type errorString string

func (e errorString) Error() string { return string(e) }

func (a *area) fillDocumentsHead(d *page.Doc, library bool, tripTitle, tripID string) {
	if library {
		d.Remove("back")
		d.Text("title", "Travel documents")
		d.Text("subtitle", "Passports, visas, insurance — everything in one place.")
		d.Attr("upload", "title", docsLibraryDeferred)
		d.Keep("upload")
		d.Keep("privacy")
		return
	}
	d.URL("back", "href", "/trips/"+tripID)
	d.Text("title", "Documents")
	if tripTitle == "" {
		d.Remove("subtitle")
	} else {
		d.Text("subtitle", "Everything for "+tripTitle+", in one place.")
	}
	d.Attr("upload", "title", docsUploadDeferred)
	d.Keep("upload")
	d.Remove("privacy")
}

// tripTitle is one trip's name, or "" when it is not this traveler's.
func (a *area) tripTitle(ctx context.Context, token, tripID string) string {
	rows, err := supa.Select[tripRow](ctx, a.Supa, token, "trip",
		supa.Q().Select("id,title").Eq("id", tripID).Limit(1))
	if err != nil || len(rows) == 0 {
		return ""
	}
	return rows[0].Title
}
