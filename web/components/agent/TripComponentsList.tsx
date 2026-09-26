import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY } from "@/lib/agent/content";
import type { TripComponentRow } from "@/lib/agent/tripDetail";

export function TripComponentsList({ components }: { components: TripComponentRow[] }) {
  if (components.length === 0) {
    return (
      <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
        {AGENT_COPY.tripComponentsEmpty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {components.map((c) => (
        <div key={c.componentId} className="card flex items-center gap-3 px-3.5 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]">
            <Icon name={c.icon} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-title-s text-[13px]">{c.title}</p>
            {c.subtitle && (
              <p className="t-body-s text-[var(--md-on-surface-variant)]">{c.subtitle}</p>
            )}
          </div>
          <span className="kbd">{c.sourceBadge}</span>
          <div className="min-w-[70px] text-right font-mono text-xs font-bold">{c.costLabel}</div>
        </div>
      ))}
    </div>
  );
}
