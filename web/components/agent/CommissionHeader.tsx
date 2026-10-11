import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";

/**
 * The header both §3.7 views share: title, subtitle, and the artboard's actions on the right.
 *
 * In Stage 1 every action is an unbuilt control, so each renders DISABLED WITH ITS REASON —
 * §3.2.1's rule for a control whose screen is real but not here yet.
 *
 * THE REASON IS VISIBLE TEXT, not a hover title. The first draft used a `title` plus visually
 * hidden text in the button's name, and that reached nobody who needed it: a touch screen
 * has no hover (and Commission is on the tablet surface), a disabled button cannot take
 * keyboard focus, and a disabled MUI Button sets `pointer-events: none` besides. So one quiet
 * caption line sits under the header, and each button points at its own sentence with
 * `aria-describedby` — named by its label, described by its reason.
 */
export type DeferredAction = { label: string; reason: string; icon: IconName };

export function CommissionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions: DeferredAction[];
}) {
  return (
    <Box component="header" sx={{ mt: 2.5, mb: 2 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
        {/* A 260px basis, not a bare `flex: 1`. With `minWidth: 0` and no basis the title
            column shrank to a sliver on a phone so the two buttons could stay beside it, and
            "Commissions" painted underneath "Import CSV". Now the buttons wrap below instead. */}
        <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {subtitle}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexShrink: 0, flexWrap: "wrap", gap: 1 }}>
          {actions.map((a, i) => (
            <Button
              key={a.label}
              type="button"
              variant="tonal"
              size="sm"
              disabled
              aria-describedby={`commission-action-reason-${i}`}
            >
              <Icon name={a.icon} size={12} />
              {a.label}
            </Button>
          ))}
        </Box>
      </Box>
      {actions.length > 0 && (
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
          {actions.map((a, i) => (
            <Box component="span" key={a.label} id={`commission-action-reason-${i}`}>
              {i > 0 && " "}
              {a.reason}
            </Box>
          ))}
        </Typography>
      )}
    </Box>
  );
}
