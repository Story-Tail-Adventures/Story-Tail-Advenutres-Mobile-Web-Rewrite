import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface ScriptureLineProps {
  quote: string;
  reference: string;
  /** On photography (landing hero) or on a surface (About pillars). */
  tone?: "on-photo" | "surface";
  className?: string;
}

/**
 * A short quotation in the script face with a small reference label.
 * Design-System §2: the landing and About surfaces are where the voice is most explicit.
 *
 * The quote is a <q> with `quotes: none`: the strings carry their own quotation marks, so
 * the element must not add a second pair. On a photo the script is the brand gold
 * (scheme-independent); on a surface it is `primary.main`, which the converted Pillar
 * artboard uses — burgundy in light, the ocean blue in the dark scheme.
 */
export function ScriptureLine({ quote, reference, tone = "surface", className }: ScriptureLineProps) {
  if (tone === "on-photo") {
    return (
      <Box
        component="span"
        className={className}
        sx={{ display: "inline-flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 1.75, rowGap: 0.75 }}
      >
        <Typography
          component="q"
          variant="script"
          sx={{
            quotes: "none",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: { xs: 17, md: 18 },
            lineHeight: 1.4,
            color: "brandSource.gold",
          }}
        >
          {quote}
        </Typography>
        <Typography
          component="span"
          variant="overline"
          sx={{ color: "common.white", opacity: 0.8, letterSpacing: 1.2, lineHeight: 1.3, fontWeight: 600 }}
        >
          {reference}
        </Typography>
      </Box>
    );
  }
  return (
    <Box
      className={className}
      sx={{
        mt: 1.75,
        pt: 1.5,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: 1.25,
        rowGap: 0.5,
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <Typography
        component="q"
        variant="script"
        sx={{
          quotes: "none",
          fontWeight: 700,
          fontSize: { xs: 18, md: 22 },
          lineHeight: { xs: 1.1, md: 1 },
          color: "primary.main",
        }}
      >
        {quote}
      </Typography>
      <Typography
        component="span"
        variant="overline"
        sx={{ color: "text.secondary", whiteSpace: "nowrap", letterSpacing: 1.2, lineHeight: 1.3, fontWeight: 600 }}
      >
        {reference}
      </Typography>
    </Box>
  );
}
