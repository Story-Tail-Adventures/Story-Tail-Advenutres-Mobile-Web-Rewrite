"use client";

import { startTransition, useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import { mapStatementAction } from "@/app/(agent)/agent/commission/import/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Icon } from "@/components/ui/Icon";
import { OutlinedNativeSelect } from "@/components/mui/OutlinedNativeSelect";
import { STATEMENT_COPY, statementImportRows, statementSample } from "@/lib/agent/content";
import { COLUMN_OPTIONS, type MapFormState } from "@/lib/agent/statementForm";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * 3.7.5's Step 2: one row per CSV column — its header in mono, an arrow, the platform field
 * it holds, and an Auto / Manual chip — as A375_CSVImport draws it. Under each header, a
 * value from the file ("e.g. SRB-220119"), so a column called "Amt2" can be told apart.
 *
 * THE SELECTS ARE CONTROLLED. Each choice is React state, so the chips and the "paid on for
 * every row" date field follow it live, and nothing snaps back after a refused save: submit
 * is intercepted and dispatched in a transition (CommissionLineForm records why a
 * `<form action>` must not be left to reset).
 *
 * "Auto" means "as we filled it in": the column map guessed at upload, from the advisor's
 * last statement first. Once the advisor changes one, it says Manual.
 */
export function StatementMapForm({
  importId,
  version,
  headers,
  samples,
  initialSelections,
  statementDate,
  totalRows,
  today,
  isRemap,
}: {
  importId: string;
  version: number;
  headers: string[];
  samples: string[];
  initialSelections: string[];
  statementDate: string;
  totalRows: number;
  today: string;
  isRemap: boolean;
}) {
  const [state, formAction, pending] = useActionState<MapFormState, FormData>(mapStatementAction, {});
  const [selections, setSelections] = useState<string[]>(state.values?.selections ?? initialSelections);
  const needsDate = !selections.includes("paid_on");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <Box component="form" action={formAction} onSubmit={onSubmit}>
      <input type="hidden" name="importId" value={importId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="headerCount" value={headers.length} />

      <Typography component="p" variant="body2" sx={{ mt: 0.5, mb: 1, color: "text.secondary" }}>
        {STATEMENT_COPY.mapIntro}
      </Typography>

      {isRemap && (
        <Box sx={{ mb: 1.25 }}>
          <Alert tone="warning">{STATEMENT_COPY.remapWarning}</Alert>
        </Box>
      )}
      {state.formError && (
        <Box sx={{ mb: 1.25 }}>
          <Alert tone="error">{state.formError}</Alert>
        </Box>
      )}
      {state.fieldErrors?.map && (
        <Box sx={{ mb: 1.25 }} id="map-error">
          <Alert tone="error">{state.fieldErrors.map}</Alert>
        </Box>
      )}

      <Box component="ul" aria-label={STATEMENT_COPY.mapTableLabel} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {headers.map((header, i) => {
          // On a remap the stored map is the advisor's own earlier choice, not a guess.
          const auto = !isRemap && selections[i] !== "" && selections[i] === initialSelections[i];
          const changed = selections[i] !== initialSelections[i];
          return (
            <Box
              component="li"
              key={`${i}-${header}`}
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 150px) 16px minmax(0, 1fr) 64px" },
                alignItems: "center",
                columnGap: 1,
                rowGap: 0.5,
                py: 0.75,
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ display: "block", fontFamily: "mono", fontWeight: 600, color: "text.secondary", overflowWrap: "anywhere" }}
                >
                  {header}
                </Typography>
                {samples[i] && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ display: "block", color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {statementSample(samples[i])}
                  </Typography>
                )}
              </Box>
              <Box aria-hidden sx={{ display: { xs: "none", sm: "inline-flex" }, color: "text.secondary" }}>
                <Icon name="arrow_right" size={12} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                {/* The column's header is the select's name; the visible one is the mono cell
                    beside it, so the label is for screen readers only. */}
                <Box component="label" htmlFor={`col-${i}`} sx={VISUALLY_HIDDEN}>
                  {header}
                </Box>
                <OutlinedNativeSelect
                  id={`col-${i}`}
                  name={`col-${i}`}
                  size="small"
                  fullWidth
                  value={selections[i]}
                  inputProps={{ "aria-describedby": state.fieldErrors?.map ? "map-error" : undefined }}
                  onChange={(e) => {
                    const next = [...selections];
                    next[i] = e.target.value;
                    setSelections(next);
                  }}
                >
                  {COLUMN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </OutlinedNativeSelect>
              </Box>
              <Box sx={{ justifySelf: { xs: "start", sm: "end" } }}>
                {(auto || changed) && (
                  <Chip
                    size="small"
                    label={auto ? STATEMENT_COPY.autoChip : STATEMENT_COPY.manualChip}
                    sx={{ bgcolor: auto ? "success.container" : "warning.container", color: "text.primary" }}
                  />
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {needsDate && (
        <Box sx={{ mt: 1.5 }}>
          <DateField
            id="statement-date"
            name="statementDate"
            label={STATEMENT_COPY.statementDateLabel}
            hint={STATEMENT_COPY.statementDateHint}
            defaultValue={state.values?.statementDate ?? statementDate}
            max={today}
            required
            error={state.fieldErrors?.statementDate}
          />
        </Box>
      )}

      <Box sx={{ mt: 1.75 }}>
        <Button type="submit" variant="filled" fullWidth disabled={pending}>
          <Icon name="check" size={12} />
          {pending ? STATEMENT_COPY.working : statementImportRows(totalRows)}
        </Button>
      </Box>
    </Box>
  );
}
