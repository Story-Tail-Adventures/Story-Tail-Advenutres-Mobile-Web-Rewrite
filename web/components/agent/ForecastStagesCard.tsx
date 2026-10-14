"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";

import { saveWeightsAction } from "@/app/(agent)/agent/commission/forecast/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { fieldInputSx } from "@/components/ui/Field";
import { FORECAST_COPY, forecastNewTotal } from "@/lib/agent/content";
import type { ForecastStageView } from "@/lib/agent/forecast";
import {
  parseWeight,
  weightedCents,
  type ForecastStage,
  type WeightsFormState,
} from "@/lib/agent/forecastWeights";
import { formatTripMoney } from "@/lib/trips/money";

const ADJUST_ID = "forecast-adjust-weights";

/**
 * A377_Forecast's left card: the weighted total, then one row per stage — name, a bar for the
 * weight, the weight, the weighted amount.
 *
 * "WEIGHTS BELOW ADJUSTABLE" (the artboard's caption) is an edit mode, not a slider per row:
 * the weights are saved, and they set the worklist's confidence too (Gyasi, 2026-10-12), so the
 * change is a deliberate Save. While typing, each row AND the total preview the result, from
 * the same arithmetic the server uses, before anything is written.
 *
 * WHAT REVIEW FIXED HERE:
 *  - Edit mode is `editing` alone. It once also stayed open while a refusal was showing, and
 *    since an action's state only changes on the next dispatch, Cancel could never close it.
 *  - The weights the save names as "what I saw" are snapshotted when edit mode OPENS, not read
 *    from props at submit: a refresh in between would otherwise quietly update them and let an
 *    older draft overwrite a newer save.
 *  - Focus moves into the first weight on Adjust and back to Adjust on Cancel; each input says
 *    why it is invalid, in a region that is always mounted so it is announced.
 *
 * Controlled inputs, submitted in a transition: a refused save keeps every number typed.
 */
