package service

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Storage calls, as storage-js 2.x makes them. Objects are addressed by bucket and key; the
// key is never shown to a client (trip-document-url exists to withhold it).

var (
	leadingSlashes = regexp.MustCompile(`^/+`)
	edgeSlash      = regexp.MustCompile(`^/|/$`)
	manySlashes    = regexp.MustCompile(`/+`)
)

// finalPath is storage-js's _getFinalPath: bucket/key with the key's leading slashes dropped.
func finalPath(bucket, key string) string {
	return bucket + "/" + leadingSlashes.ReplaceAllString(key, "")
}

// cleanKey is _removeEmptyFolders: no slash at either end, no doubled slashes.
func cleanKey(key string) string {
	return manySlashes.ReplaceAllString(edgeSlash.ReplaceAllString(key, ""), "/")
}

// encodeURI is JavaScript's encodeURI: everything outside the URI-reserved and unreserved
// sets is percent-encoded as UTF-8; '%' itself is encoded too.
func encodeURI(s string) string {
	const keep = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789;,/?:@&=+$-_.!~*'()#"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if strings.IndexByte(keep, c) >= 0 {
			b.WriteByte(c)
			continue
		}
		b.WriteString("%" + strings.ToUpper(strconv.FormatUint(uint64(c)|0x100, 16)[1:]))
	}
	return b.String()
}

// CreateSignedURL is `storage.from(bucket).createSignedUrl(key, expiresIn)`. It returns the
// absolute URL supabase-js returned, built from this client's base URL; callers keep only
// its path (trip.ToStoragePath), as the Deno functions did.
func (c *Client) CreateSignedURL(ctx context.Context, bucket, key string, expiresIn int) (string, error) {
	body, _ := json.Marshal(map[string]int{"expiresIn": expiresIn})
	_, _, raw, err := c.do(ctx, http.MethodPost, c.base+"/storage/v1/object/sign/"+finalPath(bucket, key),
		bytes.NewReader(body), jsonHeader())
	if err != nil {
		return "", err
	}
	var r struct {
		SignedURL string `json:"signedURL"`
	}
	if err := decode(raw, &r); err != nil {
		return "", err
	}
	if r.SignedURL == "" {
		return "", &Error{Message: "no signed URL returned"}
	}
	return encodeURI(c.base + "/storage/v1" + r.SignedURL), nil
}

// SignedUpload is what createSignedUploadUrl returns.
type SignedUpload struct {
	SignedURL string
	Path      string
	Token     string
}

// CreateSignedUploadURL is `storage.from(bucket).createSignedUploadUrl(key, { upsert })`.
func (c *Client) CreateSignedUploadURL(ctx context.Context, bucket, key string, upsert bool) (SignedUpload, error) {
	h := jsonHeader()
	if upsert {
		h.Set("x-upsert", "true")
	}
	_, _, raw, err := c.do(ctx, http.MethodPost, c.base+"/storage/v1/object/upload/sign/"+finalPath(bucket, key),
		bytes.NewReader([]byte("{}")), h)
	if err != nil {
		return SignedUpload{}, err
	}
	var r struct {
		URL string `json:"url"`
	}
	if err := decode(raw, &r); err != nil {
		return SignedUpload{}, err
	}
	u, err := url.Parse(c.base + "/storage/v1" + r.URL)
	if err != nil {
		return SignedUpload{}, &Error{Message: "storage returned an upload URL that will not parse"}
	}
	token := u.Query().Get("token")
	if token == "" {
		return SignedUpload{}, &Error{Message: "No token returned by API"}
	}
	return SignedUpload{SignedURL: u.String(), Path: key, Token: token}, nil
}

// UploadOptions are the file options the functions pass.
type UploadOptions struct {
	ContentType  string
	CacheControl string // seconds; storage-js defaults to "3600"
	Upsert       bool
}

// Upload is `storage.from(bucket).upload(key, bytes, options)` with a byte body, which
// storage-js sends raw with cache-control, content-type and x-upsert headers.
func (c *Client) Upload(ctx context.Context, bucket, key string, data []byte, opt UploadOptions) error {
	cache := opt.CacheControl
	if cache == "" {
		cache = "3600"
	}
	ct := opt.ContentType
	if ct == "" {
		ct = "text/plain;charset=UTF-8"
	}
	h := http.Header{}
	h.Set("cache-control", "max-age="+cache)
	h.Set("content-type", ct)
	h.Set("x-upsert", strconv.FormatBool(opt.Upsert))
	_, _, _, err := c.do(ctx, http.MethodPost, c.base+"/storage/v1/object/"+finalPath(bucket, cleanKey(key)),
		bytes.NewReader(data), h)
	return err
}

// Remove is `storage.from(bucket).remove(keys)`.
func (c *Client) Remove(ctx context.Context, bucket string, keys []string) error {
	body, _ := json.Marshal(map[string][]string{"prefixes": keys})
	_, _, _, err := c.do(ctx, http.MethodDelete, c.base+"/storage/v1/object/"+bucket, bytes.NewReader(body), jsonHeader())
	return err
}
