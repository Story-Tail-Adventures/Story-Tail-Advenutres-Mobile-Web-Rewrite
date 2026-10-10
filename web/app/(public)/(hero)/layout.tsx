import Box from "@mui/material/Box";
import { PublicTopBar } from "@/components/public/PublicTopBar";

/**
 * Pages that open on a full-bleed photo (landing, topic pages, explore, trip detail, About
 * Gyasi). Below `md` the top bar floats transparent over the hero, as in the mobile
 * artboards; from `md` it is the solid sticky bar. `position: relative` scopes the overlay
 * bar to this region so the placeholder banner above it is never covered.
 */
export default function HeroLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Box sx={{ position: "relative", display: "flex", flex: 1, flexDirection: "column" }}>
      <PublicTopBar variant="overlay" />
      <Box component="main" id="main" sx={{ display: "flex", flex: 1, flexDirection: "column" }}>
        {children}
      </Box>
    </Box>
  );
}