export function ForecastStagesCard({
  totalLabel,
  acrossLabel,
  stages,
  currency,
}: {
  totalLabel: string;
  acrossLabel: string | null;
  stages: ForecastStageView[];
  currency: string;
}) {
  const [state, formAction, pending] = useActionState<WeightsFormState, FormData>(saveWeightsAction, {});
  const saved = Object.fromEntries(stages.map((s) => [s.stage, String(s.weightPct)])) as Record<ForecastStage, string>;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<ForecastStage, string>>(saved);
  const [shown, setShown] = useState<Record<ForecastStage, string>>(saved);
  const [showError, setShowError] = useState(false);

  const firstInput = useRef<HTMLInputElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (editing) firstInput.current?.focus();
    // By id: the Button primitive does not forward a ref.
    else if (opened.current) document.getElementById(ADJUST_ID)?.focus();
    opened.current = opened.current || editing;
  }, [editing]);

  function open() {
    setDraft(saved);
    setShown(saved);
    setShowError(false);
    setEditing(true);
  }

  function cancel() {
    setDraft(saved);
    setShowError(false);
    setEditing(false);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setShowError(true);
    startTransition(() => formAction(data));
  }

  const typed = (s: ForecastStageView) => (editing ? parseWeight(draft[s.stage] ?? "") : null);
  const anyInvalid = editing && stages.some((s) => typed(s) === null);

  // The total the save would produce: rounded ONCE from the exact sum, as the server rounds.
  const preview = editing && !anyInvalid
    ? (() => {
        const raw = stages.reduce((n, s) => n + s.rawCents, 0);
        const exact = stages.reduce((n, s) => n + (s.rawCents * (typed(s) ?? 0)) / 100, 0);
        const total = Math.round(exact);
        return forecastNewTotal(
          formatTripMoney(total, currency, { whole: true }),
          raw > 0 ? Math.round((total * 100) / raw) : null,
        );
      })()
    : "";

  return (
    <Card>
      <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
        <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
          {FORECAST_COPY.weightedTitle}
        </Typography>
        <Typography component="p" variant="h3" sx={{ m: 0, mt: 1, mb: 0.25, fontWeight: 700, color: "primary.main" }}>
          {totalLabel}
        </Typography>
        {acrossLabel && (
          <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {acrossLabel}
          </Typography>
        )}
        {/* Always in the DOM, so the new total is announced as it changes. */}
        <Typography
          component="p"
          variant="caption"
          aria-live="polite"
          sx={{ display: "block", color: "text.primary", fontWeight: 600, minHeight: editing ? "1.5em" : 0 }}
        >
          {preview}
        </Typography>
        <Divider sx={{ my: 1.5 }} />

        <Box component="form" action={formAction} onSubmit={onSubmit}>
          {editing && showError && state.formError && (
            <Box sx={{ mb: 1.25 }}>
              <Alert tone="error">{state.formError}</Alert>
            </Box>
          )}

          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {stages.map((s, i) => {
              const t = typed(s);
              const pct = t ?? s.weightPct;
              const amount = editing && t !== null
                ? formatTripMoney(weightedCents(s.rawCents, t), currency, { whole: true })
                : s.weightedLabel;
              const invalid = editing && t === null;
              const hintId = `weight-${s.stage}-hint`;
              return (
                <Box
                  component="li"
                  key={s.stage}
                  sx={{
                    display: "grid",
                    // A phone puts the bar on its own row; from `sm` the artboard's one line.
                    gridTemplateAreas: { xs: '"name weight amount" "bar bar bar"', sm: '"name bar weight amount"' },
                    gridTemplateColumns: {
                      xs: `minmax(0, 1fr) ${editing ? "88px" : "auto"} minmax(0, auto)`,
                      sm: `minmax(0, 80px) minmax(0, 1fr) ${editing ? "88px" : "auto"} minmax(0, 80px)`,
                    },
                    alignItems: "center",
                    columnGap: 1.25,
                    rowGap: 0.5,
                    py: 0.75,
                  }}
                >
                  <Box sx={{ gridArea: "name", minWidth: 0 }}>
                    <Typography component="span" variant="subtitle2" sx={{ display: "block" }}>{s.label}</Typography>
                    <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                      {s.tripCountLabel}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    aria-hidden
                    sx={{ gridArea: "bar", height: 6, borderRadius: 3, bgcolor: "surface.3" }}
                  />
                  <Box sx={{ gridArea: "weight", justifySelf: "end", minWidth: 0 }}>
                    {editing ? (
                      <>
                        <input type="hidden" name={`expected-${s.stage}`} value={shown[s.stage]} />
                        <OutlinedInput
                          name={`weight-${s.stage}`}
                          size="small"
                          value={draft[s.stage] ?? ""}
                          error={invalid}
                          onChange={(e) => setDraft({ ...draft, [s.stage]: e.target.value })}
                          inputRef={i === 0 ? firstInput : undefined}
                          inputProps={{
                            inputMode: "numeric",
                            autoComplete: "off",
                            "aria-label": `${s.label} ${FORECAST_COPY.weightLabel}`,
                            "aria-invalid": invalid ? true : undefined,
                            "aria-describedby": invalid ? hintId : undefined,
                          }}
                          endAdornment={<Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>%</Typography>}
                          sx={{ ...fieldInputSx, width: 88, pr: 1, "& input": { px: 1, textAlign: "right" } }}
                        />
                      </>
                    ) : (
                      <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                        {pct}%
                      </Typography>
                    )}
                  </Box>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ gridArea: "amount", fontFamily: "mono", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}
                  >
                    {amount}
                  </Typography>
                  {invalid && (
                    <Typography
                      id={hintId}
                      component="span"
                      variant="caption"
                      sx={{ gridColumn: "1 / -1", color: "error.main" }}
                    >
                      {FORECAST_COPY.weightsInvalid}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>

          {editing ? (
            <Box sx={{ mt: 1.5 }}>
              <Typography component="p" variant="caption" sx={{ display: "block", mb: 1, color: "text.secondary" }}>
                {FORECAST_COPY.weightsHint}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={cancel}>
                  {FORECAST_COPY.cancel}
                </Button>
                <Button type="submit" variant="filled" size="sm" disabled={pending}>
                  {pending ? FORECAST_COPY.saving : FORECAST_COPY.save}
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
              <Button id={ADJUST_ID} type="button" variant="text" size="sm" onClick={open}>
                {FORECAST_COPY.adjust}
              </Button>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
