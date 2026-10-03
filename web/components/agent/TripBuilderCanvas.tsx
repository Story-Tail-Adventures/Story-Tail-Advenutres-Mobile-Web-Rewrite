import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  moveComponentAction,
  removeComponentAction,
} from "@/app/(agent)/agent/trips/[tripId]/builder/actions";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { BUILDER_COPY } from "@/lib/agent/content";
import type { TripComponentRow } from "@/lib/agent/tripDetail";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.4.4's canvas — the trip's pieces, in the order the advisor put them.
 *
 * A FLAT ORDERED LIST, NOT THE PROTOTYPE'S DAY GROUPING. `A344_TripBuilder` draws
 * "Day 1 · Arrival", "Day 2 · Beach" with an "Add to Day N" under each. Those days are
 * `itinerary_day` rows and that screen is §3.4.14, the Itinerary Editor — a separate table,
 * a separate entry in the Screen Inventory, and a separate write. §3.4.4's own entry says
 * "component list", and the thing being reordered here is `trip_component.order_index`,
 * which has no day in it. Grouping by date would also fight the drag: the groups would
 * order by date while the rows inside them ordered by index, and moving a row between
 * groups would mean two different writes wearing one gesture.
 *
 * ARROWS, NOT A DRAG HANDLE. See `moveComponentAction` — a drag is pointer-only, so the
 * keyboard path would be these buttons anyway, and they work with JavaScript off.
 *
 * A SERVER COMPONENT. Three plain `<form>`s, no client island: every control here is a
 * write that navigates, and none of them needs state between renders. On MUI (step 2 of the
 * migration): each row is the artboard's outlined row card, the links are MUI Buttons over
 * `NextLink`, and the arrows and the bin are IconButtons.
 */

/** The legacy .btn-sm box (32px, 16px sides, 8px gap) on MUI's Button, so nothing reflows. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

export function TripBuilderCanvas({
  tripId,
  components,
  editingId,
}: {
  tripId: string;
  components: TripComponentRow[];
  /** The row §3.4.12 has open, so the canvas can mark it rather than the URL alone. */
  editingId: string | null;
}) {
  if (components.length === 0) {
    return (
      <Card sx={{ textAlign: "center" }}>
        <CardContent sx={{ px: 2, py: 4, "&:last-child": { pb: 4 } }}>
          <Typography component="p" variant="subtitle1" sx={{ fontWeight: 600 }}>
            {BUILDER_COPY.emptyTitle}
          </Typography>
          <Typography
            component="p"
            variant="body2"
            sx={{ mx: "auto", mt: 0.5, maxWidth: "42ch", color: "text.secondary" }}
          >
            {BUILDER_COPY.emptyBody}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack component="ol" spacing={0.75} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {components.map((c, i) => {
        const isEditing = c.componentId === editingId;
        return (
          <Card
            component="li"
            variant="outlined"
            key={c.componentId}
            /* WRAPS ON A PHONE. Six controls, a title and a price on one 375px line squeezes
               the title to about 90px and wraps "AA 1413 · MIA → MBJ" over four lines. The
               price and the two actions drop to a second line instead, which is the only
               part of the row that reads fine right-aligned under it. */
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 1.25,
              rowGap: 0.75,
              px: 1.5,
              py: 1.25,
              ...(isEditing && { borderColor: "primary.main", bgcolor: "primary.container" }),
            }}
            aria-current={isEditing ? "true" : undefined}
          >
            {/* ── Order ─────────────────────────────────────────────── */}
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <MoveButton
                tripId={tripId}
                componentId={c.componentId}
                direction="up"
                label={BUILDER_COPY.moveUp}
                title={c.title}
                disabled={i === 0}
              />
              <MoveButton
                tripId={tripId}
                componentId={c.componentId}
                direction="down"
                label={BUILDER_COPY.moveDown}
                title={c.title}
                disabled={i === components.length - 1}
              />
            </Box>

            <Avatar
              variant="rounded"
              sx={{
                width: 32,
                height: 32,
                flexShrink: 0,
                bgcolor: "secondary.container",
                color: "secondary.onContainer",
              }}
            >
              <Icon name={c.icon} size={16} />
            </Avatar>

            {/* A 100% basis below `sm` is what actually makes the row wrap. With `flex: 1`
                alone the title shrinks to share the line with the price and the two
                actions instead of dropping below them — about 90px on a phone, which is
                where "AA 1413 · MIA → MBJ" became four lines. */}
            <Box
              sx={{
                minWidth: 0,
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: { xs: "100%", sm: "auto" },
              }}
            >
              <Typography component="p" variant="subtitle2" sx={{ fontWeight: 600 }}>
                {c.title}
              </Typography>
              {c.subtitle && (
                <Typography
                  component="p"
                  variant="caption"
                  sx={{ display: "block", color: "text.secondary" }}
                >
                  {c.subtitle}
                </Typography>
              )}
            </Box>

            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1.25 }}>
              <Typography
                component="div"
                variant="caption"
                sx={{ minWidth: 70, textAlign: "right", fontFamily: "mono", fontWeight: 700 }}
              >
                {c.costLabel}
              </Typography>

              <MuiButton
                component={NextLink}
                href={`/agent/trips/${tripId}/builder?edit=${c.componentId}`}
                variant="text"
                size="small"
                sx={BTN_SM}
              >
                {BUILDER_COPY.edit}
                {/* The label alone reads "Edit" seven times over to a screen reader. */}
                <Box component="span" sx={VISUALLY_HIDDEN}> {c.title}</Box>
              </MuiButton>

              <form action={removeComponentAction}>
                <input type="hidden" name="tripId" value={tripId} />
                <input type="hidden" name="componentId" value={c.componentId} />
                <IconButton
                  type="submit"
                  size="small"
                  title={BUILDER_COPY.remove}
                  sx={{ width: 28, height: 28, p: 0 }}
                >
                  <Icon name="trash" size={13} />
                  <Box component="span" sx={VISUALLY_HIDDEN}>
                    {BUILDER_COPY.remove} — {c.title}
                  </Box>
                </IconButton>
              </form>
            </Box>
          </Card>
        );
      })}
    </Stack>
  );
}

function MoveButton({
  tripId,
  componentId,
  direction,
  label,
  title,
  disabled,
}: {
  tripId: string;
  componentId: string;
  direction: "up" | "down";
  label: string;
  title: string;
  disabled: boolean;
}) {
  return (
    <form action={moveComponentAction}>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="componentId" value={componentId} />
      <input type="hidden" name="direction" value={direction} />
      <IconButton
        type="submit"
        size="small"
        disabled={disabled}
        title={label}
        sx={{ width: 20, height: 20, p: 0, "&.Mui-disabled": { opacity: 0.25 } }}
      >
        <Icon name={direction === "up" ? "chevron_up" : "chevron_down"} size={11} />
        <Box component="span" sx={VISUALLY_HIDDEN}>
          {label} — {title}
        </Box>
      </IconButton>
    </form>
  );
}
