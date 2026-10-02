import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiCard from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { ADVISOR, claim } from "@/content/public/proof";
import { Avatar } from "./Avatar";

interface AdvisorCardProps {
  /** `bio` (2.0.2), `planned` (2.0.5 aside), `note` (2.0.10 letter). */
  variant: "bio" | "planned" | "note";
  title?: string;
  body?: React.ReactNode;
  overline?: string;
  action?: { label: string; href: string };
  className?: string;
}

/** A stat on the bio card: glyph + text, caption weight 500, as the 2.0.2 artboard draws them. */
const STAT = { display: "inline-flex", alignItems: "center", gap: 0.5, typography: "caption", fontWeight: 500 } as const;

/**
 * Gyasi's card in its three prototype shapes. The portrait is the initials avatar until a
 * real photograph is supplied (decision 4); stats come from the claims registry.
 *
 * The bio and note grids keep their legacy px tracks (M202 draws the bio as an image-left
 * row on mobile — a 60px track leaves room for the paragraph and the stats at 360px; the
 * artboard's 120px track takes over at `md`).
 */
export function AdvisorCard({ variant, title, body, overline, action, className }: AdvisorCardProps) {
  if (variant === "bio") {
    return (
      <MuiCard
        className={className}
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "60px 1fr", md: "120px 1fr" },
          gap: { xs: 1.75, md: 2.75 },
          alignItems: "center",
          p: { xs: 2, md: 2.75 },
          bgcolor: "surface.2",
        }}
      >
        <Avatar
          initials={ADVISOR.initials}
          tone="brand"
          size={72}
          label={ADVISOR.name}
          sx={{ width: { md: 120 }, height: { md: 120 }, fontSize: { md: 36 } }}
        />
        <Box>
          <Typography component="h2" variant="h5" sx={{ fontSize: { xs: "1rem", md: "1.5rem" }, color: "text.primary" }}>
            {title ?? `Meet ${ADVISOR.name} · ${ADVISOR.title}`}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
            {body ?? ADVISOR.shortBio}
          </Typography>
          <Stack
            component="ul"
            direction="row"
            useFlexGap
            sx={{ m: 0, p: 0, mt: 1.25, flexWrap: "wrap", columnGap: 1.75, rowGap: 0.5, listStyle: "none", color: "text.secondary" }}
          >
            <Box component="li" sx={STAT}>
              <Box component="span" sx={{ display: "inline-flex", color: "brandSource.sunset" }}>
                <Icon name="star" size={12} filled />
              </Box>{" "}
              {claim("ratingValue")} · {claim("reviewCount")} reviews
            </Box>
            <Box component="li" sx={STAT}>
              <Icon name="users" size={12} /> {claim("travelersServed")} travelers
            </Box>
            <Box component="li" sx={STAT}>
              <Icon name="shield" size={12} /> {claim("credClia")}
            </Box>
          </Stack>
        </Box>
      </MuiCard>
    );
  }

  if (variant === "planned") {
    return (
      <MuiCard className={className} sx={{ display: "flex", alignItems: "center", gap: 1.25, p: { xs: 1.75, md: 2 } }}>
        <Avatar initials={ADVISOR.initials} tone="brand" size={36} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="p" variant="subtitle1" sx={{ color: "text.primary" }}>
            {title}
          </Typography>
          <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {body ?? "Caribbean specialist"}
          </Typography>
        </Box>
        {action && (
          <MuiButton
            component={NextLink}
            href={action.href}
            variant="text"
            size="small"
            sx={{ minHeight: 32, px: 2, flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {action.label}
          </MuiButton>
        )}
      </MuiCard>
    );
  }

  return (
    <MuiCard
      className={className}
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "44px 1fr", md: "56px 1fr" },
        gap: { xs: 1.5, md: 2.25 },
        p: 1.75,
        px: { md: 3.5 },
        py: { md: 3 },
        bgcolor: "surface.2",
      }}
    >
      <Avatar
        initials={ADVISOR.initials}
        tone="brand"
        size={44}
        sx={{ width: { md: 56 }, height: { md: 56 }, fontSize: { md: 20 } }}
      />
      <Box>
        <Typography
          component="p"
          variant="overline"
          sx={{ display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 }}
        >
          {overline ?? "A NOTE FROM GYASI"}
        </Typography>
        <Box sx={{ mt: 0.75, typography: { xs: "body2", md: "body1" }, textWrap: "pretty", color: "text.primary" }}>
          {body}
        </Box>
      </Box>
    </MuiCard>
  );
}
