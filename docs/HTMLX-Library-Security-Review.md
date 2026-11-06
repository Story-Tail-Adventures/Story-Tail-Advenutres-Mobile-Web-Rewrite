# htmlx Library Security Review (Go migration, Phase 0)

Written 2026-11-06. CLAUDE.md requires a security review before any new third-party SDK. The Go
web app (`docs/GO-MIGRATION.md`) builds every page by loading a plain HTML file and filling it
in on the server. Gyasi picked [mdigger/htmlx](https://github.com/mdigger/htmlx) for that
(ruling 2: a pinned dependency behind `internal/page`, after this review). This review read every
line of htmlx and of the one module it pulls in, and ran the risky parts.

Status: **waiting on Gyasi.** The recommendation is in section 5. Until it is approved, the
Phase 1 skeleton uses htmlx only in the read-only way section 6 describes, so either answer is a
small change inside one package.

## 1. What the library will be trusted with

- **Every page the web app sends.** Trip names, client names, message text, notes, amounts and
  links pass through the code that builds the page. A mistake here is cross-site scripting, or
  one visitor seeing another visitor's data.
- **Pay links**, shown to travelers. CLAUDE.md rule 4 says they must be `https://` and only the
  advisor can change them, because a swapped link sends a client's money to the wrong place.
- **Nothing else.** It never sees a password, token, card number or secret, makes no network call
  in the way we use it, and touches no file at runtime (pages are embedded in the binary).

## 2. What it is

- About 15 KB of Go in 8 files: `node.go`, `func.go`, `attr.go`, `match.go`, `text.go`, `doc.go`
  and two small tests. MIT license.
- A thin layer over `golang.org/x/net/html`, which the Go team maintains. htmlx adds find
  helpers (by id, class, tag, attribute), remove, text read and write, attribute read and write,
  and render to a string.
- One maintainer. One tag, v1.0.1 (2021-06-20). The master branch has two commits since: comment
  fixes (2022-12-13) and a dependency bump (2025-07-24, commit `64ce5b8`). CI is a 2021 GitHub
  Actions file on Go 1.16. The tests cover finding only, not any setter.
- No `init` functions, no `unsafe`, no cgo, no `os/exec`.
- **It pulls in two modules we do not need:** `github.com/mdigger/wstat` (word and character
  counting, used only by `Stats()`; pure math, no I/O, MIT, same author) and `golang.org/x/text`
  (through `x/net/html/charset`, used only by `Get()`).

## 3. What the review found

Each of these was run against the pinned master commit, not only read.

| # | Finding | What happens | Risk to us |
|---|---|---|---|
| 1 | **`SetAttr` does nothing on an attribute that already exists.** The loop writes to a copy of the attribute, not the slice. | `<a href="#placeholder">` stays `#placeholder` after `SetAttr("href", "/trips/123")`. A new attribute is added fine. | High. A page file always carries placeholder values, so every real link, `action`, `value` or `src` would silently keep the placeholder. A pay link could show the sample. |
| 2 | **`AddClass` never works if the element already has a `class` attribute**, even an empty one, because it goes through `SetAttr`. Its duplicate check compares against the whole attribute value, and it would append with `fmt.Sprintln`, adding a newline. | `class="card"` stays `card` after `AddClass("is-active")`. | Medium. Styling states (active tab, error field) would quietly not show. |
| 3 | **`RemoveAttr` writes into the slice it is given** (`append(attrs[:i], attrs[i+1:]...)`). | Removing an attribute from a shallow copy of an element changed the original: it lost `data-a` and gained a second `id`. | High for a server. If a page parsed at startup shared its attribute slices with a per-request copy, one request would change the page for everyone. |
| 4 | **`SetHTML` parses its string as markup.** | Any value passed to it can add elements or scripts. | High if handlers can reach it. This was already the known reason for the safety rules. |
| 5 | **`SetText` works by escaping, then re-parsing in the element's context.** | Safe inside a normal element (`<script>` came out as `&lt;script&gt;`). Inside `<table>`, `<select>` or similar, re-parsing can move text around. | Low, but it is fragile, and it still goes through `SetHTML`. |
| 6 | **A text node inside a raw-text element renders unescaped.** This is how `x/net/html` works, not an htmlx bug. | A text node put inside `<script>` rendered as `</script><img src=x onerror=alert(1)>`. Same for `style`, `noscript`, `iframe`, `xmp`, `noembed`, `noframes`, `plaintext`. | High if any setter can put text there. |
| 7 | **`Text()` un-escapes a second time.** | Source text `&amp;lt;b&amp;gt;` (the visible characters `&lt;b&gt;`) reads back as `<b>`. | Low for pages, but a test that checks escaping with `Text()` would report the wrong thing. |
| 8 | **`Get(url)` uses `http.Get` with no timeout.** | Fetches any URL. | Medium if ever called with request data (server-side request forgery, hung requests). We have no reason to call it. |
| 9 | **Attribute values are escaped on render, but link schemes are not checked.** | `title="\"><script>"` rendered safely as `&#34;&gt;&lt;script&gt;`. `href="javascript:alert(1)"` rendered as is. | High for links. Expected; this is why `internal/page` checks every URL. |
| 10 | **Old `x/net`.** v1.0.1 needs a 2021 `x/net`. govulncheck lists **12 advisories** in `x/net/html` that affect it (GO-2023-1988, GO-2024-3333, GO-2025-3595, GO-2026-4440, GO-2026-4441, GO-2026-5025, GO-2026-5027, GO-2026-5028, GO-2026-5029, GO-2026-5030, GO-2026-6860, GO-2026-6866), plus two in its `x/text`. Master needs `x/net` v0.42.0, which is still behind the fixes in v0.45.0, v0.55.0 and v0.62.0. | Several are cross-site scripting or render bugs; others are parser slowdowns a hostile page could trigger. | Handled: our `go.mod` requires `x/net` **v0.62.0** (the newest, 2026-11) and Go takes the higher version. govulncheck on that set finds nothing in htmlx, `x/net` or `x/text`. |

govulncheck did flag one standard-library issue, GO-2026-6809 in `crypto/x509`, in Go 1.27.2 (the
local toolchain). It is fixed in Go 1.27.3, so `webgo/go.mod` pins `toolchain go1.27.3`.

## 4. The options

| Option | What we use | Gives up |
|---|---|---|
| **A. htmlx, read-only, pinned** | `Parse`, the find helpers and matchers, `Remove`, `RemoveChilds`, `OuterHTML`. Every write is our own code on `x/net/html`. | Nothing we need. Keeps `wstat` and `x/text` in the build. |
| B. Our own helpers, no htmlx | About 80 lines of find and match helpers on `x/net/html`. | Drops two modules and a library with broken setters someone could reach for later. Not Gyasi's pick. |
| C. Vendor htmlx and fix it | A copy in the repo with findings 1 to 3 fixed. | We maintain a fork of code we mostly do not use. |
| D. htmlx as is | Everything, including the setters. | Findings 1 to 4 ship. **Not acceptable.** |

## 5. Recommendation: option A, with the rules in section 6

htmlx is safe to use **only as a reader**: parse a page, find elements, remove them, render. That
part is correct, small, and the same code an `x/net/html` user would write. Its writing half has
three real bugs (findings 1 to 3) and one dangerous feature (finding 4), so none of it is used.

Option B is the clean fallback. If htmlx is ever a problem, or the upstream code changes in a way
we do not like, switching is a change inside `internal/page` only, and it removes `wstat` and
`x/text` from the build.

Optional, and Gyasi's call because it is public: report findings 1 to 3 upstream.

## 6. How it must be used (the build follows these)

- **Pin by commit:** `github.com/mdigger/htmlx v1.0.2-0.20250724121124-64ce5b80543b`, with
  `golang.org/x/net v0.62.0` or newer required directly in `webgo/go.mod`. `go.sum` records the
  hashes, and the Go checksum database vouches for them.
- **Only `internal/page` imports htmlx**, and a test fails the build if any other package does.
- **Allowed htmlx calls:** `Parse`, `String` (tests), `Find`, `FindAll`, `FindNext`, `FindPrev`,
  `Tag`, `TagName`, `HasAttrVal`, `ID`, `Class`, `Remove`, `RemoveChilds`, `OuterHTML`, `Attr`
  (read). **Banned:** `SetHTML`, `SetText`, `SetAttr`, `RemoveAttr`, `AddClass`, `Rename`, `Get`,
  `Load`, `Text`, `Stats`. A test scans `internal/page` source and fails on any banned name.
- **Our own writers, on `x/net/html` directly:**
  - Text: make a fresh text node. Refuse when the element or any ancestor is a raw-text element
    (finding 6).
  - Attributes: build a new attribute slice every time, never edit one in place (findings 1, 3).
  - Links: one setter for `href`, `src`, `action` and `formaction` that allows only relative
    paths, `https:`, `mailto:` and `tel:`, after trimming and lower-casing the scheme, and
    refuses anything else (finding 9). Pay links get a stricter setter: absolute `https://` only.
  - Never parse request or database data as markup.
- **Deep copy per request.** Parsed pages are never changed. Each request fills a full copy whose
  nodes and attribute slices are new (finding 3). `go test -race` runs concurrent fills.
- **Tests check rendered output**, not `Text()` (finding 7).

## 7. Keeping it safe after it ships

- Dependabot watches `/webgo` (`gomod`). An htmlx change is read in full before it is taken. An
  `x/net` bump is taken promptly; it is where the real fixes land.
- `govulncheck` runs in the `webgo` CI job, so a new `x/net/html` advisory fails CI.
- If htmlx's master changes the reader functions in a way that breaks a test, move to option B
  rather than chase it.

## Sources

- htmlx source at commit `64ce5b80543bbbbfd04bc65a21e6dc4f17bc0c00` and tag v1.0.1; wstat at
  `823401228e374afa98f89c0d372c7eca69a7795a`, read in full.
- Probes run 2026-11-06 with Go 1.27.2 against the pinned commit (findings 1 to 9).
- govulncheck (`golang.org/x/vuln/cmd/govulncheck@latest`, 2026-11-06) on two probe modules: the
  pinned commit with `x/net` v0.62.0 (clean apart from GO-2026-6809 in the standard library), and
  tag v1.0.1 with its own 2021 `x/net` (the advisory list in finding 10).
