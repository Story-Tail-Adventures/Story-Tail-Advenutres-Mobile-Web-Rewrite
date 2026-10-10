import Box from "@mui/material/Box";
import { BrandMark } from "@/components/brand/BrandMark";
import NextLink from "@/components/mui/NextLink";
import { NotFoundBody } from "./(public)/NotFoundBody";

/**
 * Root not-found — URLs that match no route at all. It renders inside the root layout only,
 * outside the public shell, so it is one centred column with the wordmark as the way home.
 * `.scheme-dark` is set on <html> by ThemeScript before paint, so `background.default` /
 * `text.primary` switch with the visitor's scheme; `.pub-surface` stays as a class because
 * public.css hangs the focus-ring and reduced-motion rules off it.
 */
export default function RootNotFound() {
  return (
    <Box component="main" id="main" className="pub-surface" sx={ROOT_SX}>
      <Box component={NextLink} href="/" aria-label="Story-Tail Adventures home" sx={{ mb: 4 }}>
        <BrandMark size={120} alt="" />
      </Box>
      <Box sx={{ width: "100%", maxWidth: 640 }}>
        <NotFoundBody />
      </Box>
    </Box>
  );
}

/** The legacy column: `flex min-h-dvh flex-1 flex-col items-center justify-center px-4.5 py-16 text-center`. */
const ROOT_SX = {
  display: "flex",
  minHeight: "100dvh",
  flex: 1,
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  px: 2.25,
  py: 8,
  textAlign: "center",
  bgcolor: "background.default",
  color: "text.primary",
} as const;
