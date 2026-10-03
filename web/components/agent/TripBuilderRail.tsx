import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import ListItemButton from "@mui/material/ListItemButton";
import Typography from "@mui/material/Typography";

import { SaveAsTemplateDialog } from "@/components/agent/SaveAsTemplateDialog";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { COMPONENT_RAIL, COMPONENT_SPECS } from "@/lib/agent/components";
import { BUILDER_COPY, TEMPLATE_COPY } from "@/lib/agent/content";

/**
 * §3.4.4's left rail: one button per `component_kind`.
 *
 * SEVEN, NOT THE PROTOTYPE'S EIGHT. `A344_TripBuilder` lists a "Dining · manual" entry;
 * there is no `dining` in `component_kind` and Data-Model §23 ruled that a dinner
 * reservation is a `custom` component, which is what "Something else" is for. Same call
 * the sixth trip-type tile got in §3.4.3.
 *
 * AND NO SUPPLIER NAMES. The prototype's labels read "Flight · Amadeus", "Hotel ·
 * Hotelbeds", "Cruise · Widgety", "Tour · Viator". Every one of those is a Phase 2
 * integration that is not wired, so the label promises a search the button does not do.
 * The sheet says what is actually coming, once, instead of four buttons each implying it.
 *
 * EACH IS A LINK, not a button — the sheet is a URL (`?add=flight`), so the back button
 * closes it and the page works with JavaScript off. On MUI it is the artboard's
 * `ListItemButton` rendered as `NextLink`, with the icon tile and the trailing plus.
 *
 * A ROW BELOW `xl`, A COLUMN AT `xl`. Seven full-width rows stacked above the canvas is
 * most of a laptop screen before the advisor reaches the trip they came to look at. The
 * same seven as a wrapping strip of chips is two lines. The prototype only ever draws the
 * 1440 case, where the column is right.
 */
export function TripBuilderRail({
  tripId,
  tripTitle,
}: {
  tripId: string;
  /** For the template dialog's default name — the commonest case is confirm and go. */
  tripTitle: string;
}) {
  return (
    <Card component="aside" sx={{ alignSelf: { xl: "flex-start" } }}>
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography
          component="p"
          variant="caption"
          sx={{ display: "block", mb: 1, fontWeight: 500, color: "text.secondary" }}
        >
          {BUILDER_COPY.addHeading.toUpperCase()}
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 0.5,
            flexDirection: { xl: "column" },
          }}
        >
          {COMPONENT_RAIL.map((kind) => {
            const spec = COMPONENT_SPECS[kind];
            return (
              <ListItemButton
                key={kind}
                component={NextLink}
                href={`/agent/trips/${tripId}/builder?add=${kind}`}
                // A chip-like strip below `xl` (each entry its own outlined pill, natural
                // width); plain rows in the column at `xl`, as the artboard draws them.
                sx={{
                  flexGrow: 0,
                  gap: 1,
                  borderRadius: 1,
                  px: 1,
                  py: 0.75,
                  border: { xs: 1, xl: 0 },
                  borderColor: "divider",
                }}
              >
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    bgcolor: "secondary.container",
                    color: "secondary.onContainer",
                  }}
                >
                  <Icon name={spec.icon} size={13} />
                </Avatar>
                <Typography component="span" variant="body2" sx={{ flex: { xl: 1 } }}>
                  {spec.shortLabel}
                </Typography>
                <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                  <Icon name="plus" size={11} />
                </Box>
              </ListItemButton>
            );
          })}
        </Box>

        {/* §3.4.13, live since 2026-09-28. This was disabled with its reason while
            `trip_template` had no rows and no producer.

            THE VERB CHANGED, and deliberately. The prototype's rail draws three named
            templates to APPLY, and applying one belongs where a trip is being created
            (§3.4.3's picker) rather than here — a trip already under construction has
            bookings of its own, and the RPC refuses a second pattern on the same trip. What
            the builder is actually good for is the other direction: an advisor looking at
            the bookings they just assembled, saving them as the pattern. */}
        <Box sx={{ mt: 1.5 }}>
          <SaveAsTemplateDialog
            tripId={tripId}
            tripTitle={tripTitle}
            label={BUILDER_COPY.saveAsTemplateLabel}
            fullWidth
          />
          <MuiLink
            component={NextLink}
            href="/agent/templates"
            underline="hover"
            variant="body2"
            sx={{ mt: 1, display: "block", textAlign: "center", color: "text.secondary" }}
          >
            {TEMPLATE_COPY.navLabel}
          </MuiLink>
        </Box>
      </CardContent>
    </Card>
  );
}
