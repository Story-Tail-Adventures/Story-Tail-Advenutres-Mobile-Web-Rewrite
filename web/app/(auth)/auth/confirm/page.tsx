// §3.9 Login Support: where an advisor's emailed link lands. See ./state.ts.
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { AuthCard } from "@/components/auth/AuthCard";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { confirmSignInAction } from "./actions";
import { CONFIRM_TEXT, isConfirmType, isTokenHash } from "./state";

export const metadata: Metadata = {
  title: CONFIRM_TEXT.metaTitle,
  // The URL carries a one-time token hash: never index it, never send it on as a referrer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type SearchParams = Record<string, string | string[] | undefined>;
const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ConfirmSignInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tokenHash = single(params.token_hash);
  const type = single(params.type);
  const next = single(params.next) ?? "";

  if (single(params.failed) || !isTokenHash(tokenHash) || !isConfirmType(type)) {
    const failed = Boolean(single(params.failed));
    return (
      <AuthCard title={failed ? CONFIRM_TEXT.failedTitle : CONFIRM_TEXT.badTitle}>
        <Typography variant="body2" color="text.secondary">
          {failed ? CONFIRM_TEXT.failedBody : CONFIRM_TEXT.badBody}
        </Typography>
        <Box sx={{ mt: 2 }}>
          <MuiLink component={NextLink} href="/login" sx={{ fontWeight: 600 }}>
            {CONFIRM_TEXT.signInLink}
          </MuiLink>
        </Box>
      </AuthCard>
    );
  }

  return (
    <AuthCard overline={CONFIRM_TEXT.overline} title={CONFIRM_TEXT.title[type]} sub={CONFIRM_TEXT.sub[type]}>
      <form action={confirmSignInAction}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="filled" size="lg" fullWidth>
          {CONFIRM_TEXT.button[type]}
        </Button>
      </form>
    </AuthCard>
  );
}
