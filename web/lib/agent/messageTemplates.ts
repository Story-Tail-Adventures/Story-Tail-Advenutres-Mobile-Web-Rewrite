import {
  callAgentRead,
  type AgentMessageMergeContextRow,
  type AgentMessageTemplateRow,
} from "@/lib/agent/api";
import { agentIdentity } from "@/lib/agent/queries";
import { mergeValues, type MergeValues } from "@/lib/agent/templateMerge";
import { toTemplate, type MessageTemplate, type PickerData } from "@/lib/agent/templateLibrary";

export { groupTemplates, knownTags } from "@/lib/agent/templateLibrary";
export type { MessageTemplate, PickerData, TemplateGroup } from "@/lib/agent/templateLibrary";

/**
 * §3.10 Stage 2's LOADERS: the library (3.10.4), one template for the editor (3.10.5), and
 * what the picker (3.10.3) needs. SERVER ONLY. The view model and its pure helpers are in
 * `templateLibrary.ts`, which is what client components import.
 */

export async function loadMessageTemplates(archived = false): Promise<MessageTemplate[] | null> {
  const [me, res] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentMessageTemplateRow>("agent_message_templates", { p_archived: archived }),
  ]);
  if (!res.ok) return null;
  return res.rows.map((r) => toTemplate(r, me.timeZone));
}

export type TemplateResult =
  | { ok: true; template: MessageTemplate }
  | { ok: false; reason: "not-found" | "unavailable" };

export async function loadMessageTemplate(templateId: string): Promise<TemplateResult> {
  const [me, res] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentMessageTemplateRow>("agent_message_template", { p_template_id: templateId }),
  ]);
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const row = res.rows[0];
  // Zero rows for "no such template" and "not yours" alike.
  if (!row) return { ok: false, reason: "not-found" };
  return { ok: true, template: toTemplate(row, me.timeZone) };
}

/**
 * The picker's merge values for one client (and trip, and milestone). `null` when the read
 * failed or named something not the caller's: the picker then fills nothing, and every field
 * reads as missing, which is the safe failure (Insert as-is off, Send refuses raw tokens).
 */
export async function loadMergeValues(
  clientId: string,
  tripId: string | null,
  milestoneId: string | null = null,
): Promise<MergeValues | null> {
  const res = await callAgentRead<AgentMessageMergeContextRow>("agent_message_merge_context", {
    p_client_id: clientId,
    p_trip_id: tripId,
    p_milestone_id: milestoneId,
  });
  const r = res.ok ? res.rows[0] : undefined;
  if (!r) return null;
  return mergeValues({
    clientFirstName: r.client_first_name,
    agentFirstName: r.agent_first_name,
    tripTitle: r.trip_title,
    tripDestinations: r.trip_destinations,
    tripStartDate: r.trip_start_date,
    tripEndDate: r.trip_end_date,
    paymentLabel: r.payment_label,
    paymentOwedCents: r.payment_owed_cents,
    paymentCurrency: r.payment_currency,
    paymentDueDate: r.payment_due_date,
    paymentLink: r.payment_link ?? null,
  });
}

export async function loadPickerData(
  clientId: string,
  tripId: string | null,
  remindMilestoneId: string | null,
): Promise<PickerData | null> {
  const [templates, values] = await Promise.all([
    loadMessageTemplates(false),
    loadMergeValues(clientId, tripId, remindMilestoneId),
  ]);
  if (!templates) return null;
  return {
    templates,
    values: values ?? {},
    startOn: remindMilestoneId && values?.["payment.label"] ? "payment_reminder" : null,
  };
}
