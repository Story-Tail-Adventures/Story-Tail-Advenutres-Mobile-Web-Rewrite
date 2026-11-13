# Web Push Go Library Security Review (Go migration, Track B)

Written 2026-11-06. CLAUDE.md requires a security review before any new third-party SDK, and
`docs/GO-MIGRATION.md` ruling 15 requires one for each new Go library, preferring the standard
library where it is enough. The `push-dispatch` function signs and encrypts web notifications with
web-push 3.6.7 (`docs/Push-Notifications-Security-Review.md` §2). The port in `webgo/` needs the
same in Go. This picks how.

Status: **awaiting Gyasi's decision** (written 2026-11-06 for the Go port, Track B).
Nothing is added to `webgo/` yet; §5 binds the build once approved.

## 1. What the library will be trusted with

- **The VAPID private key** (`VAPID_PRIVATE_KEY`). It signs every request to a browser's push
  service. Every advisor's browser subscribed with its public half, so a leak or a rotation touches
  every web subscription.
- **Every web notification's words:** a client's first name, the trip, the first line of a message
  (card numbers already masked by `internal/domain/push`). They are **encrypted end to end** to the
  advisor's browser (RFC 8291), so Google, Mozilla and Apple cannot read them. A mistake in the
  encryption either loses the notification silently (the browser cannot decrypt it) or, worse,
  weakens that protection.
- **Each browser's subscription keys** (`p256dh`, `auth`) and endpoint: device identifiers.

What it will **not** touch: Android (FCM, already standard library, `internal/domain/fcm`), the
endpoint allowlist (`push.IsAllowedPushEndpoint`), sending the HTTP request, or deciding what a
status code means (`push.OutcomeForStatus`). Those are ours today and stay ours.

**What `push-dispatch` really does today**, read from `_shared/webPush.ts` and the web-push 3.6.7
and http_ece 1.2.0 source the function pins:

- **web-push only builds the request** (`generateRequestDetails`). Our own `fetch` posts it, with
  redirects refused (`redirect: "manual"`), a 10 s timeout, and the response body thrown away.
- **Encryption (`aes128gcm`, RFC 8291 over RFC 8188):** a new P-256 key pair and 16 random salt
  octets for every message, one record with record size 4096, the `0x02` delimiter and **no
  padding**, so the body is 86 + payload + 17 octets. web-push refuses a `p256dh` that is not 65
  octets and an `auth` shorter than 16.
- **VAPID (RFC 8292):** JWT header `{"typ":"JWT","alg":"ES256"}`, claims `aud` (the endpoint's
  scheme and host), `exp` (now + 12 hours) and `sub` (`VAPID_SUBJECT`, which must be a `mailto:` or
  `https:` URL; ours is `mailto:`, per `supabase/README.md`). Header
  `Authorization: vapid t=<jwt>, k=<VAPID_PUBLIC_KEY>`.
- **Other headers:** `TTL: 43200` (12 hours), `Urgency: high` for a dismiss and `normal` otherwise,
  `Topic` (the tag cut to 32 URL-safe characters; left out when empty), `Content-Encoding: aes128gcm`,
  `Content-Type: application/octet-stream`.
- **404 and 410 are not the library's business.** `outcomeForStatus` (ours, already ported as
  `push.OutcomeForStatus`) maps 2xx to sent, 404 or 410 to "device gone" (forgotten), and anything
  else, a redirect included, to an error that is retried up to three times.

## 2. The options

