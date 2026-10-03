import Box from "@mui/material/Box";
import { Container } from "@/components/public/Container";
import { PublicTopBar } from "@/components/public/PublicTopBar";
import { NotFoundBody } from "./NotFoundBody";

/**
 * Not-found boundary for the public surface: unknown trip or legal slugs (`dynamicParams =
 * false`) and any `notFound()` thrown under (public). Screen Inventory §5 error state.
 *
 * It renders in place of the (hero) / (plain) layouts' children, so it brings its own solid
 * top bar and the `<main id="main">` the skip link targets. The public layout above it still
 * supplies the skip link, the placeholder banner and the footer.
 */
export default function PublicNotFound() {
  return (
    <Box sx={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <PublicTopBar variant="solid" />
      <Box component="main" id="main" sx={{ display: "flex", flex: 1, flexDirection: "column" }}>
        <Container size="prose" sx={{ py: 8, textAlign: "center" }}>
          <NotFoundBody />
        </Container>
      </Box>
    </Box>
  );
}
