import Form from "next/form";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { EXPLORE, SEARCH_FIELDS } from "./content";

interface SearchBarProps {
  /** `pill` = the rounded bar inside the hero (C203, from md); `stacked` = the body card (M203, below md). */
  variant: "pill" | "stacked";
  className?: string;
}

/**
 * The real search form on 2.0.3 (design: the C203 pill and the M203 stacked card). A GET form
 * via next/form, so it works without JavaScript and prefetches /explore/results. Field names
 * match `parseSearchParams` (dest / when / travelers); everything on the results page is
 * derived from the URL that this produces.
 */
export function SearchBar({ variant, className }: SearchBarProps) {
  const pill = variant === "pill";
  const last = SEARCH_FIELDS.length - 1;

  return (
    <Form
      action="/explore/results"
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
        const input = (
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

        if (pill) {
          return (
            <div
              key={field.name}
              className={cn("min-w-0 flex-1 px-4 py-2.5", index < last && "border-r border-outline-variant")}
            >
              <label htmlFor={id} className="t-label block text-on-surface-variant">
                {field.label}
              </label>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Icon name={field.icon} size={13} className="shrink-0 text-brand-orange" />
                {input}
              </div>
            </div>
          );
        }

        return (
          <div
            key={field.name}
            className={cn("flex items-center gap-2.5 py-1", index < last && "border-b border-outline-variant")}
          >
            <Icon name={field.icon} size={14} className="shrink-0 text-brand-orange" />
            <label htmlFor={id} className="t-label w-21.5 shrink-0 text-on-surface-variant">
              {field.label}
            </label>
            {input}
          </div>
        );
      })}

      <button
        type="submit"
        className={cn("btn btn-filled", pill ? "m-1 h-11 shrink-0" : "mt-2 min-h-11 w-full")}
      >
        <Icon name="search" size={16} />
        {EXPLORE.search.submit}
      </button>
    </Form>
  );
}
