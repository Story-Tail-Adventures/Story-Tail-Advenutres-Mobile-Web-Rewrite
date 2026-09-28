import Link from "next/link";

import {
  moveComponentAction,
  removeComponentAction,
} from "@/app/(agent)/agent/trips/[tripId]/builder/actions";
import { Icon } from "@/components/ui/Icon";
import { BUILDER_COPY } from "@/lib/agent/content";
import type { TripComponentRow } from "@/lib/agent/tripDetail";

/**
 * §3.4.4's canvas — the trip's pieces, in the order the advisor put them.
 *
 * A FLAT ORDERED LIST, NOT THE PROTOTYPE'S DAY GROUPING. `A344_TripBuilder` draws
 * "Day 1 · Arrival", "Day 2 · Beach" with an "Add to Day N" under each. Those days are
 * `itinerary_day` rows and that screen is §3.4.14, the Itinerary Editor — a separate table,
 * a separate entry in the Screen Inventory, and a separate write. §3.4.4's own entry says
 * "component list", and the thing being reordered here is `trip_component.order_index`,
 * which has no day in it. Grouping by date would also fight the drag: the groups would
 * order by date while the rows inside them ordered by index, and moving a row between
 * groups would mean two different writes wearing one gesture.
 *
 * ARROWS, NOT A DRAG HANDLE. See `moveComponentAction` — a drag is pointer-only, so the
 * keyboard path would be these buttons anyway, and they work with JavaScript off.
 *
 * A SERVER COMPONENT. Three plain `<form>`s, no client island: every control here is a
 * write that navigates, and none of them needs state between renders.
 */
export function TripBuilderCanvas({
  tripId,
  components,
  editingId,
}: {
  tripId: string;
  components: TripComponentRow[];
  /** The row §3.4.12 has open, so the canvas can mark it rather than the URL alone. */
  editingId: string | null;
}) {
  if (components.length === 0) {
    return (
      <div className="card px-4 py-8 text-center">
        <p className="t-title-s">{BUILDER_COPY.emptyTitle}</p>
        <p className="t-body-s mx-auto mt-1 max-w-[42ch] text-[var(--md-on-surface-variant)]">
          {BUILDER_COPY.emptyBody}
        </p>
      </div>
    );
  }

  return (
    <ol className="flex list-none flex-col gap-1.5 p-0">
      {components.map((c, i) => {
        const isEditing = c.componentId === editingId;
        return (
          <li
            key={c.componentId}
            /* WRAPS ON A PHONE. Six controls, a title and a price on one 375px line squeezes
               the title to about 90px and wraps "AA 1413 · MIA → MBJ" over four lines. The
               price and the two actions drop to a second line instead, which is the only
               part of the row that reads fine right-aligned under it. */
            className={`card flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2.5 ${
              isEditing ? "border-[var(--md-primary)] bg-[var(--md-primary-container)]" : ""
            }`}
            aria-current={isEditing ? "true" : undefined}
          >
            {/* ── Order ─────────────────────────────────────────────── */}
            <div className="flex flex-col">
              <MoveButton
                tripId={tripId}
                componentId={c.componentId}
                direction="up"
                label={BUILDER_COPY.moveUp}
                title={c.title}
                disabled={i === 0}
              />
              <MoveButton
                tripId={tripId}
                componentId={c.componentId}
                direction="down"
                label={BUILDER_COPY.moveDown}
                title={c.title}
                disabled={i === components.length - 1}
              />
            </div>

            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]">
              <Icon name={c.icon} size={16} />
            </span>

            {/* `basis-full` below `sm` is what actually makes the row wrap. With `flex-1`
                alone the title shrinks to share the line with the price and the two
                actions instead of dropping below them — about 90px on a phone, which is
                where "AA 1413 · MIA → MBJ" became four lines. */}
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <p className="t-title-s text-[13px]">{c.title}</p>
              {c.subtitle && (
                <p className="t-body-s text-[var(--md-on-surface-variant)]">{c.subtitle}</p>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <div className="min-w-[70px] text-right font-mono text-xs font-bold">
                {c.costLabel}
              </div>

              <Link
                href={`/agent/trips/${tripId}/builder?edit=${c.componentId}`}
                className="btn btn-text btn-sm"
              >
                {BUILDER_COPY.edit}
                {/* The label alone reads "Edit" seven times over to a screen reader. */}
                <span className="sr-only"> {c.title}</span>
              </Link>

              <form action={removeComponentAction}>
                <input type="hidden" name="tripId" value={tripId} />
                <input type="hidden" name="componentId" value={c.componentId} />
                <button
                  type="submit"
                  className="btn-icon size-7"
                  title={BUILDER_COPY.remove}
                >
                  <Icon name="trash" size={13} />
                  <span className="sr-only">
                    {BUILDER_COPY.remove} — {c.title}
                  </span>
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MoveButton({
  tripId,
  componentId,
  direction,
  label,
  title,
  disabled,
}: {
  tripId: string;
  componentId: string;
  direction: "up" | "down";
  label: string;
  title: string;
  disabled: boolean;
}) {
  return (
    <form action={moveComponentAction}>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="componentId" value={componentId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        className="btn-icon size-5 disabled:opacity-25"
        title={label}
      >
        <Icon name={direction === "up" ? "chevron_up" : "chevron_down"} size={11} />
        <span className="sr-only">
          {label} — {title}
        </span>
      </button>
    </form>
  );
}
