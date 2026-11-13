# IMAP Go Library Security Review (Go migration, Track B)

Written 2026-11-06. CLAUDE.md requires a security review before any new third-party SDK, and
`docs/GO-MIGRATION.md` ruling 15 requires one for each new Go library. The `email-inbox` function
reads client replies out of the app's IONOS mailbox with imapflow 2.2.1
(`docs/IMAP-Library-Security-Review.md`). Go has no IMAP client in its standard library, so the port
in `webgo/` needs one. This picks it.

Status: **awaiting Gyasi's decision** (written 2026-11-06 for the Go port, Track B).
Nothing is added to `webgo/go.mod` yet; §5 binds the build once approved.

## 1. What the library will be trusted with

- **The `info@` mailbox password** (`EMAIL_IMAP_PASSWORD`, or `EMAIL_SMTP_PASSWORD` when unset, as
  `inboxConfigFromEnv` does today). The same login sends and reads mail.
- **Every message in INBOX, spam included.** Headers, MIME structure and charsets are written by
  strangers. The library parses the server's replies that carry them (BODYSTRUCTURE, header and
  body literals).
- **Moving and deleting mail.** A bug here could delete mail nobody handled, or handle one twice.

What it will **not** touch: the reply token, the `Authentication-Results` verdict, card-number
masking, the database or the files note (all our own code in `internal/domain/emailinbound`,
`internal/domain/carddigits` and `net/smtp`).

**What `email-inbox` really does on the wire today**, read from `email-inbox/index.ts` and the
imapflow 2.2.1 source the function pins:

| Step | IMAP | Bounds |
|---|---|---|
| Connect | TLS on 993, certificate checked, server name pinned. imapflow then sends CAPABILITY, ID (its own name and version), AUTHENTICATE PLAIN, NAMESPACE, and COMPRESS and ENABLE (CONDSTORE, UTF8=ACCEPT, IMAP4rev2) when the server offers them, because `email-inbox` does not turn those defaults off | connect and greeting 15 s, socket 45 s |
| Folders | LIST, then CREATE for any of `Processed`, `Rejected`, `Failed` that is missing | |
| Read | SELECT INBOX, then `FETCH 1:N (UID RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (14 names)])`, N = the smaller of EXISTS and 25. **No SEARCH and no `\Seen` flag:** every message in INBOX is new, because handled mail is moved out | 25 a run; 60 s budget for starting messages |
| Size gate | A message over 1,000,000 octets (RFC822.SIZE) is moved to `Rejected` without downloading anything else | 1 MB |
| Text | Only for mail that names a reply token: one `text/plain` part (else `text/html`). imapflow fetches `BODY.PEEK[<part>.MIME]` (or `HEADER` for a one-part message) and `BODY.PEEK[<part>]` in 64 KB windows, decodes base64 or quoted-printable, unwraps `format=flowed`, converts the charset to UTF-8, and stops at 80,000 decoded bytes. Attachments are counted from BODYSTRUCTURE, never downloaded | 80,000 bytes |
| File | `UID MOVE <uid> Processed`, `Rejected` or `Failed`, only after the database recorded it | |
| Purge | For each of the three folders: SELECT, `UID SEARCH BEFORE <UTC date 30 days ago>`, `UID STORE +FLAGS.SILENT (\Deleted)`, `UID EXPUNGE`. Without UIDPLUS, imapflow falls back to a plain EXPUNGE | |
| Close | LOGOUT | |

The Go port needs exactly that set: LOGIN or AUTHENTICATE PLAIN, LIST, CREATE, SELECT, FETCH,
UID MOVE, UID SEARCH BEFORE, UID STORE of `\Deleted`, UID EXPUNGE and LOGOUT. No IDLE, no APPEND,
no other flags.

## 2. The options

| | **go-imap v2** | **go-imap v1** | **Write our own** |
|---|---|---|---|
| Version looked at | v2.0.0-beta.8 | v1.2.1 | n/a |
| Release date | tagged 2025-12-16 (release notes posted 2026-02-07); newest tag | 2022-05-01; newest v1 tag | n/a |
| Stability | **beta.** README: "still in development" | stable, but its README points to v2 | n/a |
| Use | 165 importing modules (pkg.go.dev, `imapclient`); repo has 2,360 stars | 557 importing modules (`client`) | us only |
| Dependencies compiled in | `go-message` v0.18.2 (2024-09-28), `go-sasl` (untagged, 2024-10-20). **No `x/text`, no `x/net`** | `go-sasl` (2020), `golang.org/x/text` v0.3.7 | none (`crypto/tls`) |
| Maintainers | one main author (Simon Ser, about 500 of 559 commits), 24 contributors; 17 commits by 9 people in the last year, the latest 2026-11-03 | same author; last v1 commit 2023-11-03, never tagged | us |
| Licence | MIT (all three modules) | MIT | n/a |
| Minimum Go | 1.18 (we build with 1.27.3) | 1.13 | 1.27 |
| Known advisories | **none** (Go vulnerability database, GitHub, OSV, 2026-11-06); govulncheck clean | none on go-imap; 3 in its `x/text` v0.3.7, none reachable | none, because nobody has looked |

