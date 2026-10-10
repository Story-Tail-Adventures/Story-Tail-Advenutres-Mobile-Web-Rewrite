import { callAgentRead, type AgentTemplateRow } from "@/lib/agent/api";
import { cents, money } from "@/lib/agent/queries";
import { tripTypeLabel } from "@/lib/agent/newTrip";

/**
 * §3.4.13's view models.
 *
 * SERVER-REACHING, unlike `cancelTrip.ts` — `loadTemplates` is called from a server
 * component and `callAgentRead` reaches `lib/supabase/server.ts`. Nothing here may be
 * imported by a `"use client"` component: that drags `next/headers` into the browser bundle
 * and 500s the route, which is the trap `hotel-search-decisions` records.
 */

export type TemplateCard = {
  templateId: string;
  name: string;
  description: string | null;
  tripTypeLabel: string;
  componentCount: number;
  dayCount: number;
  /** Already formatted, or null when the pattern carries no priced components. */
  valueLabel: string | null;
  timesUsed: number;
  /** "14× used", or null when nothing has used it — a "0× used" chip is noise. */
  usageLabel: string | null;
  /** "6 bookings · 4 days", or just the bookings when there is no day-by-day. */
  shapeLabel: string;
};

export type TemplateLibrary = {
  rows: TemplateCard[];
};

export function templateCard(r: AgentTemplateRow): TemplateCard {
  const bookings = `${r.component_count} ${r.component_count === 1 ? "booking" : "bookings"}`;
  // A pattern saved from a trip with no day-by-day is a real and useful thing — the
  // bookings are most of the value. Saying "· 0 days" would read as a defect.
  const shapeLabel =
    r.day_count > 0
      ? `${bookings} · ${r.day_count} ${r.day_count === 1 ? "day" : "days"}`
      : bookings;

  return {
    templateId: r.template_id,
    name: r.name,
    description: r.description,
    tripTypeLabel: tripTypeLabel(r.trip_type),
    componentCount: r.component_count,
    dayCount: r.day_count,
    // A dash rather than "$0", the same rule §3.3.1 settled for a client with nothing
    // committed: a labelled zero claims the pattern is worth nothing, where the truth is
    // that nobody priced it.
    valueLabel: cents(r.value_cents) === 0 ? null : money(r.value_cents, "USD"),
    timesUsed: r.times_used,
    usageLabel: r.times_used > 0 ? `${r.times_used}× used` : null,
    shapeLabel,
  };
}

export async function loadTemplates(): Promise<TemplateLibrary | null> {
  const result = await callAgentRead<AgentTemplateRow>("agent_templates");
  if (!result.ok) return null;
  return { rows: result.rows.map(templateCard) };
}
