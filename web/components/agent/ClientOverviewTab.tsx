import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Avatar } from "@/components/public/Avatar";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientCompanion, ClientOverview } from "@/lib/agent/clientDetail";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screens 3.3.2 and 3.3.3 — Snapshot, Preferences, the four mini-stats and the household.
 *
 * THE PROTOTYPE'S SNAPSHOT DRAWS TWO FIELDS THAT DO NOT EXIST, and both are dropped rather
 * than faked. "Anniversary · Sep 14 (surprise flag)" — `important_dates` is
 * `{label, date, recurring}` (Data-Model §6.1) and there is no surprise flag anywhere in
 * the schema. "Frequent flyer · AAdvantage Platinum" is real but lives in
 * `travel_preference.loyalty_programs`, so it moved to the Preferences card where its data
 * is, and the loyalty NUMBER is deliberately not shown: it is an account credential, and
 * the programme and tier are what a booking needs.
 *
 * THE DIETARY NOTE SITS WITH THE CHIPS, not under them. The closed vocabulary has no slug
 * for an allergy, so a real one arrives in `dietary_notes` — "pescatarian" without
 * "shellfish is a hard no" is worse than useless to whoever books the restaurant.
 *
 * ON MUI (step 2 of the migration, PR 6), as the A332 artboard draws it: Cards with
 * CardContent, caption labels over body2 values, outlined Chips for the preferences, four
 * stat Cards in a two-up grid and the household as a list. Plain sx throughout, so this
 * stays a Server Component.
 */

/** The legacy `.btn.btn-text.btn-sm` box on an MUI Button: 32px tall, 16px sides. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** `.t-label` on MUI's caption: the field's name above its value. */
const LABEL_SX = {
  display: "block",
  fontWeight: 500,
  lineHeight: 1.3,
  letterSpacing: "0.4px",
  color: "text.secondary",
} as const;

/** The legacy `.card.p-4` (16px) on CardContent, with MUI's last-child rule cancelled. */
const CARD_PAD_SX = { p: 2, "&:last-child": { pb: 2 } } as const;

/** A paragraph under a hairline, the legacy `mt-3 border-t pt-2.5`. */
const RULED_SX = { mt: 1.5, pt: 1.25, borderTop: 1, borderColor: "divider" } as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Typography component="div" variant="caption" sx={LABEL_SX}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ mt: 0.25 }}>
        {value}
      </Typography>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent sx={{ p: 1.25, "&:last-child": { pb: 1.25 } }}>
        <Typography component="div" variant="caption" sx={LABEL_SX}>
          {label}
        </Typography>
        <Typography component="div" variant="subtitle1" sx={{ mt: 0.25, fontWeight: 600, lineHeight: 1.3 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <>
      {items.map((t) => (
        <Chip key={t} variant="outlined" label={t} />
      ))}
    </>
  );
}

