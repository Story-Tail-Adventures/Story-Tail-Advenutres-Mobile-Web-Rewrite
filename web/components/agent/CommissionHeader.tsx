import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";

/**
 * The header both §3.7 views share: title, subtitle, and the artboard's actions on the right.
 *
 * An action is either LIVE (a link — Add line, Export since Stage 2) or DEFERRED (Import CSV
 * until §3.7.5), and a deferred one renders DISABLED WITH ITS REASON — §3.2.1's rule.
 *
 * THE REASON IS VISIBLE TEXT, not a hover title. The first draft used a `title` plus visually
 * hidden text in the button's name, and that reached nobody who needed it: a touch screen
 * has no hover (and Commission is on the tablet surface), a disabled button cannot take
 * keyboard focus, and a disabled MUI Button sets `pointer-events: none` besides. So one quiet
 * caption line sits under the header, and each disabled button points at its own sentence
 * with `aria-describedby` — named by its label, described by its reason.
 *
 * EXPORT IS A PLAIN LINK to a route handler that answers with an attachment. The browser
 * downloads it and stays on the page; no client code is involved.
 */
export type HeaderAction =
  | { label: string; icon: IconName; href: string; primary?: boolean; download?: boolean }
  | { label: string; icon: IconName; reason: string };

export function CommissionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions: HeaderAction[];
}) {
  const deferred = actions.filter((a): a is Extract<HeaderAction, { reason: string }> => "reason" in a);

  return (
    <Box component="header" sx={{ mt: 2.5, mb: 2 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
        {/* A 260px basis, not a bare `flex: 1`. With `minWidth: 0` and no basis the title
            column shrank to a sliver on a phone so the buttons could stay beside it, and
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
          {actions.map((a) =>
            "href" in a ? (
              <MuiButton
                key={a.label}
                // A download is a plain anchor, never next/link: the client router would fetch
                // the CSV as if it were a page (and prefetch it on hover, writing an audit row
                // for an export nobody asked for).
                component={a.download ? "a" : NextLink}
                href={a.href}
                {...(a.download ? { download: "" } : {})}
                variant={a.primary ? "contained" : "outlined"}
                color={a.primary ? "brand" : "secondary"}
                size="small"
                sx={BTN_SM}
              >
                <Icon name={a.icon} size={12} />
                {a.label}
              </MuiButton>
            ) : (
              <Button
                key={a.label}
                type="button"
                variant="tonal"
                size="sm"
                disabled
                aria-describedby={`commission-action-reason-${deferred.indexOf(a)}`}
              >
                <Icon name={a.icon} size={12} />
                {a.label}
              </Button>
            ),
          )}
        </Box>
      </Box>
      {deferred.length > 0 && (
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
          {deferred.map((a, i) => (
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

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;
