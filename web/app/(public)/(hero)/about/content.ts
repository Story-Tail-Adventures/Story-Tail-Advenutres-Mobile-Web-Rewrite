// Screen 2.0.11 About Gyasi — copy module. Desktop copy (C2011) is the source; every figure,
// credential and bio year comes from the claims registry (web/content/public/proof.ts).
import type { Stat } from "@/components/public/StatStrip";
import { ADVISOR, CLAIMS, claim, type ClaimId } from "@/content/public/proof";
import type { Claim } from "@/content/public/types";

/** Inline-italic segments for copy the prototype set with <i>. */
export type RichText = readonly (string | { em: string })[];

/** A claim's secondary line, with the prototype label as the fallback if none is recorded. */
function detailOf(id: ClaimId, fallback: string): string {
  return CLAIMS[id].detail ?? fallback;
}

export const ABOUT_STATS: readonly Stat[] = [
  { value: claim("travelersServed"), label: detailOf("travelersServed", "Travelers served"), icon: "users" },
  { value: `${claim("ratingValue")} ★`, label: `${claim("reviewCount")} reviews`, icon: "star" },
  { value: claim("avgReplyTime"), label: detailOf("avgReplyTime", "Avg reply time"), icon: "message" },
  { value: claim("yearsSpecialist"), label: detailOf("yearsSpecialist", "Caribbean specialist"), icon: "palm" },
];

export const ABOUT_CREDENTIALS: readonly Claim[] = [
  CLAIMS.credInteletravel,
  CLAIMS.credClia,
  CLAIMS.credSandals,
  CLAIMS.credRoyal,
];

export const ABOUT = {
  meta: {
    title: "About Gyasi",
    description: ADVISOR.shortBio,
  },
  hero: {
    overline: "YOUR ADVISOR",
    title: "Hi, I'm",
    script: "Gyasi.",
    lead: ADVISOR.heroLine,
    primary: "Request a quote",
    secondary: "Message me first",
  },
  story: {
    overline: "THE STORY",
    title: "How Story-Tail started.",
    paragraphs: [
      [
        `I started planning trips for friends in ${claim("bioStarted")} because they kept asking. I'd done enough Caribbean weeks of my own to know which resorts were worth it and which were paying for good Google ads. By ${claim("bioNamed")} the side-thing had a name — `,
        { em: "Story-Tail Adventures" },
        " — and a backlog.",
      ],
      [
        "I'm hosted by Inteletravel, which means you get my care plus an IATA-accredited host agency behind every booking. I earn commission from suppliers — never a fee from you.",
      ],
      [
        "My belief about all this is simple: vacation isn't an escape from your life, it's a gift. The world is good. Rest is good. My job is to remove enough friction that you can actually receive both.",
      ],
    ] satisfies readonly RichText[],
    signature: `— ${ADVISOR.firstName}`,
  },
  credentials: {
    overline: "CREDENTIALS",
    // Brief: the prototype said "audited"; Story-Tail is hosted, not audited.
    title: "Trained, certified, hosted.",
  },
  testimonials: {
    overline: "WHAT TRAVELERS SAY",
    title: "Six unedited notes.",
  },
  faq: {
    overline: "QUESTIONS PEOPLE ASK",
    title: "FAQ",
  },
  closing: {
    title: "Let's start with a conversation.",
    body: "No account, no commitment — just tell me what you're dreaming about and I'll come back with three real options.",
    primary: "Request a quote",
    secondary: "Message Gyasi",
  },
  sticky: {
    primary: "Request a quote",
    secondary: "Message me",
  },
} as const;
