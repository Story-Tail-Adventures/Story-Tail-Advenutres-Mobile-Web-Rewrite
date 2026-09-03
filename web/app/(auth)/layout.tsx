import { BrandWordmark } from "@/components/brand/BrandWordmark";

/**
 * Pattern A shell for the 2.1.x authentication screens.
 *
 * Screen Inventory §4.4 maps 2.1.1 to Pattern A with no deviations:
 *   web    — split pane, brand panel beside a narrow form column
 *   mobile — single full-width column (the brand panel is hidden below lg)
 *
 * Proportions follow `ScreenFrame chrome="split"` in the prototype: a 42% brand
 * panel and a max-width 440px form column.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-1 bg-surface">
      <aside className="tropical-gradient relative hidden shrink-0 grow-0 flex-col overflow-hidden p-8 px-9 text-white lg:flex lg:basis-[42%]">
        <BrandWordmark size={36} onDark />

        {/* Decorative passport stamp, per ScreenSplitBrand in the prototype. */}
        <div
          aria-hidden="true"
          className="absolute top-7 right-7 flex size-24 -rotate-[10deg] items-center justify-center rounded-full border-[1.5px] border-dashed border-white/45 text-white/80"
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 3h14v18H5zM9 8h6M9 12h6M9 16h3M5 3v18" />
          </svg>
        </div>

        <div className="mt-auto">
          <div className="t-label-s mb-2.5 text-brand-gold">
            STORY-TAIL · MEMBER PORTAL
          </div>
          <h2 className="t-display-s m-0 whitespace-pre-line leading-[1.1] text-white">
            {"Your next chapter is\nalready in the works."}
          </h2>
          <p className="t-body mt-2 text-white/85">
            Every detail in one place — so the only thing left to do is rest.
          </p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <div className="flex w-full max-w-[440px] flex-col gap-3.5">
          {/* The brand panel is hidden on small screens, so the wordmark comes along. */}
          <div className="mb-2 lg:hidden">
            <BrandWordmark size={32} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
