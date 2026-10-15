# Security review: push notifications (§3.10 Stage 3b)

**Status:** APPROVED by Gyasi, 2026-10-15: `web-push` 3.6.7, and the Firebase messaging SDK with
fetch-on-receipt (3.1 b). Firebase: Gyasi's existing project is connected for Android (PR 2). CLAUDE.md: "Don't introduce new third-party
SDKs without a security review." This is that review for the two outside pieces Stage 3b needs.
Nothing here is built yet.

**What Stage 3b does** (Screen Inventory §3.10.7): when a client writes, their advisor gets a
notification on the web and on their phone, and can reply from the phone's notification. Only
client messages notify; never an internal note; never card data.

---

## 1. What is being added

| Piece | Where | Third party? | Needed for |
|---|---|---|---|
| `web-push` 3.6.7 (npm) | Edge Function only | Yes, a library | Signing and encrypting web notifications |
| Firebase Cloud Messaging client (`com.google.firebase:firebase-messaging`) | Android app | Yes, an SDK and a Google service | Delivering notifications to Android |
| FCM HTTP v1 sender | Edge Function | No library: one signed request to Google, hand-written | Sending to Android |
| Service worker + Push API | Web app | No: built into browsers | Receiving web notifications |
| Apple Push Notification service | iOS app, later | No SDK: Apple's own APIs | iOS, once Xcode is installed |

The browser's push service (Google for Chrome, Mozilla for Firefox, Apple for Safari) is chosen
by the BROWSER, not by us. We do not pick it and need no account with it.

---

## 2. `web-push` (server-side, web notifications)

- **What it is:** the standard Node library for the Web Push protocol (RFC 8291 encryption,
  RFC 8292 VAPID signing). About 10.9 million downloads a week; MPL-2.0; 3.6.7 is the latest
  release (January 2024; the protocol has not changed since).
- **Dependencies (5):** `http_ece` (the RFC 8188 encryption), `jws` and `asn1.js` (VAPID's
  signed token), `https-proxy-agent`, `minimist` (CLI only). All widely used.
- **Runs on Supabase's Deno runtime:** tested 2026-10-15 under Deno 2.9.6. It generated keys,
  signed the VAPID header and encrypted a payload. The request it built is posted with our own
  `fetch`, so its HTTP code path is not used.
- **Considered and rejected:** `@negrel/webpush`, the Deno-native library. Its own author
  states it "hasn't been reviewed by crypto experts". Writing the encryption ourselves was also
  rejected: hand-rolled cryptography is the larger risk.
- **Data it handles:** the notification text (the client's first name, the trip, the first
  line of their message) and the browser's subscription keys. **The payload is end-to-end
  encrypted to the advisor's browser** (RFC 8291): the push service in the middle cannot read
  it.
- **Secret:** the VAPID private key, stored as a Supabase Edge Function secret, never in the
  repo. The public key ships in the web app (it is public by design).
- **Pin:** exact version `npm:web-push@3.6.7`, recorded in `supabase/functions/deno.json`, so a
  new release cannot arrive unreviewed.

**Recommendation: approve.**

---

## 3. Firebase Cloud Messaging (Android)

- **What it is:** Google's delivery channel to Android phones. There is no practical
  alternative for a Play-installed Android app.
- **The client SDK:** `firebase-messaging`, through the Firebase BoM, with its usual
  dependencies (Play services, Firebase Installations). **Not** Firebase Analytics, Crashlytics
  or any other Firebase product: they are not added, and automatic data collection is turned
  off in the manifest (`firebase_analytics_collection_deactivated`,
  `firebase_messaging_auto_init_enabled` false until the advisor taps "Turn on").
- **The server side needs no Firebase SDK.** The Edge Function signs a short-lived token with
  the service account key (WebCrypto, RS256), trades it for an access token, and posts to the
  FCM HTTP v1 endpoint. A few dozen lines, tested.
- **Secret:** the Firebase service account key (JSON), stored as a Supabase Edge Function
  secret. It can send notifications to our app and nothing else; it is not committed anywhere.
- **`google-services.json`** (the app's Firebase config) is not a secret by Google's own
  design, but it names our project, so it stays out of the public repo on the same footing as
  `local.properties` (the build reads it from a gitignored path, and CI gets it as a secret).

### 3.1 The one real privacy question: what Google can read

Unlike Web Push, **an FCM payload is not end-to-end encrypted**. Google's servers can read
whatever we put in it. Two ways to build the Android notification:

- **(a) Content in the payload:** the client's name, trip and first line travel through
  Google in readable form (inside TLS). Simplest.
- **(b) Fetch on receipt (recommended):** the payload carries only a thread id and "new
  message". The app wakes, reads the preview from our own API over its signed-in session, and
  builds the notification itself. Google never sees a client's words or name. Costs one network
  call per notification; Android allows this work inside the messaging service. If the fetch
  fails, the notification falls back to "New message", never to nothing.

**Recommendation: approve the SDK, with (b).**

---

## 4. What this does to existing guarantees

- **PCI (SAQ A):** unaffected. No card data, token or PaymentMethod id is ever in a
  notification, a payload or the device table. `audit-pci` will be run on the build.
- **Client data:** notifications show a client's name and first line on the ADVISOR's own
  device, under the locked-screen rule (name only while locked). Nothing is sent to a client.
- **Device identifiers:** FCM tokens and Web Push subscriptions identify a device. They live in
  a service-role-only table, are deleted on sign-out and when the service reports them dead, and
  are never returned to a client role.
- **Rest hours** (9pm to 7am, all of Sunday) are enforced on the server, so a device cannot be
  woken against the ruling by a misconfigured client.

---

## 5. Decisions (Gyasi, 2026-10-15)

1. **`web-push` 3.6.7: approved** for the Edge Functions.
2. **Firebase messaging SDK: approved**, with fetch-on-receipt (3.1 b).
3. **Firebase project: Gyasi's existing one is connected** rather than a new one. He adds the
   service account key as a Supabase secret himself (a credential).
4. **Order:** PR 1 is the server and the web (testable now); PR 2 is Android; iOS after Xcode.
