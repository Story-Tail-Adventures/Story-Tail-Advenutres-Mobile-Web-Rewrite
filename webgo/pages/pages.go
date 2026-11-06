// Package pages embeds the HTML files the server fills in. Each file opens on its own in a
// browser, placeholder text and all, so it can be checked against the design prototype.
//
//	layout/      the five shells (internal/shell): public (hero, plain), auth, onboarding,
//	             client, agent
//	public/ auth/ client/ onboarding/ agent/
//	             one folder per area, each owned by the session building that area
//	demo/ dev/   development-only pages (/_demo, the sign-in harness, /_styleguide)
//
// Phase 1 carries the layouts and the development pages; screens arrive from Phase 2
// (docs/GO-MIGRATION.md §8).
package pages

import "embed"

// FS holds every page file. internal/page parses them once at startup.
//
//go:embed layout/*.html demo/*.html dev/*.html all:public all:auth all:client all:onboarding all:agent
var FS embed.FS
