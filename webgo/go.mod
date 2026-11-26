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
	// Master commit 64ce5b8, read-only use behind internal/page only.
	// See docs/HTMLX-Library-Security-Review.md before changing it.
	github.com/mdigger/htmlx v1.0.2-0.20250724121124-64ce5b80543b
	// v0.62.0 fixes GO-2026-6860 and GO-2026-6866 in x/net/html. Never go below it.
	golang.org/x/net v0.63.0
)

require (
	github.com/mdigger/wstat v1.0.0 // indirect
	// Charsets for email-inbox's text parts (ianaindex, htmlindex); already compiled in through x/net.
	golang.org/x/text v0.44.0 // indirect
)
