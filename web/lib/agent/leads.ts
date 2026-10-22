import {
  callAgentRead,
  type AgentClientLeadOriginRow,
  type AgentKpiRow,
  type AgentLeadListRow,
  type AgentLeadMessageRow,
  type AgentLeadRow,
  type LeadStatus,
} from "@/lib/agent/api";
import {
  CLOSE_REASON_LABEL,
  LEAD_COPY,
  LEAD_FILTERS,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_KIND,
  LEAD_STATUS_LABEL,
  leadName,
  matchesFilter,
  pageLabel,
  replyHref,
  type LeadFilter,
} from "@/lib/agent/leadsCopy";
import { agentIdentity, localDate, monthDay, waitingLabel } from "@/lib/agent/queries";

/**
 * §3.8 Leads: the SERVER loaders (they read the session through `callAgentRead`). The copy and
 * pure helpers are in `leadsCopy.ts`, which client islands may import and this file may not be.
 */
export * from "@/lib/agent/leadsCopy";

export type LeadListItem = {
  id: string;
  name: string;
  preview: string;
  sourceLabel: string;
  status: LeadStatus;
  statusLabel: string;
  statusKind: string;
  alreadyClient: boolean;
  noteCount: number;
  /** New only: "Waiting 2 days". */
  waitLabel: string | null;
  /** "Oct 21", the latest note's date in the advisor's zone. */
  dateLabel: string | null;
};

export type LeadList = {
  filter: LeadFilter;
  items: LeadListItem[];
  counts: Record<LeadFilter, number>;
};

async function today(): Promise<{ today: string; timeZone: string } | null> {
  const [me, kpi] = await Promise.all([agentIdentity(), callAgentRead<AgentKpiRow>("agent_kpis")]);
  if (!kpi.ok || !kpi.rows[0]) return null;
  return { today: kpi.rows[0].as_of_date, timeZone: me.timeZone };
}

export function toListItem(row: AgentLeadListRow, todayIso: string, timeZone: string): LeadListItem {
  return {
    id: row.id,
    name: leadName(row),
    preview: row.latest_preview ?? "",
    sourceLabel: LEAD_SOURCE_LABEL[row.source],
    status: row.status,
    statusLabel: row.already_client ? LEAD_COPY.alreadyClient : LEAD_STATUS_LABEL[row.status],
    statusKind: LEAD_STATUS_KIND[row.status],
    alreadyClient: row.already_client,
    noteCount: row.message_count,
    waitLabel: row.status === "new" ? waitingLabel(todayIso, row.first_message_at, timeZone) : null,
    dateLabel: monthDay(localDate(row.last_message_at, timeZone)),
  };
}

/** 3.8.1. Null when the read failed (an empty list is a populated object). */
export async function loadLeads(filter: LeadFilter): Promise<LeadList | null> {
  const [res, when] = await Promise.all([callAgentRead<AgentLeadListRow>("agent_leads"), today()]);
  if (!res.ok || !when) return null;
  const counts = { open: 0, converted: 0, closed: 0, all: 0 } as Record<LeadFilter, number>;
  for (const row of res.rows) {
    for (const f of LEAD_FILTERS) if (matchesFilter(row.status, f)) counts[f] += 1;
  }
  return {
    filter,
    counts,
    items: res.rows
      .filter((r) => matchesFilter(r.status, filter))
      .map((r) => toListItem(r, when.today, when.timeZone)),
  };
}

export type LeadDetail = {
  lead: AgentLeadRow;
  name: string;
  statusLabel: string;
  statusKind: string;
  sourceLabel: string;
  replyHref: string;
  dates: { label: string; value: string }[];
  closeReasonLabel: string | null;
  campaign: string | null;
  messages: {
    id: string;
    body: string;
    byAgent: boolean;
    about: string | null;
    from: string | null;
    dateLabel: string | null;
  }[];
};

/** 3.8.2. `missing` for no such lead or somebody else's (one answer for both). */
export async function loadLead(leadId: string): Promise<LeadDetail | "missing" | null> {
  const [leadRes, msgRes, me] = await Promise.all([
    callAgentRead<AgentLeadRow>("agent_lead", { p_lead_id: leadId }),
    callAgentRead<AgentLeadMessageRow>("agent_lead_messages", { p_lead_id: leadId }),
    agentIdentity(),
  ]);
  if (!leadRes.ok || !msgRes.ok) return null;
  const lead = leadRes.rows[0];
  if (!lead) return "missing";

  const day = (ts: string | null) => (ts ? monthDay(localDate(ts, me.timeZone)) : null);
  const dates: { label: string; value: string | null }[] = [
    { label: LEAD_COPY.firstNoteLabel, value: day(lead.created_at) },
    { label: LEAD_COPY.contactedLabel, value: day(lead.first_contacted_at) },
    { label: LEAD_COPY.convertedLabel, value: day(lead.converted_at) },
    { label: LEAD_COPY.closedLabel, value: day(lead.closed_at) },
  ];

  return {
    lead,
    name: leadName(lead),
    statusLabel: lead.already_client ? LEAD_COPY.alreadyClient : LEAD_STATUS_LABEL[lead.status],
    statusKind: LEAD_STATUS_KIND[lead.status],
    sourceLabel: LEAD_SOURCE_LABEL[lead.source],
    replyHref: replyHref(lead),
    dates: dates.flatMap((d) => (d.value ? [{ label: d.label, value: d.value }] : [])),
    closeReasonLabel: lead.close_reason ? CLOSE_REASON_LABEL[lead.close_reason] : null,
    campaign: [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" · ") || null,
    messages: msgRes.rows.map((m) => {
      const page = pageLabel(m.page);
      return {
        id: m.id,
        body: m.body,
        byAgent: m.entered_by_agent,
        about: m.about_label,
        from: page ? LEAD_COPY.fromPage(page) : null,
        dateLabel: day(m.created_at),
      };
    }),
  };
}

/** 3.3.2's "First reached out as a lead on Oct 21", or null. */
export async function loadClientLeadOrigin(
  clientId: string,
): Promise<{ leadId: string; dateLabel: string } | null> {
  const [res, me] = await Promise.all([
    callAgentRead<AgentClientLeadOriginRow>("agent_client_lead_origin", { p_client_id: clientId }),
    agentIdentity(),
  ]);
  const row = res.ok ? res.rows[0] : undefined;
  if (!row) return null;
  return { leadId: row.lead_id, dateLabel: monthDay(localDate(row.created_at, me.timeZone)) ?? "" };
}
