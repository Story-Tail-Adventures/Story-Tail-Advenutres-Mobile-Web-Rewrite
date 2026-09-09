import type { FaqItem } from "../types";

/** FAQ on 2.0.2 About / How it works (desktop prototype set, four items). */
export const HOW_IT_WORKS_FAQ: readonly FaqItem[] = [
  {
    q: "Do I pay a planning fee?",
    a: "No. Inteletravel host-agency policy prohibits it. Gyasi earns commission from suppliers — you pay them, never us.",
  },
  {
    q: "What does Inteletravel mean for me?",
    a: "It's the host agency that issues bookings. You'll see them on supplier invoices. It does not change how you work with Story-Tail.",
  },
  {
    q: "How does payment authorization work?",
    a: "You add a card through a Stripe-secured form. Story-Tail uses it only to pay suppliers on your behalf — never to charge you a service fee. Every use is audit-logged and you get notified.",
  },
  {
    q: "Can I plan without an account?",
    a: "You can browse and inquire as a guest. To save searches, view a real proposal, or authorize a card, you'll create an account.",
  },
];
