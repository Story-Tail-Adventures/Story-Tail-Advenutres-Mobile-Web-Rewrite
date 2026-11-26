// Story-Tail Adventures: the public pages' small behaviours, as one ES module the public
// layouts load (docs/GO-MIGRATION.md §4.9). Every page works without it; this only adds what
// the Next client components did after hydration.

// PrintButton (legal/[slug]/PrintButton.tsx): window.print() on "Print this page".
for (const button of document.querySelectorAll("[data-print]")) {
  button.addEventListener("click", () => window.print());
}

// DismissibleBanner (components/public/DismissibleBanner.tsx): the banner is in the served
// HTML, so it is there with scripting off and for a first visit; this hides it again for
// somebody who closed it before. Deliberately localStorage and not a cookie: reading a cookie
// would make the page personal, and a personal page cannot be cached (§4.7).
for (const banner of document.querySelectorAll("[data-dismissible]")) {
  const key = banner.getAttribute("data-dismissible");
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(key) === "1";
  } catch {
    // Storage blocked: the banner just stays for this visit, as it does in the Next app.
  }
  if (dismissed) {
    banner.hidden = true;
    continue;
  }
  for (const button of banner.querySelectorAll("[data-dismiss]")) {
    button.addEventListener("click", () => {
      banner.hidden = true;
      try {
        window.localStorage.setItem(key, "1");
      } catch {
        // Nothing to remember it with; it comes back next time.
      }
    });
  }
}