export function ClientOverviewTab({
  client,
  companions,
}: {
  client: ClientOverview;
  companions: ClientCompanion[];
}) {
  const prefs = [
    ...client.preferredDestinations,
    ...client.travelStyles,
    ...client.dietaryRestrictions,
    ...client.accessibilityNeeds,
    ...client.loyaltyPrograms.map((p) => (p.tier ? `${p.program} · ${p.tier}` : p.program)),
  ];

  return (
    <Box sx={{ display: "grid", gap: 1.75, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1.5fr) minmax(0, 1fr)" } }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Card component="section">
          <CardContent sx={CARD_PAD_SX}>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <Typography component="h2" variant="h5" sx={{ m: 0 }}>
                {CLIENT_COPY.snapshotTitle}
              </Typography>
              <MuiButton
                component={NextLink}
                href={`/agent/clients/${client.clientId}/edit`}
                variant="text"
                color="primary"
                size="small"
                sx={{ ...BTN_SM, ml: "auto" }}
              >
                Edit
                <Box component="span" sx={VISUALLY_HIDDEN}> {client.displayName}</Box>
              </MuiButton>
            </Box>

            <Box
              sx={{
                mt: 1,
                display: "grid",
                columnGap: 2,
                rowGap: 1.25,
                gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
              }}
            >
              <Field label={CLIENT_COPY.labelPhone} value={client.phone ?? "—"} />
              <Field label={CLIENT_COPY.labelEmail} value={client.email ?? CLIENT_COPY.noEmail} />
              <Field
                label={CLIENT_COPY.labelAddress}
                value={client.addressLine ?? CLIENT_COPY.noAddress}
              />
              <Field label={CLIENT_COPY.labelBirthday} value={client.dateOfBirthLabel ?? "—"} />
              {client.importantDates.length > 0 && (
                <Box sx={{ gridColumn: { sm: "span 2" } }}>
                  <Typography component="div" variant="caption" sx={LABEL_SX}>
                    {CLIENT_COPY.labelDates}
                  </Typography>
                  <Typography component="div" variant="body2" sx={{ mt: 0.25 }}>
                    {client.importantDates
                      .map((d) => (d.date ? `${d.label} · ${d.date.slice(5)}` : d.label))
                      .join(" · ")}
                  </Typography>
                </Box>
              )}
              {client.budgetBand && (
                <Field label={CLIENT_COPY.labelBudget} value={client.budgetBand} />
              )}
            </Box>

            {client.snapshotNote && (
              <Typography component="p" variant="body2" sx={{ ...RULED_SX, color: "text.secondary" }}>
                {client.snapshotNote}
              </Typography>
            )}

            {client.emergencyContact && (
              <Box sx={RULED_SX}>
                <Typography component="div" variant="caption" sx={LABEL_SX}>
                  {CLIENT_COPY.emergencyTitle}
                </Typography>
                <Typography component="div" variant="body2" sx={{ mt: 0.25 }}>
                  {[
                    client.emergencyContact.name,
                    client.emergencyContact.relationship,
                    client.emergencyContact.phone,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        <Card component="section">
          <CardContent sx={CARD_PAD_SX}>
            <Typography component="h2" variant="h5" sx={{ m: 0, mb: 1 }}>
              {CLIENT_COPY.preferencesTitle}
            </Typography>
            {prefs.length === 0 && !client.dietaryNote && !client.accessibilityNote ? (
              <Typography component="p" variant="body2" sx={{ m: 0, color: "text.secondary" }}>
                {CLIENT_COPY.noPreferences}
              </Typography>
            ) : (
              <>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  <Chips items={prefs} />
                </Box>
                {/* The half the chips cannot carry. */}
                {(client.dietaryNote || client.accessibilityNote) && (
                  <Box sx={{ mt: 1.25, display: "flex", flexDirection: "column", gap: 0.5 }}>
                    {client.dietaryNote && (
                      <Typography component="p" variant="body2" sx={{ m: 0, color: "text.secondary" }}>
                        {client.dietaryNote}
                      </Typography>
                    )}
                    {client.accessibilityNote && (
                      <Typography component="p" variant="body2" sx={{ m: 0, color: "text.secondary" }}>
                        {client.accessibilityNote}
                      </Typography>
                    )}
                  </Box>
                )}
                {client.favouritePastTrips && (
                  <Typography
                    component="p"
                    variant="body2"
                    sx={{ mt: 1.25, pt: 1.25, borderTop: 1, borderColor: "divider", color: "text.secondary" }}
                  >
                    {client.favouritePastTrips}
                  </Typography>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      <Box component="aside" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <Stat
            label={CLIENT_COPY.statLifetime}
            value={client.lifetimeLabel ?? CLIENT_COPY.noLifetime}
          />
          <Stat
            label={CLIENT_COPY.statTrips}
            value={
              client.activeTripCount > 0
                ? `${client.tripCount} · ${client.activeTripCount} active`
                : String(client.tripCount)
            }
          />
          <Stat
            label={CLIENT_COPY.statCommission}
            value={client.commissionLabel ?? CLIENT_COPY.noLifetime}
          />
          <Stat
            label={CLIENT_COPY.statLastContact}
            value={client.lastContactLabel ?? "—"}
          />
        </Box>

        <Card component="section">
          <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
            <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600, lineHeight: 1.3 }}>
              {CLIENT_COPY.householdTitle}
            </Typography>
            {companions.length === 0 ? (
              <Typography component="p" variant="body2" sx={{ m: 0, mt: 0.75, color: "text.secondary" }}>
                {CLIENT_COPY.noHousehold}
              </Typography>
            ) : (
              <Box
                component="ul"
                sx={{ m: 0, p: 0, mt: 1, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}
              >
                {companions.map((c) => (
                  <Box component="li" key={c.companionId} sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                    <Avatar initials={c.initials} size={28} />
                    <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
                      <Typography component="span" variant="body2" noWrap sx={{ display: "block" }}>
                        {c.name}
                        {c.relationship ? ` · ${c.relationship}` : ""}
                      </Typography>
                      {c.passportExpiryLabel && (
                        <Typography
                          component="span"
                          variant="body2"
                          sx={{ display: "block", color: c.passportExpiringSoon ? "warning.main" : "text.secondary" }}
                        >
                          Passport {c.passportExpiryLabel}
                          {c.passportExpiringSoon ? ` · ${CLIENT_COPY.passportExpiringSoon}` : ""}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
