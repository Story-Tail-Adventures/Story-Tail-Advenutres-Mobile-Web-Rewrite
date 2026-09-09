import Form from "next/form";
import { DateRangePicker } from "@/components/public/DateRangePicker";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/public/dates";
import { SEARCH_TIME_ZONE } from "@/lib/public/search";
import { EXPLORE, SEARCH_FIELDS } from "./content";

interface SearchBarProps {
  /** `pill` = the rounded bar inside the hero (C203, from md); `stacked` = the body card (M203, below md). */
  variant: "pill" | "stacked";
  className?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
}

/** The stacked (mobile) form's id, so the sticky bar can submit it from outside. */
export const STACKED_SEARCH_FORM_ID = "explore-search-stacked";

/**
 * The real search form on 2.0.3 (design: the C203 pill and the M203 stacked card). A GET form
 * via next/form, so it works without JavaScript and prefetches /explore/results. Field names
 * match `parseSearchParams` (dest / in / out / travelers); everything on the results page is
 * derived from the URL that this produces.
 *
 * M203's card has no button of its own — the sticky bottom bar *is* the Search. So the
 * stacked variant keeps a submit in the DOM (it is the form's default button, which is what
 * makes Enter submit the form, with or without JavaScript) but hides it, and the bar submits
 * this form by id.
 *
 * `today` is resolved HERE, on the server, and handed to both picker instances. Letting the
 * client compute it would make the first render disagree with the server's whenever the two
 * are on different sides of midnight — and the value gates which days are selectable.
 */
export function SearchBar({ variant, className, defaultCheckIn, defaultCheckOut }: SearchBarProps) {
  const pill = variant === "pill";
  const last = SEARCH_FIELDS.length - 1;
  const today = todayIso(SEARCH_TIME_ZONE);

  return (
    <Form
      action="/explore/results"
      id={pill ? undefined : STACKED_SEARCH_FORM_ID}
      role="search"
      aria-label={EXPLORE.search.formLabel}
      className={cn(
        pill
          ? "card hidden items-center rounded-full p-0 shadow-2 md:flex"
          : "card flex flex-col gap-1 p-3 md:hidden",
        className,
      )}
    >
      {SEARCH_FIELDS.map((field, index) => {
        const id = `search-${variant}-${field.name}`;
        const numeric = field.type === "number";

        const control =
          field.type === "dates" ? (
            <DateRangePicker
              idPrefix={`search-${variant}`}
              label={field.label}
              placeholder={field.placeholder}
              today={today}
              defaultCheckIn={defaultCheckIn}
              defaultCheckOut={defaultCheckOut}
              variant={variant}
              copy={EXPLORE.dates}
            />
          ) : (
            <input
              id={id}
              name={field.name}
              type={field.type}
              inputMode={numeric ? "numeric" : undefined}
              min={numeric ? 1 : undefined}
              max={numeric ? 20 : undefined}
              maxLength={numeric ? undefined : 60}
              placeholder={field.placeholder}
              autoComplete="off"
              className={cn(
                "t-title-s w-full min-w-0 rounded-sm bg-transparent text-on-surface placeholder:text-on-surface-variant",
                pill ? "py-0.5" : "min-h-11",
              )}
            />
          );

        // The picker renders its own icon and label association (its trigger IS the labelled
        // control), so the cell chrome differs from a plain input's.
        const isDates = field.type === "dates";

        if (pill) {
          return (
            <div
              key={field.name}
              className={cn("min-w-0 flex-1 px-4 py-2.5", index < last && "border-r border-outline-variant")}
            >
              <label
                htmlFor={isDates ? `search-${variant}-dates` : id}
                className="t-label block text-on-surface-variant"
              >
                {field.label}
              </label>
              {isDates ? (
                control
              ) : (
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Icon name={field.icon} size={13} className="shrink-0 text-brand-orange" />
                  {control}
                </div>
              )}
            </div>
          );
        }

        return (
          <div
            key={field.name}
            className={cn("flex items-center gap-2.5 py-1", index < last && "border-b border-outline-variant")}
          >
            {!isDates && <Icon name={field.icon} size={14} className="shrink-0 text-brand-orange" />}
            <label
              htmlFor={isDates ? `search-${variant}-dates` : id}
              className={cn("t-label shrink-0 text-on-surface-variant", isDates ? "w-19" : "w-21.5")}
            >
              {field.label}
            </label>
            {control}
          </div>
        );
      })}

      <button
        type="submit"
        className={cn("btn btn-filled", pill ? "m-1 h-11 shrink-0" : "hidden")}
      >
        <Icon name="search" size={16} />
        {EXPLORE.search.submit}
      </button>
    </Form>
  );
}
