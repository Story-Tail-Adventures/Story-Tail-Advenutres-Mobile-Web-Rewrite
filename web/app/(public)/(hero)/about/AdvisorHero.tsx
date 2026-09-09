import Link from "next/link";
import { Avatar } from "@/components/public/Avatar";
import { Icon } from "@/components/ui/Icon";
import { ADVISOR } from "@/content/public/proof";

interface AdvisorHeroProps {
  overline: string;
  title: string;
  /** Gold script tail of the headline ("Gyasi."). */
  script: string;
  lead: string;
  primary: { label: string; href: string };
  /** Guest inquiry — rendered as a plain anchor (mailto or the gate). */
  secondary: { label: string; href: string };
}

/**
 * Screen 2.0.11 hero (design: C2011 / M2011). Fixed brand gradient (`.hero-advisor`,
 * scheme-independent) with the copy column on the left and Gyasi's portrait on the right.
 * The portrait is the initials avatar until a real photograph exists — never a stock photo.
 * Below `md` the artboard drops the CTAs (the sticky bar carries them) and tucks the round
 * portrait into the bottom-right corner.
 */
export function AdvisorHero({ overline, title, script, lead, primary, secondary }: AdvisorHeroProps) {
  return (
    <section className="hero-advisor on-photo relative overflow-hidden">
      <div className="advisor-hero-grid min-h-95">
        <div className="flex flex-col justify-center px-4.5 pt-20 pb-55 text-white md:max-web:px-8 md:py-13 web:px-14">
          <p className="t-label-s mb-2.5 text-brand-gold">{overline}</p>
          <h1 className="t-hero-l text-white">
            {title} <span className="t-hero-script-xl text-brand-gold">{script}</span>
          </h1>
          <p className="t-hero-sub mt-1.5 max-w-135 text-white/92 md:mt-3.5">{lead}</p>
          <div className="mt-5.5 hidden gap-2.5 md:flex md:flex-wrap">
            <Link href={primary.href} className="btn btn-orange btn-lg">
              {primary.label}
            </Link>
            <a href={secondary.href} className="btn btn-glass btn-lg">
              <Icon name="message" size={14} /> {secondary.label}
            </a>
          </div>
        </div>

        {/* Portrait column from `md` up. */}
        <div className="relative hidden items-center justify-center p-8 md:flex">
          <Avatar
            initials={ADVISOR.initials}
            tone="brand"
            size={200}
            label={ADVISOR.name}
            className="border-4 border-white/40 shadow-3"
          />
        </div>
      </div>

      {/* Mobile portrait, bottom-right, as on the M2011 artboard. */}
      <div aria-hidden="true" className="absolute -right-2.5 -bottom-2.5 md:hidden">
        <Avatar initials={ADVISOR.initials} tone="brand" size={200} className="border-4 border-white/40" />
      </div>
    </section>
  );
}
