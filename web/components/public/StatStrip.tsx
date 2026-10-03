import MuiAvatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Container } from "./Container";

export interface Stat {
  value: string;
  label: string;
  icon: IconName;
}

/**
 * Four-up stats band under the About Gyasi hero (design: C2011 / M2011 stats strip).
 * Values come from the claims registry. Below `md` the four cells are a divided row with
 * the number in `primary.main` (it reads in the dark scheme where the prototype's burgundy
 * on navy did not); from `md` each stat gets the artboard's rounded Avatar glyph on the
 * primary container and the number goes back to the text colour. Stays a <dl>, which the
 * About page test counts by `dd`.
 */
export function StatStrip({ stats }: { stats: readonly Stat[] }) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Container size="wide" sx={{ px: { xs: 0, md: 4, web: 6 } }}>
        <Box
          component="dl"
          sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: { md: 3 }, py: { md: 3 }, m: 0 }}
        >
          {stats.map((stat, index) => (
            <Box
              key={stat.label}
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                alignItems: "center",
                gap: { md: 1.5 },
                px: { xs: 0.75, md: 0 },
                py: { xs: 1.75, md: 0 },
                textAlign: { xs: "center", md: "left" },
                borderLeft: index > 0 ? { xs: 1, md: 0 } : 0,
                borderColor: "divider",
              }}
            >
              <MuiAvatar
                variant="rounded"
                aria-hidden="true"
                sx={{
                  display: { xs: "none", md: "flex" },
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  bgcolor: "primary.container",
                  color: "primary.onContainer",
                }}
              >
                <Icon name={stat.icon} size={20} />
              </MuiAvatar>
              <Box>
                <Typography
                  component="dd"
                  variant="h4"
                  sx={{
                    order: -1,
                    m: 0,
                    fontWeight: 700,
                    fontSize: { xs: 18, md: 28 },
                    lineHeight: 1.1,
                    color: { xs: "primary.main", md: "text.primary" },
                  }}
                >
                  {stat.value}
                </Typography>
                <Typography component="dt" variant="caption" sx={{ display: "block", mt: { xs: 0.5, md: 0 }, color: "text.secondary" }}>
                  {stat.label}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
