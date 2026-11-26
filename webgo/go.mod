module github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo

go 1.27

// 1.27.4 fixes GO-2026-6859, a MaxBytesReader header race in net/http that crashes the
// HTTP/1 server. internal/api and internal/web both wrap request bodies in MaxBytesReader,
// so this is our own code path, not a distant one. (1.27.3 had fixed GO-2026-6809 in
// crypto/x509, which hit 1.27.2.)
//
// This line is the whole Go stack's toolchain: CI reads it through `go-version-file`, so
// every branch's govulncheck fails until it moves. Bump it HERE, on the lowest branch that
// has a go.mod, and let the stacks inherit it; never a different value on two branches.
toolchain go1.27.4

require (
	// Approved by Gyasi 2026-11-25 (docs/IMAP-Go-Library-Security-Review.md). Pinned exactly as
	// its §5 binds it; imported by internal/api/fn/emailinbox only. Read §3 and §6 before any
	// bump: three open upstream bugs are covered by our own deadline and completeness guards,
	// and beta tags can change the API.
	github.com/emersion/go-imap/v2 v2.0.0-beta.8
	// Master commit 64ce5b8, read-only use behind internal/page only.
	// See docs/HTMLX-Library-Security-Review.md before changing it.
	github.com/mdigger/htmlx v1.0.2-0.20250724121124-64ce5b80543b
	// v0.62.0 fixes GO-2026-6860 and GO-2026-6866 in x/net/html. Never go below it.
	golang.org/x/net v0.62.0
	// Charsets for email-inbox's text parts (ianaindex, htmlindex); already compiled in through x/net.
	golang.org/x/text v0.43.0
)

require (
	github.com/emersion/go-message v0.18.2 // indirect
	github.com/emersion/go-sasl v0.0.0-20241020182733-b788ff22d5a6 // indirect
	github.com/mdigger/wstat v1.0.0 // indirect
)
