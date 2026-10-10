import Box from "@mui/material/Box";
import { PublicTopBar } from "@/components/public/PublicTopBar";

/** Pages with a solid sticky top bar at every width (How it works, results, gate, legal). */
export default function PlainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Box sx={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <PublicTopBar variant="solid" />
      <Box component="main" id="main" sx={{ display: "flex", flex: 1, flexDirection: "column" }}>
        {children}
      </Box>
    </Box>
  );
}
