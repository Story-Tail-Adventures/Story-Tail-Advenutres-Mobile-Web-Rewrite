import { PublicTopBar } from "@/components/public/PublicTopBar";

/**
 * Pages that open on a full-bleed photo (landing, topic pages, explore, trip detail, About
 * Gyasi). Below `md` the top bar floats transparent over the hero, as in the mobile
 * artboards; from `md` it is the solid sticky bar. `relative` scopes the overlay bar to
 * this region so the placeholder banner above it is never covered.
 */
export default function HeroLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex flex-1 flex-col">
      <PublicTopBar variant="overlay" />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
