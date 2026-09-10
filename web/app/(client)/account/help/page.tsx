import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { GYASI_FAQ } from "@/content/public/faq/gyasi";
import { HOW_IT_WORKS_FAQ } from "@/content/public/faq/how-it-works";

import { AccountHeader } from "../AccountHeader";
import { HELP } from "./content";

export const metadata: Metadata = { title: "Help & support" };

/**
 * Screen Inventory 2.5.11 — Help & Support. §4.4 Pattern I + B (FAQ list).
 * Artboards: client-account.jsx `C2511_Help`, client-account-mobile.jsx `M2511_Help`.
 *
 * Real today, because it mutates nothing and every source is a typed content module already
 * in the repo — there is no CMS and this screen must not introduce a second store.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.11:
 *  · "Email platform support" is GONE. No `support@` address exists anywhere in the repo:
 *    the app configures exactly one outbound address, `env.inquiryEmail`, deliberately null
 *    when unset so nothing invents one. Story-Tail is one advisor, and a second tier that
 *    routes somewhere other than Gyasi would promise a queue nobody staffs.
 *  · The card-authorization questions are held until §2.4 ships. An FAQ that explains an
 *    unreachable screen is worse than no FAQ.
 *  · "Message Gyasi" is a mailto, NOT /messages/new: §2.6.3 cannot send yet, and a CTA that
 *    looks like a way to reach him and is not one is worse than a plain email link. It
 *    repoints the day §2.6 lands — the same rule 2.1.14 already applies to its third action.
 *  · Reply-window wording is the settled "Usually replies the same day". The public
 *    surface's "< 2h" is an unverified claim fenced behind PUBLIC_CLAIMS_MODE=strict and
 *    must not spread to an authenticated screen.
 */
export default function HelpPage() {
  // The two published FAQ sets, DEDUPED — both answer the planning-fee question, and it is
  // the most important one on the screen, so it must appear exactly once. Filtered on the
  // question AND the answer: two of the §2.4 entries mention card authorization only in the
  // answer, and an FAQ that explains an unreachable screen is worse than no FAQ.
  const seen = new Set<string>();
  const faqs = [...GYASI_FAQ, ...HOW_IT_WORKS_FAQ].filter((item) => {
    if (/\bcards?\b|authoriz/i.test(`${item.q} ${item.a}`)) return false;
    const key = item.q.toLowerCase().replace(/[^a-z]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="client-fill">
      <AccountHeader title={HELP.title} sub={HELP.subtitle} />

      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <Card className="bg-primary-container p-5 text-on-primary-container">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-on-surface"
              aria-hidden="true"
            >
              <span className="t-title-s">GS</span>
            </span>
            <div className="min-w-0">
              <p className="t-title-s">{HELP.advisorName}</p>
              <p className="t-body-s opacity-85">{HELP.replyWindow}</p>
            </div>
          </div>
          <p className="t-body-s mt-3 opacity-90">{HELP.advisorBody}</p>
          <a href={HELP.mailto} className="btn btn-filled mt-4 w-full">
            <Icon name="message" size={14} /> {HELP.messageCta}
          </a>
        </Card>

        <h2 className="t-label mt-6 mb-2 px-1 tracking-wide text-on-surface-variant">
          {HELP.faqHeading}
        </h2>
        <div className="flex flex-col gap-2">
          {faqs.map((item) => (
            <details key={item.q} className="card p-0">
              <summary className="t-title-s flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                {item.q}
                <Icon name="chevron_down" size={15} className="shrink-0 text-on-surface-variant" />
              </summary>
              <p className="t-body-s px-4 pb-4 text-on-surface-variant">{item.a}</p>
            </details>
          ))}
        </div>

        <nav aria-label={HELP.legalHeading} className="mt-6 flex justify-center gap-4">
          {HELP.legal.map((doc) => (
            <Link
              key={doc.slug}
              href={`/legal/${doc.slug}`}
              className="t-body-s text-on-surface-variant underline"
            >
              {doc.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
