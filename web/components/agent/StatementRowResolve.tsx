"use client";

import { startTransition, useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";

import { resolveRowAction } from "@/app/(agent)/agent/commission/import/actions";
import { OutlinedNativeSelect } from "@/components/mui/OutlinedNativeSelect";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { fieldLabelSx } from "@/components/ui/Field";
import { STATEMENT_COPY } from "@/lib/agent/content";
import type { StatementActionState } from "@/lib/agent/statementForm";
import type { CandidateView } from "@/lib/agent/statements";
import type { SupplierGroup } from "@/lib/agent/tripBuilder";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * 3.7.6's Resolve, as four small forms on one page — use the suggestion, match a different
 * line, create a new one, or set the row aside. They share one action state, and a refusal
 * shows INSIDE the card whose button was pressed: at the top of the page it was off screen
 * for the create form, the one most likely to be refused.
 *
 * Every choice is CONTROLLED state (the candidate, the supplier, the amounts) and every form
 * submits in a transition, so a refused decision does not snap a radio or a select back to
 * what it was — the reset that recorded a wrong status in Stage 2.
 *
 * Nothing here touches the ledger: a decision is stored on the row, and lands only when the
 * statement is marked reconciled.
 */
export function StatementRowResolve({
  importId,
  version,
  rowId,
  canDecideMoney,
  suggestion,
  candidates,
  createTrip,
  suppliers,
  initialSupplierId,
  initialGross,
  initialRate,
}: {
  importId: string;
  version: number;
  rowId: string;
  /** False for an unreadable row: it can only be set aside. */
  canDecideMoney: boolean;
  suggestion: { label: string; note: string | null } | null;
  candidates: CandidateView[];
  /** The trip a new line would go on, once chosen by the search above. */
  createTrip: { tripId: string; title: string; clientName: string } | null;
  suppliers: SupplierGroup[];
  initialSupplierId: string;
  initialGross: string;
  initialRate: string;
}) {
  const [state, formAction, pending] = useActionState<StatementActionState, FormData>(resolveRowAction, {});
  // Nothing pre-chosen: a ready-ticked first line made "Match this line" one careless click
  // from paying the wrong booking. The suggestion, when there is one, has its own card.
  const [candidate, setCandidate] = useState("");
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [gross, setGross] = useState(initialGross);
  const [rate, setRate] = useState(initialRate);
  // Until the advisor types a rate, changing the supplier brings that supplier's default.
  const [rateTouched, setRateTouched] = useState(false);
  const defaults = new Map(suppliers.flatMap((g) => g.suppliers).map((x) => [x.supplierId, x.defaultCommissionPct]));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  /**
   * The refusal, in the card that asked for it (Alert is itself a live region). Which card is
   * read off the returned state, not set on submit: set on submit, the previous refusal
   * flashed in the card just pressed until the new answer came back.
   */
  const errorFor = (action: string) =>
    state.formError && state.action === action ? (
      <Box sx={{ mb: 1.25 }}>
        <Alert tone="error">{state.formError}</Alert>
      </Box>
    ) : null;

  const hidden = (action: string) => (
    <>
      <input type="hidden" name="importId" value={importId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="rowId" value={rowId} />
      <input type="hidden" name="action" value={action} />
    </>
  );

  return (
    <Box sx={{ display: "grid", gap: 1.75, maxWidth: 720 }}>
      {canDecideMoney && suggestion && (
        <Section title={STATEMENT_COPY.useSuggestionTitle}>
          {errorFor("confirm")}
          <Typography component="p" variant="body2" sx={{ fontWeight: 500 }}>{suggestion.label}</Typography>
          {suggestion.note && (
            <Typography component="p" variant="caption" sx={{ display: "block", color: "warning.main" }}>
              {suggestion.note}
            </Typography>
          )}
          <Box component="form" action={formAction} onSubmit={submit} sx={{ mt: 1.25 }}>
            {hidden("confirm")}
            <Button type="submit" variant="filled" size="sm" disabled={pending}>
              {STATEMENT_COPY.useSuggestion}
            </Button>
          </Box>
        </Section>
      )}

      {canDecideMoney && (
        <Section title={STATEMENT_COPY.matchTitle} hint={STATEMENT_COPY.matchHint}>
          {errorFor("match")}
          {candidates.length === 0 ? (
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {STATEMENT_COPY.candidatesEmpty}
            </Typography>
          ) : (
            <Box component="form" action={formAction} onSubmit={submit}>
              {hidden("match")}
              <FormControl sx={{ width: "100%" }}>
                <FormLabel id="candidate-label" sx={VISUALLY_HIDDEN}>
                  {STATEMENT_COPY.matchTitle}
                </FormLabel>
                <RadioGroup
                  name="commissionId"
                  aria-labelledby="candidate-label"
                  value={candidate}
                  onChange={(e) => setCandidate(e.target.value)}
                >
                  {candidates.map((c) => (
                    <FormControlLabel
                      key={c.commissionId}
                      value={c.commissionId}
                      control={<Radio size="small" />}
                      sx={{ alignItems: "flex-start", m: 0, py: 0.5, borderTop: 1, borderColor: "divider" }}
                      label={
                        <Box sx={{ pt: 0.75 }}>
                          <Typography component="span" variant="body2" sx={{ display: "block", fontWeight: 500 }}>
                            {c.title}
                          </Typography>
                          <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                            {[c.meta, c.travelLabel].filter(Boolean).join(" · ")}
                          </Typography>
                        </Box>
                      }
                    />
                  ))}
                </RadioGroup>
              </FormControl>
              <Box sx={{ mt: 1.25 }}>
                <Button type="submit" variant="tonal" size="sm" disabled={pending || candidate === ""}>
                  {STATEMENT_COPY.matchButton}
                </Button>
              </Box>
            </Box>
          )}
        </Section>
      )}

      {canDecideMoney && createTrip && (
        <Section title={STATEMENT_COPY.createTitle} hint={STATEMENT_COPY.createHint}>
          {errorFor("create")}
          <Box component="form" action={formAction} onSubmit={submit} sx={{ display: "grid", gap: 1.25 }}>
            {hidden("create")}
            <input type="hidden" name="tripId" value={createTrip.tripId} />
            <Typography component="p" variant="body2">
              <Box component="strong" sx={{ fontWeight: 600 }}>{createTrip.title}</Box>
              {" · "}
              {createTrip.clientName}
            </Typography>
            <FormControl fullWidth>
              <FormLabel htmlFor="create-supplier" sx={fieldLabelSx}>{STATEMENT_COPY.createSupplierLabel}</FormLabel>
              <OutlinedNativeSelect
                id="create-supplier"
                name="supplierId"
                size="small"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  const pct = defaults.get(e.target.value);
                  if (!rateTouched && pct !== null && pct !== undefined) setRate(String(pct));
                }}
                required
              >
                <option value="" disabled>{STATEMENT_COPY.createSupplierLabel}</option>
                {suppliers.map((g) => (
                  <optgroup key={g.kindLabel} label={g.kindLabel}>
                    {g.suppliers.map((s) => (
                      <option key={s.supplierId} value={s.supplierId}>{s.name}</option>
                    ))}
                  </optgroup>
                ))}
              </OutlinedNativeSelect>
            </FormControl>
            <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) minmax(0, 1fr)" } }}>
              <FormControl fullWidth>
                <FormLabel htmlFor="create-gross" sx={fieldLabelSx}>{STATEMENT_COPY.createGrossLabel}</FormLabel>
                <OutlinedInput
                  id="create-gross"
                  name="gross"
                  size="small"
                  inputProps={{ inputMode: "decimal" }}
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                  startAdornment={<Typography component="span" variant="body2" sx={{ color: "text.secondary", mr: 0.5 }}>$</Typography>}
                />
              </FormControl>
              <FormControl fullWidth>
                <FormLabel htmlFor="create-rate" sx={fieldLabelSx}>{STATEMENT_COPY.createRateLabel}</FormLabel>
                <OutlinedInput
                  id="create-rate"
                  name="rate"
                  size="small"
                  inputProps={{ inputMode: "decimal" }}
                  value={rate}
                  onChange={(e) => {
                    setRate(e.target.value);
                    setRateTouched(true);
                  }}
                />
              </FormControl>
            </Box>
            <Box>
              <Button type="submit" variant="tonal" size="sm" disabled={pending || supplierId === ""}>
                {STATEMENT_COPY.createButton}
              </Button>
            </Box>
          </Box>
        </Section>
      )}

      <Section title={STATEMENT_COPY.ignoreTitle} hint={STATEMENT_COPY.ignoreHint}>
        {errorFor("ignore")}
        <Box component="form" action={formAction} onSubmit={submit}>
          {hidden("ignore")}
          <Button type="submit" variant="text" size="sm" disabled={pending}>
            {STATEMENT_COPY.ignoreButton}
          </Button>
        </Box>
      </Section>
    </Box>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card component="section">
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>{title}</Typography>
        {hint && (
          <Typography component="p" variant="caption" sx={{ display: "block", mb: 1, color: "text.secondary" }}>
            {hint}
          </Typography>
        )}
        <Box sx={{ mt: hint ? 0 : 1 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}
