// Story-Tail Adventures: the public pages' small behaviours, as one ES module the public
// layouts load (docs/GO-MIGRATION.md §4.9). Every page works without it; this only adds what
// the Next client components did after hydration.

// PrintButton (legal/[slug]/PrintButton.tsx): window.print() on "Print this page".
for (const button of document.querySelectorAll("[data-print]")) {
  button.addEventListener("click", () => window.print());
}
