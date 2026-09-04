// Screen 2.1.9 Welcome / First Login — see docs/Screen-Inventory.md §2.1.9 (Pattern G,
// §4.4) and design/source-prototype/screens/client-auth.jsx `C219_Welcome` +
// client-auth-mobile.jsx `M219_Welcome`. P1.
//
// The cover page of the wizard and the first authenticated screen a new traveler sees. It
// collects nothing; its only write is "Skip the tour", which ends the wizard.
import type { Metadata } from "next";
import { FeatureCard } from "@/components/public/FeatureCard";
import { Photo } from "@/components/public/Photo";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { WelcomeActions } from "./WelcomeActions";
import { WELCOME_CARDS, WELCOME_TEXT } from "./state";

export const metadata: Metadata = {
  title: WELCOME_TEXT.metaTitle,
  description: WELCOME_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

export default async function WelcomePage() {
  const firstName = await greetableFirstName();

  return (
    <div className="flex min-h-dvh flex-col">
      {/* HERO. Taller on mobile than on desktop — the ramp inverts, which is why this is
          written out rather than reusing `.hero-compact` (220 → 280, the wrong way). */}
      <div className="relative h-65 shrink-0 overflow-hidden md:h-50">
        <Photo
          image="overwater"
          fill
          sizes="100vw"
          preload
          // Decorative: the heading beside it carries the meaning, so announcing the photo
          // would just be noise before the greeting.
          alt=""
          className="object-cover"
        />
        <div aria-hidden="true" className="scrim-welcome absolute inset-0" />
        <div className="absolute inset-0 flex flex-col justify-end p-5 text-white md:px-12 md:py-8">
          <p className="t-label-s text-brand-gold">{WELCOME_TEXT.overline}</p>
          <h1 className="t-headline mt-1 mb-1 text-white md:t-display-s">
            {firstName ? WELCOME_TEXT.title(firstName) : WELCOME_TEXT.titleNoName}
          </h1>
          <p className="t-body-s m-0 text-white/90 italic md:t-body">{WELCOME_TEXT.sub}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5 md:gap-6 md:px-12 md:py-6">
        <h2 className="t-title-l text-on-surface">{WELCOME_TEXT.sectionHeading}</h2>

        {/* Five cards from `md`, four below it: M219 drops "Explore on your time", and it
            is the least true of the five today anyway — self-guided search is Phase 2. */}
        <ul className="grid gap-3 md:grid-cols-3">
          {WELCOME_CARDS.map((card) => (
            <li key={card.title} className={card.desktopOnly ? "hidden md:block" : undefined}>
              <FeatureCard
                icon={card.icon}
                iconSize={36}
                title={card.title}
                body={card.body}
                titleClass="t-title-s"
                layout="row"
                className="h-full md:[&]:block"
              />
            </li>
          ))}
        </ul>

        <div className="mt-auto">
          <WelcomeActions />
        </div>
      </div>
    </div>
  );
}

/**
 * The name to greet them by, or null.
 *
 * `handle_new_user()` falls back to the literal 'New' when a sign-up carried no name at
 * all — a social provider that sends no name claims, which Apple does on every
 * authorization after the first. Greeting somebody as "New" is worse than greeting them as
 * nobody in particular, so the placeholder is treated as absent.
 *
 * Prefers `preferred_name`: if a traveler has told Gyasi they go by something, this is the
 * screen that should use it.
 */
async function greetableFirstName(): Promise<string | null> {
  if (env.authChecksDisabledForLocalDev) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("client")
    .select("first_name, preferred_name")
    .maybeSingle();

  const name = data?.preferred_name?.trim() || data?.first_name?.trim();
  if (!name || name === "New") return null;
  return name;
}
