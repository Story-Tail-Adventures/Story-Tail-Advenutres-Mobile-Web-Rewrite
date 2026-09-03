import type { FaqItem } from "../types";

/**
 * FAQ on 2.0.11 About Gyasi (desktop prototype set, five items).
 *
 * "text the number on my contact card" in the prototype points at UI that does not exist;
 * the answer now points at the email link that does (Screen Inventory 2.0.5 / decision 1).
 */
export const GYASI_FAQ: readonly FaqItem[] = [
  {
    q: "Do you charge a planning fee?",
    a: "No — and I can't. As an Inteletravel-hosted advisor I'm contractually prohibited from charging clients planning, consultation, or service fees. I earn commission from suppliers when you travel.",
  },
  {
    q: "What if I just want to message you, no commitment?",
    a: "Please do. Most relationships start with a casual question. Use the \"Message Gyasi\" link on any page — no account needed.",
  },
  {
    q: "Why the Caribbean specifically?",
    a: "I lived in the islands. I know which Sandals has the best Red Lane spa (Grande St. Lucian). I know which Royal Caribbean ship to put a multi-gen family on (Wonder, hands down). When you know one region well, you serve people better.",
  },
  {
    q: "Do you book non-Caribbean trips?",
    a: "Yes — Mexico, Europe, cruises anywhere, group trips, all-inclusives worldwide. The Caribbean is my deepest specialty, not my only one.",
  },
  {
    q: "How does payment work?",
    a: "You add a card through a Stripe-secured form. I use it only to pay suppliers on your behalf, up to a cap you authorize, with audit logs and notifications. I never charge you a service fee.",
  },
];
