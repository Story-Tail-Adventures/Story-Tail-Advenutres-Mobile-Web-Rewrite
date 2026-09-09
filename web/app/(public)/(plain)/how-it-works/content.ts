// Screen 2.0.2 About / How It Works — copy module. Desktop copy (C202) is the source; the
// mobile artboard (M202) only shortens, so its variants are not used (brief §6.3).
import type { IconName } from "@/components/ui/Icon";

/** Inline-italic segments for headings the prototype set with <i>. */
export type RichText = readonly (string | { em: string })[];

export interface Step {
  icon: IconName;
  overline: string;
  title: string;
  body: string;
}

export interface Pillar {
  icon: IconName;
  tone: "primary" | "secondary";
  overline: string;
  title: string;
  body: string;
  scripture: { quote: string; reference: string };
}

export const HOW_IT_WORKS = {
  meta: {
    title: "How it works",
    description:
      "You ask. We plan together. You go and rest. No planning fees, ever — Story-Tail earns commission from suppliers, not from you.",
  },
  overline: "HOW STORY-TAIL WORKS",
  title: "You ask. We plan together. You go and rest.",
  lead: "Under 90 seconds of reading — promise. No planning fees, ever — Story-Tail earns commission from suppliers, not from you. We exist so you can take the rest you were made for.",
  steps: [
    {
      icon: "message",
      overline: "STEP 01",
      title: "Ask",
      body: "Tell me what you're craving — beach week, family cruise, honeymoon — by message or a quick call.",
    },
    {
      icon: "sparkle",
      overline: "STEP 02",
      title: "Plan together",
      body: "I come back with a curated proposal: real options, real prices, my honest takes — never a generic search dump.",
    },
    {
      icon: "plane",
      overline: "STEP 03",
      title: "Go rest",
      body: "I book through suppliers, you authorize a card for them to charge, and I keep watch on the details while you receive the rest you came for.",
    },
  ] satisfies readonly Step[],
  heart: {
    overline: "OUR HEART · WHY WE DO THIS",
    title: [
      "Vacation is ",
      { em: "rest" },
      ". Rest is sacred. The world is ",
      { em: "good" },
      ", and meant to be enjoyed.",
    ] satisfies RichText,
    // Brief correction (BRD §10.5): the prototype said "we cap your card at the invoice".
    intro:
      "Two beliefs sit behind every trip we plan. They're the reason Gyasi answers a 9pm message about sunscreen brands and the reason your card can only ever be used up to the limit you set — not a penny more.",
    pillars: [
      {
        icon: "heart",
        tone: "primary",
        overline: "PILLAR 01",
        title: "Rest is a command, not a luxury.",
        body: "On the seventh day God rested and called it holy — not because He was tired, but because He was making rest a gift to us. When we plan your week away, we plan a Sabbath worth taking. No screens that demand you. No charges that surprise you. Real rest.",
        scripture: { quote: "“Come to me, all who are weary, and I will give you rest.”", reference: "MATT 11:28" },
      },
      {
        icon: "palm",
        tone: "secondary",
        overline: "PILLAR 02",
        title: "Creation is a gift, meant to be enjoyed.",
        body: "God made the reef, the trade wind, the warm rain on a tin roof — and called it very good. We don't sell escape from your life; we help you receive a world that's already waiting for you. The Caribbean is one beautiful answer to that invitation.",
        scripture: { quote: "“God saw all that he had made, and it was very good.”", reference: "GEN 1:31" },
      },
    ] satisfies readonly Pillar[],
    welcome: {
      strong: "Whatever your faith — you're welcome here.",
      rest: "This is just where our hands come from. Every traveler gets the same care, the same honesty, the same Caribbean.",
    },
  },
  faqTitle: "FAQ",
  closing: {
    title: "Ready to start planning?",
    /** `link` is rendered as the guest-inquiry link; the prototype set it as plain text. */
    bodyBefore: "Create an account in under 60 seconds — or ",
    bodyLink: "message Gyasi without one",
    bodyAfter: ".",
    cta: "Create account",
  },
  sticky: {
    primary: "Request a quote",
    // Brief correction: the mobile artboard's secondary "Skip" → "Sign in".
    secondary: "Sign in",
    // …and "Your trips" for somebody already signed in. See EXPLORE.sticky.
    secondarySignedIn: "Your trips",
  },
} as const;
