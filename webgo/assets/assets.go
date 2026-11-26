// Package assets embeds the files the browser loads besides the pages: stylesheets, ES
// modules, the pre-paint scripts, fonts, the icon sprite and the brand artwork.
//
// They are served by internal/static under content-hashed names
// (/assets/css/site.3f2a9c1b0d.css), and the page loader rewrites a page's own
// <link href="/assets/css/site.css"> to the hashed name at startup. So a file here is
// referenced by its plain path everywhere, and a changed file gets a new URL on its own.
//
// What lives where (docs/GO-MIGRATION.md §4.8):
//
//	css/      the stylesheets. site.css is a bundle (internal/static.Bundles), not a file.
//	css/area/ one stylesheet per page area, owned by that area's pages
//	js/       pre-paint scripts (classic, blocking) and ES modules (deferred)
//	fonts/    Poppins, Caveat, JetBrains Mono (TTF, from mobile/) and their OFL licences
//	img/      brand artwork
//	icons.svg the stroke icon set as a sprite (from web/components/ui/icon-paths.ts)
package assets

import "embed"

// FS holds every asset. internal/static hashes and serves it.
//
//go:embed css js fonts img icons.svg
var FS embed.FS
