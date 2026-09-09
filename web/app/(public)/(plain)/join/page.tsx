// Screen 2.0.6 Sign-up Gate / Quote Request Prompt — see docs/Screen-Inventory.md §2.0.6
// (Pattern J, §4.4) and design/source-prototype/screens/client-public.jsx (C206_SignUpGate)
// + client-public-mobile.jsx (M206_SignUpGate). P2.
import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { findTrip } from "@/content/public/trips";
import { env } from "@/lib/env";
import { staImg } from "@/lib/images";
import { inquiryHref } from "@/lib/public/inquiry";
import { isJoinIntent, loginHref } from "@/lib/public/links";
import { safeNext } from "@/lib/safe-next";
import { single, type SearchParams } from "@/lib/search-params";
import { JoinForm } from "./JoinForm";
import { JOIN_TEXT, joinCopy } from "./state";

const PATH = "/join";

export const metadata: Metadata = {
  title: JOIN_TEXT.metaTitle,
  description: JOIN_TEXT.metaDescription,
  // A gate is not a landing page: crawlers may follow the sign-in / legal links but
  // should not index the form itself (fidelity spec §5.8).
  robots: { index: false, follow: true },
  alternates: { canonical: PATH },
  openGraph: {
    title: JOIN_TEXT.metaTitle,
    description: JOIN_TEXT.metaDescription,
    url: PATH,
    images: [{ url: staImg("turks", 1200, 630), width: 1200, height: 630 }],
  },
};

/**
 * Everything in the URL is untrusted. `intent` is an allowlist, `trip` is looked up in
 * the curated catalog and only the catalog NAME is ever rendered (never the raw
 * parameter, so nothing a visitor typed can appear in the headline), and `next` goes
 * through `safeNext` before it reaches the form or the sign-in link.
 *
 * Signed-in visitors never see this page: web/proxy.ts sends them to /dashboard.
 */
export default async function JoinPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const rawIntent = single(params.intent);
  const intent = isJoinIntent(rawIntent) ? rawIntent : undefined;

  const rawTrip = single(params.trip);
  const trip = rawTrip ? findTrip(rawTrip) : undefined;

  const requestedNext = safeNext(single(params.next), "");
  const next = requestedNext || "/dashboard";

  const copy = joinCopy(intent, trip?.name);
  const signInHref = loginHref(requestedNext || undefined);
  const emailHref = inquiryHref({
    source: "join",
    trip: trip ? { slug: trip.slug, name: trip.name } : undefined,
  });

  return (
    <div className="gate-backdrop flex flex-1 flex-col md:items-center md:justify-center md:p-8">
      {/* Below `md` the gate is the whole screen (M206); from `md` it is the Pattern J
          centred card (C206: 520 wide, 28 padding, shadow-3). `.card` is a component
          class, so its pieces are applied as `md:` utilities here. */}
      <div className="flex w-full flex-1 flex-col px-4.5 pt-4.5 pb-5.5 md:max-w-130 md:flex-none md:rounded-lg md:border md:border-outline-variant md:bg-surface-1 md:p-7 md:shadow-3">
        <header>
          <p className="t-label-s text-brand-orange">{copy.overline}</p>
          <h1 className="t-headline-r mt-1 mb-1 text-on-surface md:mb-1.5">{copy.title}</h1>
          <p className="t-body-s mb-3.5 text-on-surface-variant md:t-body md:mb-4">{copy.body}</p>
        </header>

        <ul className="mb-3.5 flex flex-col gap-1.5 md:gap-2">
          {JOIN_TEXT.bullets.map((bullet) => (
            <li
              key={bullet}
              className="t-body-s flex items-center gap-2 font-medium text-on-surface md:gap-2.5"
            >
              <Icon name="check" size={14} strokeWidth={2.5} className="shrink-0 text-success" />
              {bullet}
            </li>
          ))}
        </ul>

        <JoinForm
          intent={intent}
          trip={trip?.slug}
          next={next}
          googleEnabled={env.googleAuthEnabled}
          appleEnabled={env.appleAuthEnabled}
          signInHref={signInHref}
          emailHref={emailHref}
        />
      </div>
    </div>
  );
}