| | **webpush-go** | **Standard library only** |
|---|---|---|
| Version looked at | v1.4.0 | Go 1.27.3 (the pinned toolchain) |
| Release date | 2025-01-02. Four later commits sit untagged on master, the last 2026-04-22 | ships with the toolchain; `go.mod` pins `toolchain go1.27.3` |
| Use | 262 importing modules (pkg.go.dev); 457 stars | every Go program |
| What it is | about 280 lines gluing `crypto/elliptic`, `crypto/aes`, `crypto/cipher`, `x/crypto/hkdf` and a JWT library | `crypto/ecdh` (Go 1.20), `crypto/hkdf` (1.24), `crypto/aes` and `cipher.NewGCM`, `crypto/ecdsa` raw key parsing (1.25), `crypto/sha256`, `encoding/base64`; about 150 lines of ours |
| Dependencies | `github.com/golang-jwt/jwt/v5` **v5.2.1**, `golang.org/x/crypto` v0.31.0 (for `hkdf` only) | **none** |
| Maintainers | one owner (GitHub `SherClockHolmes`), 14 contributors; 2 tags since 2023 (v1.3.0, v1.4.0) | the Go team |
| Licence | MIT | BSD-3-Clause |
| Minimum Go | 1.13 | 1.25 (raw ECDSA key parsing) |
| Known advisories | none on webpush-go; **GO-2025-3553 in its jwt v5.2.1** (not reachable, §3) | standard-library advisories ship as Go point releases; govulncheck already gates them |

## 3. The advisory history, read honestly

Nothing has been filed against webpush-go itself. govulncheck v1.9.0 (database of 2026-11-05) on a
probe that sends one notification: **no vulnerability reachable**. It names GO-2025-3553 (excessive
memory in `Parser.ParseUnverified`, fixed in jwt v5.2.2) in an imported package the library never
calls, since it only signs, plus 21 advisories in `x/crypto` v0.31.0, all in `ssh` and `openpgp`,
none reachable.

No advisories is not the same as no bugs. Reading the source and running it found these:

