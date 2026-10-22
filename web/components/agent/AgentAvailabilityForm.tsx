"use client";

import { useId, useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";

import { saveAvailabilityAction } from "@/app/(agent)/agent/settings/actions";
import { AgentTimeOffCard } from "@/components/agent/AgentTimeOffCard";
import { useUnsavedGuard } from "@/components/agent/useUnsavedGuard";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Select";
import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";
import {
  HALF_HOURS,
  NORTH_AMERICAN_TIME_ZONES,
  RESPONSE_TIME_CHOICES,
  scheduleProblem,
  timeLabel,
  WEEKDAY_LABEL,
  WEEKDAY_SHORT,
  WEEKDAYS,
  type Weekday,
  type WeeklySchedule,
} from "@/lib/agent/settingsRules";
import type { AvailabilityView } from "@/lib/agent/settingsView";

const C = SETTINGS_COPY.availability;

type Draft = { timeZone: string; weeklySchedule: WeeklySchedule; responseTimeHours: number };

function same(a: Draft, b: Draft): boolean {
  return (
    a.timeZone === b.timeZone &&
    a.responseTimeHours === b.responseTimeHours &&
    JSON.stringify(a.weeklySchedule) === JSON.stringify(b.weeklySchedule)
  );
}

const START_OPTIONS = HALF_HOURS.slice(0, -1).map((t) => ({ value: t, label: timeLabel(t) }));
const END_OPTIONS = HALF_HOURS.slice(1).map((t) => ({ value: t, label: timeLabel(t) }));
const ZONE_OPTIONS = NORTH_AMERICAN_TIME_ZONES.map((z) => ({ value: z.id, label: z.label }));
const REPLY_OPTIONS = RESPONSE_TIME_CHOICES.map((n) => ({ value: String(n), label: C.hours(n) }));

/** "07:30" → 15 half-hour slots from midnight. */
const slot = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 2 + (m === 30 ? 1 : 0);
};

/**
 * Screen 3.12.2 (A3122): working hours, time zone and reply time, saved together with Save;
 * time away beside it, which saves block by block (AgentTimeOffCard). Calendar sync is
 * deferred (Q3) and not drawn at all.
 *
 * The prototype's hour grid stays as a READ-ONLY picture of the week (Q12); each day is edited
 * with a switch and two half-hour pickers, which work on a phone where painting cells does not.
 */
