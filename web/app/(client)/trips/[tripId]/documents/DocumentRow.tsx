"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { Icon } from "@/components/ui/Icon";
import { TAP_TARGET, UP_MD } from "@/lib/mui/sx";
import { signDocument } from "@/lib/trips/actions";
import { documentBadge, formatFileSize, uploadedByLabel } from "@/lib/trips/documents";
import type { TripDocument } from "@/lib/trips/queries";
import { BTN_SM } from "../sx";

/**
 * One row of the 2.2.6 library, with the open action.
 *
 * A CLIENT COMPONENT ONLY FOR THE OPEN BUTTON. The list itself is server-rendered; this
 * wraps a single row because opening a document is a two-step the server cannot do alone:
 * ask for a signature, then hand the URL to the browser.
 *
 * WHY NOT AN `<a href>` WITH A PRE-SIGNED URL: see the note on `signDocument`. The short
 * version is that signing writes an audit row, so pre-signing the page would record five
 * accesses for a traveler who opened nothing, and the URLs would expire before most clicks.
 *
 * THE TAB IS CLAIMED SYNCHRONOUSLY, before the await. `window.open` on the far side of a
 * promise is the classic popup-blocker casualty: the user gesture has been spent by the time
 * the signature arrives, and the browser refuses. Opening `about:blank` while the click is
 * still on the stack gets a real handle, and the URL is assigned to it once the signature
 * lands. Confirmed necessary — the in-place fallback fired every time before this.
 *
 * Both failure paths are handled rather than left to strand a blank tab: a signing failure
 * closes it and shows the error inline, and a browser that refuses even the synchronous open
 * falls back to navigating in place, which always works.
 */
export function DocumentRow({ document: doc, first }: { document: TripDocument; first: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const badge = documentBadge(doc.mimeType);

  function open() {
    setError(null);
    // Claimed now, while the gesture is still live. `noopener` keeps the new tab from
    // holding a reference back into the app.
    const tab = window.open("", "_blank", "noopener,noreferrer");

    startTransition(async () => {
      const result = await signDocument(doc.id);

      if (!result.ok) {
        tab?.close();
        setError(result.message);
        return;
      }

      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
    });
  }

  return (
    // The divider belongs to the mobile card, where rows share one edge. From `md` up each
    // row is its own card in the Pattern B grid and the line would draw inside it.
    <Box sx={first ? undefined : { borderTop: 1, borderColor: "divider", [UP_MD]: { borderTop: 0 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.75, py: 1.5 }}>
        {/* The file-type badge, as the artboard's C226 draws it: a PDF on primary, an image
            on the brand orange. */}
        <Typography
          component="span"
          variant="caption"
          aria-hidden="true"
          sx={{
            width: 38,
            height: 46,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 0.5,
            fontSize: 9,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "0.4px",
            bgcolor: badge === "PDF" ? "primary.main" : "brand.main",
            color: badge === "PDF" ? "primary.contrastText" : "brand.contrastText",
          }}
        >
          {badge}
        </Typography>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="p" variant="subtitle1" noWrap sx={{ m: 0, fontWeight: 600 }}>
            {doc.filename}
          </Typography>
          <Typography component="p" variant="caption" sx={{ display: "block", m: 0, mt: 0.25, color: "text.secondary" }}>
            {[formatFileSize(doc.sizeBytes), uploadedByLabel(doc.mine)].join(" · ")}
          </Typography>
        </Box>

        {/* Icon-only below `md`, so `minWidth: 0` keeps the legacy 45px box rather than
            MUI's 64px minimum; TAP_TARGET grows the touch area to 44px without growing it. */}
        <MuiButton
          type="button"
          onClick={open}
          disabled={pending}
          variant="outlined"
          size="small"
          aria-label={`Open ${doc.filename}`}
          sx={{ ...BTN_SM, ...TAP_TARGET, flexShrink: 0, minWidth: 0 }}
        >
          {pending ? <Icon name="clock" size={13} /> : <Icon name="external" size={13} />}
          <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
            Open
          </Box>
        </MuiButton>
      </Box>

      {error && (
        <Typography
          component="p"
          role="status"
          variant="body2"
          sx={{ m: 0, px: 1.75, pb: 1.5, color: "error.main" }}
        >
          {error}
        </Typography>
      )}
    </Box>
  );
}
