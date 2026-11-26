// Google Analytics, off until the visitor says yes. Ports components/AnalyticsConsentBanner.tsx
// and FirebaseAnalytics.tsx (docs/GO-MIGRATION.md §4.9).
//
// With no answer, or a "no", nothing is downloaded and Google gets nothing. The page carries
// the measurement id and its own already-redacted URL (internal/analytics), so this file
// decides nothing about what may be reported: a page that may not be reported ships no
// configuration at all, and there is nothing here to send.
//
// Once allowed, Google sees that redacted page and no more:
//   - the automatic page_view is off; one is sent with page_location and page_title set from
//     the redacted URL, and they are set as defaults so any later automatic event carries the
//     redacted page too, never document.location. page_title is the redacted path, because a
//     document title can name a trip.
//   - the referrer is cut to its origin: which site sent someone, not which page.
//   - Google signals and ad personalization are off, and the user id is never set.
//
// Saying no later stops collection and deletes the _ga cookies Google set.
//
// WHAT THIS FILE CANNOT CONTROL: GA4's enhanced measurement (outbound clicks, file downloads,
// form interactions, site search, history page views) is a switch on the GA data stream, not
// in code, and an outbound click reports the link's full URL. Those must stay off in
// GA Admin, Data streams, Enhanced measurement. Scrolls may stay on.
const config = document.querySelector("[data-analytics]");
const banner = document.querySelector("[data-consent]")?.closest(".consent");

const KEY = "sta-analytics-consent";

function readConsent() {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null; // storage blocked: treat it as unanswered, and ask again next visit
  }
}

function writeConsent(value) {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Nothing to remember it with. The answer still holds for this page.
  }
}

// forgetGoogleCookies drops the cookies Google set, so saying no actually takes something
// away rather than only stopping the next event.
function forgetGoogleCookies() {
  const host = window.location.hostname;
  const domains = ["", host, "." + host, "." + host.split(".").slice(-2).join(".")];
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (name !== "_ga" && !name.startsWith("_ga_")) continue;
    for (const domain of domains) {
      document.cookie =
        name + "=; Max-Age=0; Path=/" + (domain ? "; Domain=" + domain : "");
    }
  }
}

let started = false;

function start(measurementID, page) {
  if (started) return;
  started = true;

  window.dataLayer = window.dataLayer || [];
  // gtag pushes `arguments` itself: it must be a real function, not an arrow.
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  let referrer = "";
  try {
    referrer = document.referrer ? new URL(document.referrer).origin : "";
  } catch {
    referrer = "";
  }

  const shared = { page_location: page, page_title: new URL(page).pathname };
  if (referrer) shared.page_referrer = referrer;

  gtag("js", new Date());
  gtag("set", shared);
  gtag("config", measurementID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  gtag("event", "page_view", shared);

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementID);
  document.head.appendChild(script);
}

if (config) {
  const measurementID = config.getAttribute("data-measurement-id") || "";
  const page = config.getAttribute("data-page") || "";
  const consent = readConsent();

  if (consent === "granted" && measurementID && page) {
    start(measurementID, page);
  } else if (consent === null && banner) {
    banner.hidden = false;
    for (const button of banner.querySelectorAll("[data-consent]")) {
      button.addEventListener("click", () => {
        const answer = button.getAttribute("data-consent");
        writeConsent(answer);
        banner.hidden = true;
        if (answer === "granted" && measurementID && page) {
          start(measurementID, page);
        } else {
          forgetGoogleCookies();
        }
      });
    }
  }
}