export function AgentAvailabilityForm({ availability }: { availability: AvailabilityView }) {
  const initial: Draft = {
    timeZone: availability.timeZone,
    weeklySchedule: availability.weeklySchedule,
    responseTimeHours: availability.responseTimeHours,
  };
  const [saved, setSaved] = useState<Draft>(initial);
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const zoneId = useId();
  const replyId = useId();
  const titleId = useId();
  const dayId = useId();
  const formId = useId();

  const changed = !same(draft, saved);
  useUnsavedGuard(changed, SETTINGS_COPY.leaveUnsaved);

  // A zone that is not on the list (set before §3.12) still shows, so saving never moves it
  // by accident; the Edge Function will ask for one from the list.
  const zoneOptions = ZONE_OPTIONS.some((z) => z.value === draft.timeZone)
    ? ZONE_OPTIONS
    : [{ value: draft.timeZone, label: draft.timeZone }, ...ZONE_OPTIONS];

  function setDay(day: Weekday, hours: WeeklySchedule[Weekday]) {
    setDraft((d) => ({ ...d, weeklySchedule: { ...d.weeklySchedule, [day]: hours } }));
    setStatus("");
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setStatus("");
    setError("");
    const problem = scheduleProblem(draft.weeklySchedule);
    if (problem) {
      setError(problem);
      return;
    }
    if (!changed) {
      setStatus(SETTINGS_COPY.nothingChanged);
      return;
    }
    const sent = draft;
    startTransition(async () => {
      let result;
      try {
        result = await saveAvailabilityAction(sent);
      } catch {
        result = { ok: false as const, message: SETTINGS_COPY.saveFailed };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(sent);
      setStatus(SETTINGS_COPY.saved);
    });
  }

  // The picture spans 8am to 8pm, widened to whatever the advisor actually works.
  const days = WEEKDAYS.map((d) => draft.weeklySchedule[d]).filter((h): h is NonNullable<typeof h> => h !== null);
  const lo = Math.min(16, ...days.map((h) => slot(h.start) - (slot(h.start) % 2)));
  const hi = Math.max(40, ...days.map((h) => slot(h.end) + (slot(h.end) % 2)));
  const hourLabels = Array.from({ length: (hi - lo) / 2 }, (_, i) => {
    const h = lo / 2 + i;
    return h % 12 === 0 ? (h === 12 ? "12p" : "12a") : h < 12 ? `${h}a` : `${h - 12}p`;
  });

  return (
    // The FORM is the hours card only. The time-away card has its own dialog form, and React
    // bubbles a submit through a portal to every form above it in the React tree, so nesting
    // it here would make "Save" in that dialog save the hours too. The header's Save reaches
    // the hours form through the `form` attribute.
    <Box>
      <Box
        component="header"
        sx={{ mt: 2.5, mb: 1.75, display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id={titleId} component="h2" variant="h5" sx={{ fontWeight: 700 }}>
            {C.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {C.sub}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography component="p" variant="caption" role="status" sx={{ m: 0, color: "text.secondary" }}>
            {status || (changed ? SETTINGS_COPY.unsaved : "")}
          </Typography>
          <Button variant="filled" size="sm" type="submit" form={formId} disabled={pending}>
            {C.save}
          </Button>
        </Stack>
      </Box>

      {error ? (
        <Box sx={{ mb: 1.75 }}>
          <Alert tone="error">{error}</Alert>
        </Box>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", web: "minmax(0, 1.4fr) minmax(0, 1fr)" },
          gap: 1.75,
          alignItems: "start",
        }}
      >
        <Card component="form" id={formId} onSubmit={save} noValidate aria-labelledby={titleId}>
          <CardContent sx={{ p: 2.25 }}>
            <Typography component="h3" variant="subtitle1">
              {C.hoursTitle}
            </Typography>
            <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
              {C.hoursSub}
            </Typography>

            <Box sx={{ mt: 1.5, maxWidth: 360 }}>
              <SelectField
                id={zoneId}
                label={C.timeZone}
                options={zoneOptions}
                value={draft.timeZone}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, timeZone: e.target.value }));
                  setStatus("");
                }}
              />
            </Box>

            {/* The prototype's grid, read-only. Hidden from assistive tech: the rows below
                say the same thing in words. */}
            <Box aria-hidden="true" sx={{ mt: 2 }}>
              <Typography component="p" variant="overline" sx={{ display: "block", lineHeight: 1.3, color: "text.secondary", mb: 0.75 }}>
                {C.weekPicture}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: `36px repeat(${hi - lo}, minmax(0, 1fr))`, gap: "2px" }}>
                <Box />
                {hourLabels.map((h) => (
                  <Typography key={h} component="span" variant="caption" sx={{ gridColumn: "span 2", textAlign: "left", color: "text.secondary", fontSize: 10, overflow: "hidden" }}>
                    {h}
                  </Typography>
                ))}
                {WEEKDAYS.map((d) => {
                  const hrs = draft.weeklySchedule[d];
                  return (
                    <Box key={d} sx={{ display: "contents" }}>
                      <Typography component="span" variant="subtitle2" sx={{ fontSize: 12, display: "flex", alignItems: "center" }}>
                        {WEEKDAY_SHORT[d]}
                      </Typography>
                      {Array.from({ length: hi - lo }, (_, i) => {
                        const s = lo + i;
                        const on = hrs !== null && s >= slot(hrs.start) && s < slot(hrs.end);
                        return <Box key={i} sx={{ height: 18, borderRadius: 0.5, bgcolor: on ? "primary.main" : "surface.3" }} />;
                      })}
                    </Box>
                  );
                })}
              </Box>
            </Box>

            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mt: 2, display: "grid", gap: 1 }}>
              {WEEKDAYS.map((d) => {
                const hrs = draft.weeklySchedule[d];
                return (
                  <Box
                    component="li"
                    key={d}
                    sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "160px minmax(0, 1fr) minmax(0, 1fr)" }, gap: 1, alignItems: "end" }}
                  >
                    <FormControlLabel
                      control={
                        <Switch
                          checked={hrs !== null}
                          onChange={(e) => setDay(d, e.target.checked ? { start: "09:00", end: "17:00" } : null)}
                          slotProps={{ input: { "aria-label": C.working(WEEKDAY_LABEL[d]) } }}
                        />
                      }
                      label={WEEKDAY_LABEL[d]}
                      sx={{ m: 0, minHeight: 44 }}
                    />
                    {hrs ? (
                      <>
                        <SelectField
                          id={`${dayId}-${d}-from`}
                          label={`${C.from}`}
                          aria-label={`${WEEKDAY_LABEL[d]} ${C.from.toLowerCase()}`}
                          options={START_OPTIONS}
                          value={hrs.start}
                          onChange={(e) => setDay(d, { ...hrs, start: e.target.value })}
                        />
                        <SelectField
                          id={`${dayId}-${d}-to`}
                          label={`${C.to}`}
                          aria-label={`${WEEKDAY_LABEL[d]} ${C.to.toLowerCase()}`}
                          options={END_OPTIONS}
                          value={hrs.end}
                          onChange={(e) => setDay(d, { ...hrs, end: e.target.value })}
                        />
                      </>
                    ) : (
                      <Typography component="p" variant="body2" sx={{ color: "text.secondary", alignSelf: "center", gridColumn: { sm: "span 2" } }}>
                        {C.dayOff}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>

            <Box sx={{ mt: 2.25, maxWidth: 360 }}>
              <SelectField
                id={replyId}
                label={C.replyTime}
                hint={C.replyTimeHint}
                options={REPLY_OPTIONS}
                value={String(draft.responseTimeHours)}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, responseTimeHours: Number(e.target.value) }));
                  setStatus("");
                }}
              />
            </Box>
          </CardContent>
        </Card>

        <AgentTimeOffCard timeOff={availability.timeOff} today={availability.today} />
      </Box>
    </Box>
  );
}
