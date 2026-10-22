"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";

import { addLeadAction, type AddLeadState } from "@/app/(agent)/agent/leads/actions";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { LEAD_COPY, LEAD_SOURCE_LABEL, MANUAL_SOURCES } from "@/lib/agent/leadsCopy";

/**
 * Screen 3.8.5 Add Lead (revived 2026-10-21, BRD §6.5). Pattern A. A client island only for
 * `useActionState`; every rule is `agent-lead`'s, including the refusal of a card number.
 */

const SOURCE_OPTIONS = MANUAL_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABEL[s] }));

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" disabled={pending}>
      {pending ? LEAD_COPY.saving : LEAD_COPY.save}
    </Button>
  );
}

export function AddLeadForm() {
  const [state, formAction, isPending] = useActionState<AddLeadState, FormData>(addLeadAction, {});
  const v = state.values;

  return (
    <Box component="form" action={formAction} sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      {state.formError && (
        <Alert tone="error">
          {state.formError}
          {state.clientId && (
            <>
              {" "}
              <MuiLink component={NextLink} href={`/agent/clients/${state.clientId}`} color="inherit" sx={{ fontWeight: 600 }}>
                {LEAD_COPY.openClient}
              </MuiLink>
            </>
          )}
        </Alert>
      )}

      <Box component="fieldset" disabled={isPending} sx={{ display: "contents", m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 1.25 }}>
          <Field id="firstName" name="firstName" label={LEAD_COPY.firstName} required maxLength={80} defaultValue={v?.firstName} />
          <Field id="lastName" name="lastName" label={LEAD_COPY.lastName} maxLength={80} defaultValue={v?.lastName} />
        </Box>
        <Field id="email" name="email" type="email" label={LEAD_COPY.email} required maxLength={254} defaultValue={v?.email} />
        <Field id="phone" name="phone" type="tel" label={LEAD_COPY.phone} maxLength={40} defaultValue={v?.phone} />
        <SelectField
          id="source"
          name="source"
          label={LEAD_COPY.source}
          options={SOURCE_OPTIONS}
          defaultValue={v?.source || "phone"}
        />
        <TextareaField id="note" name="note" label={LEAD_COPY.note} required rows={4} maxLength={2000} defaultValue={v?.note} />
      </Box>

      <Box sx={{ mt: 0.5 }}>
        <Submit />
      </Box>
    </Box>
  );
}