| # | Finding | Status | Hits us? |
|---|---|---|---|
| 1 | **The ECDH secret dropped leading zero bytes** (`big.Int.Bytes()`), so about 1 message in 256 could not be decrypted, silently. | Fixed in v1.3.0 (2023-10-03, `4634ae7`) | No longer, but it is exactly the kind of bug that hides in this glue |
| 2 | **Data race: it writes the padding into the caller's payload slice.** Probe: four sends of one payload slice with spare room, at once, and `go test -race` reports a DATA RACE at `webpush.go:184`. | **In v1.4.0.** Fixed only on untagged master (`f22569f`, 2025-11-08) | **Yes.** `push.Deliver` sends one payload to all of an advisor's devices at the same time |
| 3 | **It puts `mailto:` in front of any subject not starting with `https:`.** Probe with `mailto:info@example.com`: the token's `sub` was `mailto:mailto:info@example.com`. Apple's push service answers that with 403 BadJwtToken (open PR #92, 2026-05-07; issue #81, iPhones and iPads not receiving). | **Open** | **Yes.** Our `VAPID_SUBJECT` starts with `mailto:`. Per #92, Safari would refuse every send |
| 4 | `VapidExpiration` is ignored; `exp` is always now + 12 hours. | In v1.4.0, fixed untagged (`1d97e8e`) | No (12 hours is what we use) |
| 5 | Every body is padded to 4096 octets (probe: `bodylen=4096`). | By design | Harmless, but not what we send today |
| 6 | Uses the deprecated `crypto/elliptic` calls (`GenerateKey`, `Marshal`, `Unmarshal`, `ScalarMult`); the PR to move to `crypto/ecdh` (#60) has been open since 2023. It builds the VAPID key from a raw `big.Int` with no range check, and never checks that the configured `VAPID_PUBLIC_KEY` matches the private key. | Open | A wrong key pair would 403 every send instead of failing at startup |
| 7 | A wrong `auth` key is not caught (#47, open since 2022). | Open | Low |

The pattern is a thin, lightly maintained wrapper whose bugs are all in the glue, with fixes sitting
untagged for months. The cryptography underneath is the standard library's either way.

## 4. Recommendation: the standard library, no new module

1. **We would not write any cryptography.** No curve math, no AES, no GCM, no HKDF, no ECDSA, no
   random numbers: all of that is Go's own `crypto` packages, the same ones webpush-go calls. What we
   write is the glue, the same ~150 lines webpush-go has, on Go's newer and safer calls:
   `crypto/ecdh` checks every public key is a real curve point and always returns a 32-octet secret,
   so finding 1 cannot happen.
2. **The glue can be checked byte for byte.** RFC 8291 Appendix A publishes every intermediate value
   for fixed keys and salt. On 2026-11-06 a short standard-library probe matched **all ten**
   (`ecdh_secret`, `PRK_key`, `key_info`, `IKM`, `PRK`, `CEK`, `NONCE`, the 86-octet header, the
   padded plaintext, the ciphertext) and the whole 144-octet message of §5. RFC 8188 §3.1 matched
   too, and the RFC 8292 §2.4 example token verified against its own `k` key.
3. **Ruling 15 prefers it,** and the FCM token is already built this way (`fcm.SignedAssertion`,
   RS256 on `crypto/rsa`).
4. **webpush-go as tagged has two bugs that hit us directly** (findings 2 and 3). Using it would mean
   pinning an untagged commit and still patching around the subject prefix.
5. **No module, no churn.** Nothing for Dependabot, and `golang-jwt` and `x/crypto` stay out of the
   build.

**This reverses one line of the Deno review,** which rejected writing the encryption ourselves as
"hand-rolled cryptography". In Deno the trade was different: web-push had about 10.9 million
downloads a week and WebCrypto is lower level. In Go, the best library is a small wrapper over the
same standard library we would call, and the RFC's own numbers pin our output. Gyasi's call.

**If Gyasi prefers a library anyway:** webpush-go at
`v1.4.1-0.20260422052225-76cc00f5ac2d` (master, which fixes findings 2 and 4), `golang-jwt/jwt/v5`
v5.2.2 or newer required directly, `VAPID_SUBJECT` passed without its `mailto:` prefix (finding 3),
and its own HTTP client replaced by ours. That is more rules than the code it saves.

## 5. How it must be built (the build follows these)

**Where:** the encryption and signing are a pure package, `webgo/internal/domain/webpush` (no
network, no environment; keys are passed in). Only the `push-dispatch` port reads the `VAPID_*`
secrets and posts the request. The exported encrypt call draws its key pair and salt itself; an
unexported `encryptWith(asPrivate, salt)` exists only so the RFC test can inject them.

**Encryption, per message and per device (RFC 8291 §3.3 and §3.4, RFC 8188 §2):**

1. Refuse a plaintext over **3,993 octets** (RFC 8291 §4: 4096 less the 86-octet header, the
   delimiter and the 16-octet tag). The plaintext is the exact JSON bytes the `push` package builds.
2. Decode `p256dh` (base64url, with or without `=`) and load it with
   `ecdh.P256().NewPublicKey`. That refuses a wrong length, the point at infinity and any point off
   the curve, as RFC 8291 §3.1 requires.
3. Decode `auth`; it must be exactly **16 octets** (web-push took 16 or more; browsers send 16).
4. New key pair: `ecdh.P256().GenerateKey(rand.Reader)`; `as_public` is its 65-octet uncompressed
   form. Never reused across messages or devices, never stored, never logged.
5. New `salt`: 16 octets from `crypto/rand`, per message and per device.
6. `ecdh_secret = as_private.ECDH(ua_public)` (always 32 octets).
7. `PRK_key = HKDF-Extract(salt = auth, IKM = ecdh_secret)`, SHA-256 throughout.
8. `key_info = "WebPush: info" || 0x00 || ua_public || as_public` (144 octets).
9. `IKM = HKDF-Expand(PRK_key, key_info, 32)`.
10. `PRK = HKDF-Extract(salt = salt, IKM = IKM)`.
11. `CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm" || 0x00, 16)`.
12. `NONCE = HKDF-Expand(PRK, "Content-Encoding: nonce" || 0x00, 12)`. No XOR: one record, sequence 0.
13. `header = salt (16) || 4096 as a big-endian uint32 (4) || 65 (1) || as_public (65)`: 86 octets.
14. `padded = a fresh copy of the plaintext || 0x02`. No further padding, as today. **Never append
    to the caller's slice** (finding 2).
15. `ciphertext = AES-128-GCM seal(CEK, NONCE, padded)`, no additional data.
16. Body = `header || ciphertext`, which is 86 + plaintext + 17 octets, never over 4096.

**VAPID (RFC 8292):**

17. At startup: `ecdsa.ParseRawPrivateKey(elliptic.P256(), VAPID_PRIVATE_KEY)` (refuses zero and
    anything not below the curve order). Derive its public key and **refuse to build the web sender
    if it differs from `VAPID_PUBLIC_KEY`**: browsers subscribed with that key, so a mismatch would
    403 every send. `VAPID_SUBJECT` must start with `mailto:` or `https:` and is used **exactly as
    set, never prefixed** (finding 3).
18. Per request: header bytes `{"typ":"JWT","alg":"ES256"}`; claims `aud` = `https://` + the
    endpoint's host, `exp` = now + 43,200 seconds (whole seconds, never more than 24 hours),
    `sub` = `VAPID_SUBJECT`.
19. Sign SHA-256 of `base64url(header) + "." + base64url(claims)` with `ecdsa.Sign`. The signature
    is `r` and `s`, **each left-padded to 32 octets** (`FillBytes`), 64 octets, base64url without
    padding. Never `SignASN1`: JWS wants raw `r || s`.
20. `Authorization: vapid t=<jwt>, k=<base64url of the 65-octet public key, no padding>`.

**The request:**

21. Check `push.IsAllowedPushEndpoint` again before posting, as today.
22. Headers: `Content-Encoding: aes128gcm`, `Content-Type: application/octet-stream`, `TTL: 43200`,
    `Urgency: high` for a dismiss and `normal` otherwise, `Topic` only when non-empty after cutting
    to 32 URL-safe characters, and `Authorization`.
23. `http.Client` with a 10 s timeout and a `CheckRedirect` that returns `http.ErrUseLastResponse`
    (never follow; a 3xx is an error, as today). Read at most 4 KiB of the response, then close it.
    The outcome is `push.OutcomeForStatus`.
24. Logs carry the status code only: never the endpoint, keys, token or payload.

**Tests the build must pass** (CI, with `go test -race`):

- **T1. RFC 8291 Appendix A.** Inject the published `as_private`, `ua_public`, `auth_secret` and
  `salt` through `encryptWith`, and check every intermediate: `ecdh_secret`, `PRK_key`, `key_info`,
  `IKM`, `PRK`, `cek_info`, `CEK`, `nonce_info`, `NONCE`, the 86-octet header, the padded plaintext
  and the ciphertext, then the §5 body. That body is **144 octets**; the RFC's `Content-Length: 145`
  is a known mistake (erratum 5230). Copy the values from the RFC text into `testdata`; do not retype
  them from this document.
- **T2. RFC 8188 §3.1.** `PRK`, `CEK`, `NONCE` and the body, which is **53 octets** (the text says
  54; erratum 5516). This tests the content-coding layer on its own.
- **T3. Round trip.** Encrypt to a test subscription, decrypt as a browser would (the receiver steps
  of RFC 8291 with `ua_private`), get the plaintext back and check the `0x02` delimiter. Change one
  byte and decryption must fail.
- **T4. VAPID.** The RFC 8292 §2.4 example token verifies with its `k` (it does; probe). Our token
  verifies with our public key; its header and claims decode to the expected JSON; `exp` is now +
  43,200; `sub` equals `VAPID_SUBJECT` byte for byte. Over 10,000 signatures, every one is 64 octets
  and verifies.
- **T5. Refusals.** A `p256dh` of the wrong length, all zeros, or with one bit flipped (off the
  curve); an `auth` that is not 16 octets; a 3,994-octet plaintext; a VAPID private key of zero or
  at least the curve order; a VAPID public key that does not match (sender not built). The probe
  confirmed the standard library itself refuses the all-zero point, an off-curve point and a zero
  private key.
- **T6. Freshness.** Two encryptions of the same plaintext to the same device differ in salt,
  `as_public` and ciphertext.
- **T7. Race.** Send one payload slice with spare room to many devices at once through
  `push.Deliver` under `-race`; the slice is unchanged afterwards.
- **T8. Differential (Track B harness).** Deno's web-push and the Go sender each post to a local
  test endpoint that holds a known `ua_private`. Both bodies decrypt to the same plaintext, and the
  headers match except `Authorization`, whose tokens both verify with the same key and carry the same
  `aud` and `sub`.
- **T9. Real browsers, once,** before the cron switches to Go: one notification each to Chrome
  (FCM), Firefox (Mozilla) and Safari (Apple). Apple is the strict one about `sub`.

## 6. Keeping it safe after it ships

- **No module to bump.** The code changes only when we change it.
- **The toolchain is the dependency.** govulncheck in the `webgo` CI job flags standard-library
  crypto advisories, as it did GO-2026-6809; take the Go point release promptly (the `toolchain`
  line in `go.mod`).
- **T1 to T7 run on every CI build,** so a refactor cannot drift from the RFC.
- **If browsers change the protocol** (a new content coding), stop and review again. Never add the
  old `aesgcm` coding or sends without VAPID.
- **Rotating the VAPID keys** cuts off every web subscription; it is its own change, not part of the
  port.

## 7. Not yet verified

- **Live delivery from Go** to Chrome, Firefox and Safari (T9). It needs the `VAPID_*` secrets in the
  Go service.
- **Whether Safari receives today's Deno pushes at all.** No record of a Safari test was found here.
  web-push sends `VAPID_SUBJECT` unchanged, so it should; T9 checks Go either way.
- **The differential test (T8)** is not built yet.
- **That the plaintext bytes equal today's `JSON.stringify` output.** That belongs to the `push`
  domain port and its tests, not to this choice.
- **Whether any push service rejects an `aud` with an explicit `:443`.** Moot in practice: browsers
  never hand out such endpoints, and web-push builds `aud` the same way.

## Sources

- RFC 8291 (Message Encryption for Web Push), §3, §4, §5 and Appendix A: https://www.rfc-editor.org/rfc/rfc8291.txt
- RFC 8188 (Encrypted Content-Encoding for HTTP), §2 and §3.1: https://www.rfc-editor.org/rfc/rfc8188.txt
- RFC 8292 (VAPID for Web Push), §2 and §2.4: https://www.rfc-editor.org/rfc/rfc8292.txt
- Errata: https://errata.rfc-editor.org/rfc8291 (5230) and https://errata.rfc-editor.org/rfc8188 (5516)
- webpush-go repository, commits and issues: https://github.com/SherClockHolmes/webpush-go, commits
  `4634ae7`, `1d97e8e`, `f22569f`, `76cc00f`; https://github.com/SherClockHolmes/webpush-go/pull/92,
  https://github.com/SherClockHolmes/webpush-go/issues/81, https://github.com/SherClockHolmes/webpush-go/issues/47,
  https://github.com/SherClockHolmes/webpush-go/pull/60
- webpush-go v1.4.0 source (`webpush.go`, `vapid.go`) and module versions: https://proxy.golang.org
- Importers: https://pkg.go.dev/github.com/SherClockHolmes/webpush-go?tab=importedby
- Advisories: https://api.osv.dev/v1/query, https://github.com/advisories (ecosystem go), and
  govulncheck v1.9.0 against https://vuln.go.dev (database updated 2026-11-05)
- Go standard library: `go doc crypto/hkdf`, `crypto/ecdh`, `crypto/ecdsa` and the toolchain's
  `api/go1.24.txt` and `api/go1.25.txt` (Go 1.27.3)
- web-push 3.6.7 (`src/web-push-lib.js`, `encryption-helper.js`, `vapid-helper.js`) and http_ece
  1.2.0 (`ece.js`), the exact packages `supabase/functions/deno.json` pins, read from the local Deno
  npm cache
- Probes run 2026-11-06 with Go 1.27.3: the standard-library RFC test (T1, T2, T4, T5 shapes), and
  webpush-go v1.4.0's headers, subject and race (§3)