## 3. The advisory history, read honestly

No advisory has ever been filed against go-imap (either line), go-message or go-sasl in the Go
vulnerability database, the GitHub advisory database or OSV. govulncheck v1.9.0 (database of
2026-11-05) on a probe module that calls exactly the commands above:

- **v2, Go 1.27.3:** no vulnerabilities, in code or in required modules.
- **v1:** none reachable. Three module-level hits in `x/text` v0.3.7 (GO-2022-1059, GO-2026-5970,
  GO-2026-6629), all fixed in versions our `go.mod` already requires (`x/text` v0.43.0).

No advisories means few people have looked, not that there are no bugs. imapflow has been
hardened against hostile servers far more (bounded numbers, bounded range expansion). The go-imap
issue tracker shows what matters for a client:

- **No deadline while waiting for a reply's first byte** (issue #762, open since 2026-07-26), and
  **a half-open connection hangs every later command** (#772, open since 2026-10-09). Probe: a
  server that greets and then never answers LOGIN left `Login().Wait()` waiting with no limit (still
  waiting at 4 s; the library's 30 s read timeout only starts after the first byte arrives).
- **A literal cut short reads as complete** (PR #780, filed 2026-11-06, open). Probe: the server
  promised 100 octets of `BODY[1]`, sent 50 and closed. `io.ReadAll` returned 50 bytes and **no
  error**; only `FetchCommand.Close()` reported "unexpected EOF". A cut-off reply could be stored
  as if whole.
- **No cap on a literal read into memory.** The decoder reads string literals (BODYSTRUCTURE
  parameters, for example) into memory with no limit on the client side; only the server side sets
  one. The server is IONOS, but the bytes come from the sender.
- **Fixed already:** fetch `Close()` hanging after a timeout mid-literal (#650, closed 2025-05-09),
  and a crash when dialing with nil options (#705, beta.6, fixed).
- **Good signs, seen in the code:** list nesting is capped at 1,000, so a deeply nested
  BODYSTRUCTURE cannot overflow the stack, and the reader goroutine turns a panic into a connection
  error instead of crashing the process.

v1 is frozen: no tag in three and a half years, two open v1 hang reports (#611, #615), and its last
fix (2023-11-03, a server-side panic) was never tagged.

**Our own client** would have to parse literals, quoted strings, NIL, untagged replies that can
arrive at any time, and nested BODYSTRUCTURE with extension data: the hardest grammar in IMAP, read
from attacker-written mail. That is where client bugs live, and we would find them in production.
Also considered: fetch the whole raw message (it is 1 MB at most) and parse MIME with the standard
library, so our client needs no BODYSTRUCTURE. Rejected: it downloads attachments, which the
approved review forbids, and it moves MIME parsing of hostile mail into our code.

## 4. Recommendation: go-imap v2, pinned to v2.0.0-beta.8

1. **It is the maintained Go IMAP client.** v1's own README sends readers to v2, and v1 has had no
   release since 2022. v2 gets fixes every few weeks.
2. **A small supply chain.** Three modules, all MIT, all the same author. The IMAP code compiles in
   no `x/text` and no `x/net` (`go list -deps`), so it adds nothing for govulncheck to chase beyond
   itself.
3. **Proven on our commands, not assumed.** On 2026-11-06 a probe drove go-imap v2 against its own
   in-memory server with MOVE and UIDPLUS: LOGIN, LIST, CREATE, SELECT, `FETCH 1 (UID RFC822.SIZE)`,
   `UID FETCH (UID BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (...)])`, `UID FETCH (BODY.PEEK[1]<0.80000>)`,
   UID MOVE, `UID SEARCH BEFORE`, `UID STORE +FLAGS.SILENT (\Deleted)`, UID EXPUNGE and LOGOUT all
   worked. The wire log showed the same commands imapflow sends today. A QP part with
   `charset=iso-8859-1; format=flowed` and a PDF attachment came back in BODYSTRUCTURE with the
   right type, parameters, encoding and disposition. Not yet against IONOS (§7).
4. **beta.8 is the newest tag and well over two weeks old.** The 15 commits since are mostly server
   code and features we do not use. The one client fix (`f68ef41`, a non-compliant `*` in COPYUID
   no longer drops the connection) only matters for servers that break RFC 4315.

**The beta label** means the API may change between betas. Pinned, it changes only when we bump.
The real risks are the hang and the silent truncation in §3; §5 closes both in our code.

Why not the others:

- **go-imap v1** is stable only in the sense that nothing changes. Its open hang reports will not be
  fixed, and its maintainer has moved on to v2.
- **Our own client** is the most bug-prone part of the job (§3), for no gain in what we control.

## 5. How it must be used (the build follows these)

- **Pin exactly:** `github.com/emersion/go-imap/v2 v2.0.0-beta.8` in `webgo/go.mod`, with
  `github.com/emersion/go-message v0.18.2` and
  `github.com/emersion/go-sasl v0.0.0-20241020182733-b788ff22d5a6` as its indirect requirements.
  `go.sum` records `h1:5IXZK1E33DyeP526320J3RS7eFlCYGFgtbrfapqDPug=` for go-imap, and the Go
  checksum database vouches for it.
- **One importer.** Only the `email-inbox` port (`webgo/internal/api/fn/emailinbox`, beside
  `fn/cruisesearch`) imports `imap` and `imapclient`. A test like `internal/api/boundary_test.go`
  fails the build if any other package does. Nothing imports `imapserver`.
- **We dial, the library talks.** `net.Dialer` with a 15 s timeout, then `tls.Client` with
  `ServerName` set to the host, `MinVersion: tls.VersionTLS12`, the system roots, and **never
  `InsecureSkipVerify`**. Port 993 only; a local test server is the one plain exception, exactly as
  `inboxConfigFromEnv` allows today. The TLS connection goes to `imapclient.New`. No
  `DialInsecure` or `DialStartTLS` in production, no proxy.
- **One hard deadline for the whole run.** Wrap the connection so that no deadline the library sets
  can go past the run's end, and "no deadline" means the run's end. Probe: with a 1.5 s hard end, the
  stuck LOGIN above failed after 1.5 s with an i/o timeout instead of hanging. The run's end is 100 s
  after connect, so a run can never overlap the next two-minute tick. Also call `Client.Close` from
  a timer at the same moment.
- **Options:** always a non-nil `imapclient.Options`. **`DebugWriter` is never set**: it writes the
  password and every message. No `UnilateralDataHandler`.
- **Allowed calls:** `Login` (or `Authenticate` with PLAIN, as imapflow does today), `List`,
  `Create`, `Select`, `Fetch`, `Move`, `UIDSearch`, `Store` (adding `\Deleted` only), `UIDExpunge`,
  `Logout`, `Close`. **Never** `Append`, `Idle`, `Copy`, `Delete`, `Rename`, `Expunge`. No ENABLE,
  COMPRESS or ID: fewer features, less surface.
- **Purge needs UIDPLUS.** Without it, skip the purge and log it. A plain EXPUNGE would also remove
  anything else a person flagged `\Deleted` in that folder (imapflow falls back to it; we do not).
- **Size first, structure second.** Fetch `1:N (UID RFC822.SIZE)` first. Only messages of 1,000,000
  octets or less get the second fetch, `UID FETCH (UID BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (...)])`.
  That bounds every literal the library reads into memory by the size cap, since it has no cap of
  its own.
- **Headers:** only the 14 names `email-inbox` reads today, always `BODY.PEEK` (never sets `\Seen`).
- **Text part:** `BODY.PEEK[<part>]<0.240000>` (`TEXT` for a one-part message, as imapflow does).
  240,000 octets is enough for 80,000 decoded bytes even in quoted-printable's worst case (3 to 1).
  Cut the decoded text at exactly 80,000 bytes, as imapflow's `maxBytes` does. Charset, transfer
  encoding, `format`/`delsp` and disposition come from BODYSTRUCTURE; we never parse a stranger's
  MIME header ourselves.
- **Every literal is checked for completeness.** Read through `io.LimitReader`, then require bytes
  read to equal the literal's `Size()` (or the window), and check `FetchCommand.Close()` before
  using anything. A short read is an error for that message, never a shorter body (§3, #780).
- **Decoding is ours, on the standard library:** `encoding/base64` (skipping characters outside the
  alphabet, as imapflow's decoder does), `mime/quotedprintable`, RFC 3676 `format=flowed` unwrapping
  by hand, and charsets through `golang.org/x/text/encoding/ianaindex` (MIME names; its ISO-8859-1
  matches imapflow's), then `htmlindex` (the labels Deno's `TextDecoder` knows), then UTF-8. That is
  today's fallback order. `x/text` is already compiled into `webgo` through `x/net`; nothing new.
- **UIDs for every change.** Sequence numbers only for the first FETCH right after SELECT. Move a
  message only after the database recorded it (as today), so a crash leaves it in INBOX.
- **Dates in UTC:** the purge cutoff is `time.Now().UTC()` minus 30 days. imapflow formats the date
  in UTC; go-imap formats in the time's own zone, which could shift the cutoff by a day.
- **Folder names are constants** (`INBOX`, `Processed`, `Rejected`, `Failed`), so the library's
  mailbox-name encoder never sees outside input.
- **Errors and logs:** never log a library error whole; it can carry server text. Keep a short code
  and at most 200 characters (as today), and never a header, address or body.
- **Tests, with a fake server like the probe:** a server that never answers ends at the hard
  deadline; a truncated literal becomes a message error; an oversize message never gets its
  BODYSTRUCTURE fetched; the purge does nothing without UIDPLUS; `go test -race` passes. The Track B
  differential test runs the Deno and Go functions against the same seeded local IMAP server and
  compares folders, outcomes and recorded bodies.

## 6. Keeping it safe after it ships

- **Bumps are read, not auto-merged.** Dependabot watches `/webgo` (`gomod`). A go-imap, go-message
  or go-sasl bump moves only to a tag at least two weeks old, after reading the diff to
  `imapclient/` and `internal/imapwire/` and any new advisory.
- **govulncheck** runs in the `webgo` CI job, so a new advisory in any of the three fails CI.
- **Watch #762, #772 and #780.** When they land upstream, keep our deadline wrapper and completeness
  check anyway; they cost nothing.
- **When v2.0.0 is tagged,** move to it after reading the changes since beta.8.
- **If upstream goes quiet or is archived:** the calls we use sit behind one package. Vendor a fork
  of the client half rather than write a new client.
- **If IONOS changes how it signs in** (for example OAuth only), stop and review again.

## 7. Not yet verified

- **go-imap v2 against IONOS.** A real login, LIST, CREATE, FETCH, MOVE and purge. Production mail
  has been refusing the stored password since 2026-10-22 (`docs/GO-MIGRATION.md` §5.7), so this
  waits on that fix.
- **IONOS's full capability list after login.** The 2026-10-16 probe saw
  `IMAP4rev1 IDLE MOVE UIDPLUS SPECIAL-USE AUTH=PLAIN …` before login. If IONOS offers
  `UTF8=ACCEPT`, imapflow turns it on today and the Go port would not; mail with raw UTF-8 headers
  could then arrive in a different form. The first live run records the list, and Gyasi decides
  whether the port sends ENABLE.
- **That IONOS's COPYUID after MOVE follows RFC 4315.** If it sends `*`, beta.8 drops the connection
  (fixed after beta.8 in `f68ef41`), and we would bump to that commit.
- **That BODYSTRUCTURE agrees with the part's MIME header** (charset, encoding, disposition) for real
  replies from Gmail, Apple Mail and Outlook. imapflow reads the header; the port reads the
  structure. The differential test settles it.
- **Charset parity beyond UTF-8, ASCII, ISO-8859-1 and Windows-1252.** imapflow decodes Japanese
  charsets with its own decoder; `x/text` may differ at the edges.
- **That IONOS honours partial fetches.** imapflow notes some servers ignore `<0.N>` and send the
  whole part. The 1 MB gate bounds it either way.

## Sources

- go-imap repository, branches `v1` and `v2`, READMEs, commits and tags: https://github.com/emersion/go-imap
- go-imap issues: https://github.com/emersion/go-imap/issues/650, https://github.com/emersion/go-imap/issues/705,
  https://github.com/emersion/go-imap/issues/762, https://github.com/emersion/go-imap/issues/772,
  https://github.com/emersion/go-imap/pull/780; commit https://github.com/emersion/go-imap/commit/f68ef419e622
- go-imap v2 source at v2.0.0-beta.8 (`imapclient/client.go`, `imapclient/move.go`,
  `internal/imapwire/decoder.go`), fetched through https://proxy.golang.org
- Versions and dates: https://proxy.golang.org (`go list -m -versions` and `-json`)
- Importers: https://pkg.go.dev/github.com/emersion/go-imap/v2/imapclient?tab=importedby and
  https://pkg.go.dev/github.com/emersion/go-imap/client?tab=importedby
- Advisories: https://api.osv.dev/v1/query, https://github.com/advisories (ecosystem go), and
  govulncheck v1.9.0 against https://vuln.go.dev (database updated 2026-11-05)
- go-message and go-sasl: https://github.com/emersion/go-message, https://github.com/emersion/go-sasl
- imapflow 2.2.1 source (`dist/cjs/imap-flow.js`, `download.js`, `tools.js`, `commands/expunge.js`),
  the exact package `supabase/functions/deno.json` pins, read from the local Deno npm cache
- Probes run 2026-11-06 with Go 1.27.3: the wire round trip, the no-answer server, the truncated
  literal, and the hard-deadline wrapper (§3, §4, §5)
