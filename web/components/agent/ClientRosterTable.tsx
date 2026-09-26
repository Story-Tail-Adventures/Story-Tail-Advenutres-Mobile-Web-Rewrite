import Link from "next/link";

import { Avatar } from "@/components/public/Avatar";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientRosterRow } from "@/lib/agent/clients";

/**
 * Screen 3.3.1's rows — §4.4 Pattern B, which asks for two genuinely different structures.
 *
 * TWO STRUCTURES, NOT ONE RESTYLED. Pattern B's web half is "a true data table with sortable
 * column headers, sticky header row"; its mobile half is "a vertical list of cards, one item
 * per row". Those are not the same tree with different CSS. Collapsing a `<table>` to
 * `display:block` on a phone is the usual shortcut and it silently drops the table role from
 * the accessibility tree — the headers stop being announced with their cells, which is the
 * one thing the table was for. So the cards are a real `<ul>` and the table is a real
 * `<table>`, and exactly one is in the layout at a time.
 *
 * The duplication is 25 rows of markup. The alternative is a structure that lies to a screen
 * reader at whichever width it lies at.
 *
 * ROWS LINK INTO §3.3.2 as of 2026-09-26. Until the detail screen existed they were plain
 * list items, on §3.2.1's rule that a row wired to nothing is worse than a row that is
 * plainly not a link. It exists now, so they are links — on BOTH layouts, because a phone
 * row is the one most likely to be tapped.
 *
 * NO BULK-SELECT COLUMN. The prototype draws a checkbox in the header and in every row, and
 * nothing consumes them: bulk-tag is a write (§3.3.9's migration) and bulk-message needs
 * §3.10, which is unbuilt. §6.4's own amendment settled the principle when it cut the search
 * field from the top bar rather than disabling it — a control that does nothing is worse
 * than no control. The column arrives with the action behind it.
 */

function RowMeta({ row }: { row: ClientRosterRow }) {
  return (
    <>
      <span className="t-title-s block truncate">{row.displayName}</span>
      <span className="t-body-s block truncate text-[var(--md-on-surface-variant)]">
        {row.email ?? CLIENT_COPY.noEmail}
      </span>
    </>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="chip h-5 px-2 text-[10.5px]">
          {t}
        </span>
      ))}
    </span>
  );
}

/**
 * The money cell. A dash, never "$0.00": the accessor returns a NULL currency for a client
 * with nothing committed, and a labelled zero would claim they have spent nothing where the
 * truth is that nothing has been booked yet.
 *
 * `lifetimeCurrencyCount > 1` gets a marker, because that row's figure covers one currency
 * out of several and the number alone would read as a total.
 */
function Lifetime({ row }: { row: ClientRosterRow }) {
  if (!row.lifetimeLabel) {
    return <span className="text-[var(--md-on-surface-variant)]">{CLIENT_COPY.noLifetime}</span>;
  }
  return (
    <span className="font-mono font-bold">
      {row.lifetimeLabel}
      {row.lifetimeCurrencyCount > 1 && (
        <sup
          className="ml-0.5 font-sans text-[10px] font-semibold text-[var(--md-on-surface-variant)]"
          title={`Covers this client's most-used currency of ${row.lifetimeCurrencyCount}.`}
        >
          *
        </sup>
      )}
    </span>
  );
}

function NextTrip({ row }: { row: ClientRosterRow }) {
  if (!row.nextTripLabel) {
    return <span className="text-[var(--md-on-surface-variant)]">{CLIENT_COPY.noTrip}</span>;
  }
  return (
    <span className={row.nextTripIsNow ? "font-semibold text-[var(--md-primary)]" : undefined}>
      {row.nextTripLabel}
    </span>
  );
}

export function ClientRosterTable({ rows }: { rows: ClientRosterRow[] }) {
  return (
    <>
      {/* ── Phone: a list of cards (Pattern B mobile) ─────────────────────── */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.clientId}>
            <Link
              href={`/agent/clients/${row.clientId}`}
              className="card flex items-center gap-3 px-3.5 py-3 hover:bg-[var(--md-surface-2)]"
            >
            <Avatar initials={row.initials} size={32} tone="brand" />
            <span className="min-w-0 flex-1">
              <RowMeta row={row} />
              <span className="t-body-s mt-1 block truncate text-[var(--md-on-surface-variant)]">
                {row.nextTripLabel ?? row.lastTripLabel ?? CLIENT_COPY.noTrip}
              </span>
            </span>
            <span className="t-body-s shrink-0 text-right">
              <Lifetime row={row} />
            </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* ── Tablet and up: the data table (Pattern B web) ─────────────────── */}
      <div className="card hidden overflow-hidden p-0 md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--md-on-surface-variant)]">
              <th scope="col" className="px-3.5 py-2.5 text-left">
                {CLIENT_COPY.colClient}
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-left">
                {CLIENT_COPY.colLastTrip}
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-left">
                {CLIENT_COPY.colNextTrip}
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-right">
                {CLIENT_COPY.colLifetime}
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-left">
                {CLIENT_COPY.colTags}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.clientId} className="border-t border-[var(--md-outline-variant)]">
                <td className="px-3.5 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar initials={row.initials} size={32} tone="brand" />
                    <Link
                      href={`/agent/clients/${row.clientId}`}
                      className="min-w-0 hover:underline"
                    >
                      <RowMeta row={row} />
                    </Link>
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--md-on-surface-variant)]">
                  {row.lastTripLabel ?? CLIENT_COPY.noTrip}
                </td>
                <td className="px-3.5 py-2.5 text-[12.5px] font-medium">
                  <NextTrip row={row} />
                </td>
                <td className="px-3.5 py-2.5 text-right text-[12.5px]">
                  <Lifetime row={row} />
                </td>
                <td className="px-3.5 py-2.5">
                  <Tags tags={row.tags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
