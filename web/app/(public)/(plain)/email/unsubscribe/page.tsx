// §3.10 Stage 4: "Stop emailing me about messages" (Data-Model §12.9, Screen Inventory §3.10).
// The link in every message email lands here. No sign-in: the token in the link is the
// credential, and it changes one switch for one person. Opening the page changes NOTHING (a
// mail scanner that follows links must not unsubscribe anyone); the button does.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { Alert } from "@/components/ui/Alert";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { isEmailToken, unsubscribeStatus } from "@/lib/email/unsubscribe";
import { single, type SearchParams } from "@/lib/search-params";
import { changeMessagesEmail } from "./actions";
import { UNSUBSCRIBE_COPY as C } from "./copy";

export const metadata: Metadata = {
  title: C.metaTitle,
  // A per-person link: never indexed, never followed.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = single(params.t) ?? "";
  const done = single(params.done);
  const status = isEmailToken(token) ? await unsubscribeStatus(token) : "invalid";

  let title: string;
  let body: string;
  let action: { label: string; on: boolean } | null = null;
  let signIn = false;
  if (status === "on") {
    title = done === "on" ? C.backOnTitle : C.onTitle;
    body = C.onBody;
    action = { label: C.stop, on: false };
  } else if (status === "off") {
    title = C.offTitle;
    body = C.offBody;
    action = { label: C.turnBackOn, on: true };
  } else if (status === "invalid") {
    title = C.invalidTitle;
    body = C.invalidBody;
    signIn = true;
  } else {
    title = C.unavailableTitle;
    body = C.unavailableBody;
  }

  return (
    <Box sx={{ display: "flex", flex: 1, justifyContent: "center", px: 2, py: { xs: 4, md: 8 } }}>
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 520, p: { xs: 3, md: 4 }, alignSelf: "flex-start" }}>
        {done === "error" && action && (
          <Box sx={{ mb: 2 }}>
            <Alert>{C.failed}</Alert>
          </Box>
        )}
        <Typography component="h1" variant="h5" sx={{ m: 0 }}>
          {title}
        </Typography>
        <Typography component="p" variant="body1" sx={{ m: 0, mt: 1.5, color: "text.secondary" }}>
          {body}
        </Typography>
        {action && (
          <Box component="form" action={changeMessagesEmail} sx={{ mt: 3 }}>
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="on" value={String(action.on)} />
            <Button type="submit" variant={action.on ? "outlined" : "filled"}>
              {action.label}
            </Button>
          </Box>
        )}
        {signIn && (
          <Box sx={{ mt: 3 }}>
            <MuiButton component={NextLink} href="/login" variant="contained">
              {C.signIn}
            </MuiButton>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
