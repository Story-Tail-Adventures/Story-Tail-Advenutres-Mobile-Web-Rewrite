"use client";

import { useEffect } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Container } from "@/components/public/Container";
import { PublicTopBar } from "@/components/public/PublicTopBar";
import { SOMETHING_WENT_WRONG } from "./fallback-content";

interface PublicErrorProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the segment (Next 16.3+). Preferred. */
  retry?: () => void;
  /** Clears the boundary without re-fetching — the older API, kept as the fallback. */
  reset: () => void;
}

/** The page title's 28 / 32 / 36 ramp on MUI's h4. */
const TITLE = { fontWeight: 700, fontSize: { xs: 28, md: 32, web: 36 } } as const;

/** The legacy .btn box (40px, 24px sides) on MUI's Button; full width below `md`. */
const CTA = { minHeight: 40, px: 3, width: { xs: "100%", md: "auto" } } as const;

/**
 * Error boundary for the public surface (Screen Inventory §5 error state). A Client Component by
 * Next's convention. Never renders `error.message`: server errors arrive as a generic string plus
 * a digest, and a client error's text is not something a visitor needs to read. Like not-found,
 * it replaces the nested layouts' children, so it carries its own top bar and `<main>`.
 */
export default function PublicError({ error, retry, reset }: PublicErrorProps) {
  useEffect(() => {
    // For matching against server logs; nothing from the error reaches the page.
    console.error("Public page error", error.digest ?? error);
  }, [error]);

  return (
    <Box sx={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <PublicTopBar variant="solid" />
      <Box component="main" id="main" sx={{ display: "flex", flex: 1, flexDirection: "column" }}>
        <Container size="prose" sx={{ py: 8, textAlign: "center" }}>
          <Typography component="h1" variant="h4" sx={TITLE}>
            {SOMETHING_WENT_WRONG.title}
          </Typography>
          <Typography variant="body1" sx={{ mx: "auto", mt: 1.5, maxWidth: 480, color: "text.secondary" }}>
            {SOMETHING_WENT_WRONG.body}
          </Typography>
          <Box
            sx={{
              mt: 3,
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: "center",
              justifyContent: "center",
              gap: 1.25,
            }}
          >
            <MuiButton variant="contained" sx={CTA} onClick={() => (retry ?? reset)()}>
              {SOMETHING_WENT_WRONG.retry}
            </MuiButton>
            <MuiButton
              component={NextLink}
              href={SOMETHING_WENT_WRONG.message.href}
              variant="text"
              sx={{ minHeight: 40, px: 1.5 }}
            >
              {SOMETHING_WENT_WRONG.message.label}
            </MuiButton>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
