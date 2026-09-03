import { Icon, type IconName } from "@/components/ui/Icon";
import { Container } from "./Container";

export interface Stat {
  value: string;
  label: string;
  icon: IconName;
}

/**
 * Four-up stats band under the About Gyasi hero (design: C2011 / M2011 stats strip).
 * Values come from the claims registry; the numbers are `text-primary` so they read in
 * the dark scheme (the prototype's burgundy on navy does not).
 */
export function StatStrip({ stats }: { stats: readonly Stat[] }) {
  return (
    <div className="border-b border-outline-variant bg-surface-1">
      <Container size="wide" className="px-0 md:px-8 web:px-12">
        <dl className="grid grid-cols-4 md:gap-6 md:py-6">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center px-1.5 py-3.5 text-center md:flex-row md:items-center md:gap-3 md:p-0 md:text-left ${index > 0 ? "border-l border-outline-variant md:border-0" : ""}`}
            >
              <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container md:inline-flex">
                <Icon name={stat.icon} size={20} />
              </span>
              <div>
                <dd className="t-title md:t-headline order-first text-primary md:text-on-surface">{stat.value}</dd>
                <dt className="t-micro md:t-body-s mt-1 text-on-surface-variant md:mt-0">{stat.label}</dt>
              </div>
            </div>
          ))}
        </dl>
      </Container>
    </div>
  );
}
