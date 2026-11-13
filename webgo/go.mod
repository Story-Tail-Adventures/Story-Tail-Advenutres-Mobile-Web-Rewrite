module github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo

go 1.27

// 1.27.4 fixes GO-2026-6859, a MaxBytesReader header race in net/http that crashes the
// HTTP/1 server; it hits 1.27.3, which fixed GO-2026-6809 in crypto/x509 before it.
// CI reads its Go version from this line, so govulncheck stays red until it is bumped.
toolchain go1.27.4

require (
	// Master commit 64ce5b8, read-only use behind internal/page only.
	// See docs/HTMLX-Library-Security-Review.md before changing it.
	github.com/mdigger/htmlx v1.0.2-0.20250724121124-64ce5b80543b
	// v0.62.0 fixes GO-2026-6860 and GO-2026-6866 in x/net/html. Never go below it.
	golang.org/x/net v0.62.0
)

require (
	github.com/mdigger/wstat v1.0.0 // indirect
	golang.org/x/text v0.43.0 // indirect
)
