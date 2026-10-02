import Box from "@mui/material/Box";
import MuiCard from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { ImageKey } from "@/lib/images";
import { Photo } from "./Photo";

interface MediaCardProps {
  image: ImageKey;
  tag: string;
  title: string;
  body: string;
  /** Stacked (image on top) from `md`, image-beside-text row below it. */
  layout?: "stack" | "row" | "responsive";
  className?: string;
}

/**
 * The light tag pill over the photo. It sits on photography, so its background is the
 * on-photo `--hero-pill-bg` (white at 92%, scheme-independent) from styles/public.css; the
 * text is `primary.main`, as the converted C20_MuiTypeCard draws it.
 */
const TAG = {
  position: "absolute",
  bgcolor: "var(--hero-pill-bg)",
  color: "primary.main",
  fontWeight: 700,
  letterSpacing: 0.5,
} as const;

/**
 * Image + light tag pill + title + body (design: the "three kinds of cruise" and
 * "three ways to honeymoon" cards on 2.0.9 / 2.0.10, and their mobile rows).
 */
export function MediaCard({ image, tag, title, body, layout = "responsive", className }: MediaCardProps) {
  const stack = (
    <MuiCard
      component="article"
      className={className}
      sx={{ display: layout === "responsive" ? { xs: "none", md: "block" } : "block", overflow: "hidden" }}
    >
      <Box sx={{ position: "relative", height: 160 }}>
        <Photo image={image} fill sizes="(min-width: 1200px) 400px, 50vw" alt="" />
        <Chip size="small" label={tag} sx={{ ...TAG, top: 10, left: 10, height: 20, fontSize: 9.5 }} />
      </Box>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Typography component="h3" variant="h5" sx={{ color: "text.primary" }}>
          {title}
        </Typography>
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
          {body}
        </Typography>
      </CardContent>
    </MuiCard>
  );

  const row = (
    <MuiCard
      component="article"
      className={className}
      sx={{ display: layout === "responsive" ? { xs: "flex", md: "none" } : "flex", overflow: "hidden" }}
    >
      <Box sx={{ position: "relative", width: 100, flexShrink: 0 }}>
        <Photo image={image} fill sizes="100px" alt="" />
        <Chip
          size="small"
          label={tag}
          sx={{ ...TAG, top: 6, left: 6, height: 18, fontSize: 8.5, letterSpacing: 0.4, "& .MuiChip-label": { px: 0.75 } }}
        />
      </Box>
      <Box sx={{ flex: 1, p: 1.5 }}>
        <Typography component="h3" variant="subtitle1" sx={{ color: "text.primary" }}>
          {title}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.5, fontWeight: 500, color: "text.secondary" }}>
          {body}
        </Typography>
      </Box>
    </MuiCard>
  );

  if (layout === "stack") return stack;
  if (layout === "row") return row;
  return (
    <>
      {stack}
      {row}
    </>
  );
}
