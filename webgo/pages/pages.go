// Package pages embeds the HTML files the server fills in. Each file opens on its own in a
// browser, placeholder text and all, so it can be checked against the design prototype.
//
// Phase 1 carries only the layout and a development-only demo page; real screens arrive
// from Phase 2 (docs/GO-MIGRATION.md §8).
package pages

import "embed"

// FS holds every page file. internal/page parses them once at startup.
//
//go:embed layout/*.html demo/*.html dev/*.html
var FS embed.FS
