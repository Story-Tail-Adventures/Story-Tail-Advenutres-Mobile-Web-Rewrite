// Package search is the public area's pure logic: the explore search over the curated
// catalog, the stay dates and the date picker's month grid, money on the public surface, the
// link builders (sign-up gate, quote form, guest message form), the topic-page quote hand-off,
// the results page's filter chips, and the public cruise read's request and response.
//
// It ports these files, case for case, with their tests:
//
//   - web/lib/public/dates.ts, money.ts, calendar.ts, search.ts, links.ts, inquiry.ts,
//     cruises.ts
//   - web/app/quote/href.ts, content.ts and the logic of route.ts (QuoteRedirect)
//   - web/app/(public)/(plain)/explore/results/filters.ts
//
// Nothing here writes HTML or serves HTTP. Everything is total: hostile input is dropped,
// never panicked on, and every label, sentence and href is byte for byte what the
// TypeScript wrote. Where the TypeScript leaned on a JavaScript built-in (URLSearchParams,
// encodeURIComponent, String.prototype.trim, Intl, the URL parser zod's url() calls), the
// behaviour is ported here rather than approximated with Go's nearest equivalent, because
// the nearest equivalent differs (url.QueryEscape encodes "*" and keeps "~"; Go's json
// matches keys without regard to case; utf8.DecodeRune replaces more bytes than a browser).
//
// "Today" is a time zone question. SearchTimeZone is the business day, and the zone
// database is embedded below, so a slim image without zone files still resolves it.
package search

import _ "time/tzdata" // time.LoadLocation must work in a slim image (CLAUDE.md, Go gotchas)
