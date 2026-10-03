import type { Metadata } from "next";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { FaqList } from "@/components/public/FaqList";
import { Icon } from "@/components/ui/Icon";
import { helpFaqs } from "@/lib/account/help-faqs";

import { AccountHeader } from "../AccountHeader";
import { HELP } from "./content";

export const metadata: Metadata = { title: "Help & support" };

/** The legacy `.btn` box (40px, 24px sides) on MUI's Button, for the message link. */
const BTN_SX = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/** The uppercase group label SettingsGroup draws, for a section here that is not one. */
const GROUP_LABEL_SX = {
  display: "block",
  mt: 3,
  mb: 1,
  px: 0.5,
  lineHeight: 1.3,
  color: "text.secondary",
} as const;

/**
 * Screen Inventory 2.5.11 — Help & Support. §4.4 Pattern I + B (FAQ list).
 * Artboards: client-account.jsx `C2511_Help`, client-account-mobile.jsx `M2511_Help`.
 *
 * Real today, because it mutates nothing and every source is a typed content module already
 * in the repo — there is no CMS and this screen must not introduce a second store.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.11:
 *  · "Email platform support" is GONE. No `support@` address exists anywhere in the repo:
 *    the app configures exactly one outbound address, `env.inquiryEmail`, deliberately null
 *    when unset so nothing invents one. Story-Tail is one advisor, and a second tier that
 *    routes somewhere other than Gyasi would promise a queue nobody staffs.
 *  · The card-authorization questions are held until §2.4 ships. An FAQ that explains an
 *    unreachable screen is worse than no FAQ.
 *  · "Message Gyasi" now goes to /messages/new. It was a `mailto:` while §2.6.3 could not
 *    send, on the rule that a CTA which looks like a way to reach him and is not one is worse
 *    than a plain email link. §2.6 landed, so it repoints — which is what that note said it
 *    would do. A message left here now arrives in the inbox, where the reply can be found
 *    again; an emailed one arrives wherever that address goes.
 *  · Reply-window wording is the settled "Usually replies the same day". The public
 *    surface's "< 2h" is an unverified claim fenced behind PUBLIC_CLAIMS_MODE=strict and
 *    must not spread to an authenticated screen.
 */
export default function HelpPage() {
  // The two published FAQ sets, deduped by TOPIC and filtered of anything §2.4 owns. This
  // was inline until it was tested, and inline is how it came to claim a dedupe it did not
  // perform — see lib/account/help-faqs.ts.
  const faqs = helpFaqs();

  return (
    <div className="client-fill">
      <AccountHeader title={HELP.title} sub={HELP.subtitle} />

      <Box sx={{ mx: "auto", width: "100%", maxWidth: 672, p: { xs: 2, md: 3 } }}>
        {/* The artboard's "Talk to Gyasi" panel: a flat Paper on primary.container. */}
        <Paper elevation={0} sx={{ p: 2.5, bgcolor: "primary.container", color: "primary.onContainer" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Avatar
              aria-hidden="true"
              sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: "surface.main", color: "text.primary" }}
            >
              <Typography component="span" variant="subtitle1">
                {HELP.advisorInitials}
              </Typography>
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="p" variant="subtitle1">
                {HELP.advisorName}
              </Typography>
              <Typography component="p" variant="caption" sx={{ display: "block", opacity: 0.85 }}>
                {HELP.replyWindow}
              </Typography>
            </Box>
          </Box>
          <Typography component="p" variant="body2" sx={{ mt: 1.5, opacity: 0.9 }}>
            {HELP.advisorBody}
          </Typography>
          <MuiButton
            component={NextLink}
            href="/messages/new"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ ...BTN_SX, mt: 2 }}
          >
            <Icon name="message" size={14} /> {HELP.messageCta}
          </MuiButton>
        </Paper>

        <Typography component="h2" variant="overline" sx={GROUP_LABEL_SX}>
          {HELP.faqHeading}
        </Typography>
        {/* The §2.0 FAQ accordion (a client island; the page stays a Server Component). The
            legacy <details> list opened independently and started closed, so nothing opens
            by default here; the island's one-at-a-time rule is the one behaviour change. */}
        <FaqList items={faqs} name="help-faq" defaultOpenFirst={false} answerSize="m" />

        <Box
          component="nav"
          aria-label={HELP.legalHeading}
          sx={{ mt: 3, display: "flex", justifyContent: "center", gap: 2 }}
        >
          {HELP.legal.map((doc) => (
            <MuiLink
              key={doc.slug}
              component={NextLink}
              href={`/legal/${doc.slug}`}
              variant="body2"
              sx={{ color: "text.secondary" }}
            >
              {doc.label}
            </MuiLink>
          ))}
        </Box>
      </Box>
    </div>
  );
}
