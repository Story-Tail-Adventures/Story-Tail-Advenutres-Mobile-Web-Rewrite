"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import { LEAD_COPY } from "@/lib/agent/leads";
import { normalizePhone } from "@/lib/validation/profile";

/**
 * §3.8's writes (revived 2026-10-21, BRD §6.5; Data-Model §11). One module, three actions, the
 * house shape (`clients/actions.ts`): every rule is the `agent-lead` function's, and these turn
 * its answer into a sentence and refresh the pages that show the lead.
 *
 * STALENESS COMES OFF THE TYPED `conflict` FLAG (a 409), never a substring of the function's
 * sentence; see `lib/supabase/edge.ts`.
 */

export type LeadOpResult = { ok: true; message?: string } | { ok: false; message: string };

function refresh(leadId?: string) {
  revalidatePath("/agent/leads");
  revalidatePath("/agent");
  if (leadId) revalidatePath(`/agent/leads/${leadId}`);
}

/** 3.8.2 / 3.8.4: mark contacted, close, reopen, delete as spam. */
export async function leadOpAction(input: {
  leadId: string;
  op: "mark_contacted" | "close" | "reopen" | "delete_spam";
  reason?: string;
  note?: string;
}): Promise<LeadOpResult> {
  const result = await callAgentFunction("agent-lead", {
    op: input.op,
    leadId: input.leadId,
    ...(input.op === "close" ? { reason: input.reason, note: input.note ?? null } : {}),
  });

  if (!result.ok) {
    if (result.conflict === true) {
      // Reopen's own 409 says which: another open lead for the same email.
      return { ok: false, message: input.op === "reopen" && result.detail ? result.detail : LEAD_COPY.stale };
    }
    return {
      ok: false,
      message: result.kind === "rejected" && result.detail ? result.detail : LEAD_COPY.failed,
    };
  }

  refresh(input.leadId);
  if (input.op === "delete_spam") redirect("/agent/leads");
  return { ok: true };
}

/**
 * 3.8.3 Invite to an account: three calls, each through its own audited door. Create the client
 * (`agent-client`, as 3.3.9 does), send the §3.9 invite (`account-admin`), then link the lead
 * (`agent-lead` convert). Creating the client usually converts the lead already (a trigger,
 * Data-Model §11.1); the third call makes it certain even when the advisor changed the email.
 *
 * If the email is already a client's, nothing is created and nothing is sent: the lead is
 * linked to that client, as ruling 7 says.
 */
export async function inviteLeadAction(input: {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}): Promise<LeadOpResult & { clientId?: string }> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, message: LEAD_COPY.inviteLastNameHint };

  const phone = input.phone ? normalizePhone(input.phone) : null;
  const created = await callAgentFunction("agent-client", {
    op: "create",
    client: {
      firstName,
      lastName,
      preferredName: null,
      email: input.email.trim(),
      phone: phone && phone.ok ? phone.value : null,
      dateOfBirth: null,
      tags: [],
      importantDates: [],
      notes: null,
      address: { line1: null, line2: null, city: null, region: null, postalCode: null, country: null },
    },
  });
  if (!created.ok) {
    return { ok: false, message: created.kind === "rejected" && created.detail ? created.detail : LEAD_COPY.failed };
  }

  let clientId: string | null = null;
  let existing = false;
  if (created.data.outcome === "duplicate_email" && typeof created.data.existingClientId === "string") {
    clientId = created.data.existingClientId;
    existing = true;
  } else if (typeof created.data.clientId === "string") {
    clientId = created.data.clientId;
  }
  if (!clientId) return { ok: false, message: LEAD_COPY.failed };

  let sent = existing;
  if (!existing) {
    const invite = await callAgentFunction("account-admin", { clientId, op: "invite" });
    sent = invite.ok && invite.data.outcome === "sent";
  }

  const linked = await callAgentFunction("agent-lead", { op: "convert", leadId: input.leadId, clientId });
  refresh(input.leadId);
  revalidatePath(`/agent/clients/${clientId}`);
  if (!linked.ok && linked.conflict !== true) {
    return { ok: false, message: LEAD_COPY.failed, clientId };
  }

  if (existing) return { ok: true, message: LEAD_COPY.inviteExisting, clientId };
  return sent ? { ok: true, clientId } : { ok: true, message: LEAD_COPY.inviteCreatedNotSent, clientId };
}

export type AddLeadState = {
  formError?: string;
  /** "That email is already a client's": the form offers "Open client". */
  clientId?: string;
  values?: { firstName: string; lastName: string; email: string; phone: string; source: string; note: string };
};

/** 3.8.5 Add lead. Lands on the lead's page; an email on a client record offers that client. */
export async function addLeadAction(_prev: AddLeadState, form: FormData): Promise<AddLeadState> {
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const values = {
    firstName: text("firstName"),
    lastName: text("lastName"),
    email: text("email"),
    phone: text("phone"),
    source: text("source"),
    note: text("note"),
  };

  const result = await callAgentFunction("agent-lead", {
    op: "create",
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    phone: values.phone,
    source: values.source,
    message: values.note,
  });

  if (!result.ok) {
    return {
      formError: result.kind === "rejected" && result.detail ? result.detail : LEAD_COPY.failed,
      values,
    };
  }
  if (result.data.outcome === "client_exists") {
    return {
      formError: LEAD_COPY.clientExists,
      clientId: typeof result.data.clientId === "string" ? result.data.clientId : undefined,
      values,
    };
  }
  const leadId = result.data.leadId;
  if (typeof leadId !== "string") return { formError: LEAD_COPY.failed, values };

  refresh(leadId);
  redirect(`/agent/leads/${leadId}${result.data.outcome === "added" ? "?added=1" : ""}`);
}
