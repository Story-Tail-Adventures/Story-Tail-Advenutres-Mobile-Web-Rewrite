import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * The header both §3.7 views share: title, subtitle, and the artboard's actions on the right.
 *
 * In Stage 1 every action is an unbuilt control, so each renders DISABLED WITH ITS REASON —
 * §3.2.1's rule for a control whose screen is real but not here yet. The reason is in the
 * button's accessible name (visually hidden) and on a wrapping span's `title`: a disabled MUI
 * Button sets `pointer-events: none`, so a title on the button itself never shows on hover.
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
    <Box component="header" sx={{ mt: 2.5, mb: 2, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
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
        {actions.map((a) => (
          <Box component="span" key={a.label} title={a.reason} sx={{ display: "inline-flex" }}>
            <Button type="button" variant="tonal" size="sm" disabled>
              <Icon name={a.icon} size={12} />
              {a.label}
              <Box component="span" sx={VISUALLY_HIDDEN}>
                {` (${a.reason})`}
              </Box>
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
