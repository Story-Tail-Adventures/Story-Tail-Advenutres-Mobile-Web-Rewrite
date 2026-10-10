import Box from "@mui/material/Box";
import MuiCard from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import type { ImageKey } from "@/lib/images";
import { Photo } from "./Photo";

interface PhotoTileProps {
  image: ImageKey;
  label: string;
  sub?: string;
  href: string;
  /** 5/3 (inspiration, web), 5/4 (inspiration, mobile), 4/5 (islands). */
  aspect?: "5/3" | "5/4" | "4/5";
  /** 110px-wide tile for the mobile horizontal island strip. */
  strip?: boolean;
  scrim?: "bottom" | "bottom-island";
  /** Responsive image sizes hint. */
  sizes?: string;
  className?: string;
}

const ASPECT = {
  "5/3": "5 / 3",
  "5/4": "5 / 4",
  "4/5": "4 / 5",
} as const;

/**
 * Photo tile with a bottom scrim and a label — inspiration tiles (2.0.3) and island tiles
 * (2.0.8). The whole tile is one link (a Card rendered as next/link); the image is
 * decorative because the label is the text. The photo zooms a little on hover, and not at
 * all for people who asked for reduced motion. `.scrim-*` are the scheme-independent
 * gradients from styles/public.css.
 */
export function PhotoTile({
  image,
  label,
  sub,
  href,
  aspect = "5/3",
  strip = false,
  scrim = "bottom",
  sizes = "(min-width: 1200px) 400px, (min-width: 768px) 50vw, 100vw",
  className,
}: PhotoTileProps) {
  const inset = strip ? 8 : 10;
  return (
    <MuiCard
      component={NextLink}
      href={href}
      className={className}
      sx={{
        position: "relative",
        display: "block",
        overflow: "hidden",
        aspectRatio: ASPECT[aspect],
        color: "common.white",
        textDecoration: "none",
        ...(strip && { width: 110, flexShrink: 0 }),
        "& img": { transition: "transform 300ms ease" },
        "&:hover img": { transform: "scale(1.05)" },
        "@media (prefers-reduced-motion: reduce)": {
          "& img": { transition: "none" },
          "&:hover img": { transform: "none" },
        },
      }}
    >
      <Photo image={image} fill sizes={strip ? "110px" : sizes} alt="" />
      <Box
        aria-hidden="true"
        className={scrim === "bottom" ? "scrim-bottom" : "scrim-bottom-island"}
        sx={{ position: "absolute", inset: 0 }}
      />
      <Box
        sx={{
          position: "absolute",
          left: { xs: inset, md: strip ? 8 : 12 },
          right: { xs: inset, md: strip ? 8 : 12 },
          bottom: inset,
        }}
      >
        <Typography
          component="div"
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            fontSize: strip || aspect === "4/5" ? { xs: 11, md: 13 } : { xs: 12.5, md: 15 },
            lineHeight: strip || aspect === "4/5" ? { xs: 1.15, md: 1.2 } : 1.2,
          }}
        >
          {label}
        </Typography>
        {sub && (
          <Typography
            component="div"
            variant="caption"
            sx={{ display: "block", mt: 0.25, fontWeight: 500, fontSize: 11.5, lineHeight: 1, opacity: 0.85 }}
          >
            {sub}
          </Typography>
        )}
      </Box>
    </MuiCard>
  );
}
