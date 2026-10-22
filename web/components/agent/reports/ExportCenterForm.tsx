"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";

import { OutlinedNativeSelect } from "@/components/mui/OutlinedNativeSelect";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EXPORT_TYPE_NAMES, EXPORT_TYPES, REPORTS_COPY, type ExportType } from "@/lib/agent/reportsCopy";

/**
 * A3118's "Generate export" card, as a plain GET form to the download route.
 *
 * NO JAVASCRIPT NEEDED TO EXPORT. The form's own submit navigates to
 * `/agent/reports/download?type=…`, which answers with an attachment, so the browser saves the
 * file and stays on this page. Client code only shows and hides: the date fields for Clients
 * (the whole list, no dates), and the contact-details box (Clients only, unticked by default).
 *
 * Hidden fields are DISABLED, so the browser does not submit them: a Clients export sends no
 * dates and a trips export sends no contact switch, each of which the server refuses.
 *
 * Format is not a choice: CSV only (§3.11). One line under the button says it opens in Excel.
 */
export function ExportCenterForm({ today }: { today: string }) {
  const [type, setType] = useState<ExportType>("ledger");
  const [contact, setContact] = useState(false);
  // In state, so passing through Clients (no dates) and back keeps what the advisor picked.
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const dated = type !== "clients";

  const hint = {
    ledger: REPORTS_COPY.hintLedger,
    trips: REPORTS_COPY.hintTrips,
    milestones: REPORTS_COPY.hintMilestones,
    clients: REPORTS_COPY.hintClients,
  }[type];

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
        <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
          {REPORTS_COPY.generateTitle}
        </Typography>

        <Box component="form" method="get" action="/agent/reports/download" sx={{ mt: 1.5 }}>
          <Box sx={FIELD_SX}>
            <Box component="label" htmlFor="export-type" sx={LABEL_SX}>
              {REPORTS_COPY.typeLabel}
            </Box>
            <OutlinedNativeSelect
              id="export-type"
              name="type"
              value={type}
              onChange={(e) => {
                // The options are EXPORT_TYPES, so the value is one of them.
                setType(e.target.value as ExportType);
                // Never carried over: a switch ticked for Clients does not ride to the next one.
                setContact(false);
              }}
              aria-describedby="export-hint"
              fullWidth
            >
              {EXPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EXPORT_TYPE_NAMES[t]}
                </option>
              ))}
            </OutlinedNativeSelect>
          </Box>

          {dated && (
            // Stacked on a phone: two native date pickers side by side clip the year at 375px.
            <Box sx={{ mt: 1.25, display: "grid", gap: 1.25, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" } }}>
              <Box sx={FIELD_SX}>
                <Box component="label" htmlFor="export-from" sx={LABEL_SX}>
                  {REPORTS_COPY.fromLabel}
                </Box>
                {/* `max` / `min` let the browser refuse a reversed range before it is sent, so the
                    advisor never lands on the route's plain-text refusal. The server still checks. */}
                <OutlinedInput
                  id="export-from"
                  type="date"
                  name="from"
                  size="small"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  slotProps={{ input: { max: to || undefined } }}
                />
              </Box>
              <Box sx={FIELD_SX}>
                <Box component="label" htmlFor="export-to" sx={LABEL_SX}>
                  {REPORTS_COPY.toLabel}
                </Box>
                <OutlinedInput
                  id="export-to"
                  type="date"
                  name="to"
                  size="small"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  slotProps={{ input: { min: from || undefined } }}
                />
              </Box>
            </Box>
          )}

          <Typography id="export-hint" component="p" variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>
            {hint}
          </Typography>

          {type === "clients" && (
            <Box sx={{ mt: 1.25 }}>
              <FormControlLabel
                sx={{ ml: 0, alignItems: "flex-start" }}
                control={
                  <Checkbox
                    name="contact"
                    value="1"
                    checked={contact}
                    onChange={(e) => setContact(e.target.checked)}
                    size="small"
                    sx={{ p: 0.5, mr: 0.75 }}
                    slotProps={{ input: { "aria-describedby": "export-contact-hint" } }}
                  />
                }
                label={<Typography component="span" variant="body2" sx={{ fontWeight: 500, pt: 0.25 }}>{REPORTS_COPY.contactLabel}</Typography>}
              />
              <Typography id="export-contact-hint" component="p" variant="caption" sx={{ display: "block", color: "text.secondary", pl: 4 }}>
                {REPORTS_COPY.contactHint}
              </Typography>
            </Box>
          )}

          <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.25 }}>
            <Button type="submit" variant="filled" size="sm">
              <Icon name="download" size={12} />
              {REPORTS_COPY.downloadLabel}
            </Button>
            <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
              {REPORTS_COPY.csvNote}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

const FIELD_SX = { display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 } as const;
const LABEL_SX = { typography: "caption", fontWeight: 600, color: "text.secondary" } as const;
