/**
 * The CSS emotion generated for an element's own MUI class, for jsdom tests.
 *
 * jsdom evaluates no media queries, so a responsive rule ("hidden on phones, shown from
 * 768px") cannot be checked through getComputedStyle. What CAN be checked is the stylesheet
 * emotion wrote for the element: its base declarations and each @media block. That pins the
 * rule itself, which is what a layout regression would change.
 */
export function emotionRulesFor(el: Element): {
  /** Rules with no media query, plus MUI's `xs` (min-width:0px) block. */
  base: string;
  /** Other @media blocks, keyed by their condition, e.g. "(min-width:768px)". */
  media: Record<string, string>;
} {
  const cls = [...el.classList].find((c) => /^(mui|css)-[a-z0-9]+(-|$)/.test(c));
  if (!cls) throw new Error(`no emotion class on <${el.tagName.toLowerCase()} class="${el.className}">`);
  const css = [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("");
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const base = [...css.matchAll(new RegExp(`(?:^|})\\.${esc}\\{([^}]*)\\}`, "g"))]
    .map((m) => m[1])
    .join(";");
  const media: Record<string, string> = {};
  for (const m of css.matchAll(new RegExp(`@media ([^{]+)\\{\\.${esc}\\{([^}]*)\\}\\}`, "g"))) {
    media[m[1].trim()] = (media[m[1].trim()] ?? "") + m[2];
  }
  // MUI writes a responsive `xs` value as `@media (min-width:0px)`, which applies at every
  // width, so it belongs with the base rules: "what a phone gets".
  const phone = media["(min-width:0px)"];
  delete media["(min-width:0px)"];
  return { base: phone ? `${base};${phone}` : base, media };
}
