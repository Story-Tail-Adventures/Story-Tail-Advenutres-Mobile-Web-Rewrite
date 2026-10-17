import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { AgentAvailabilityForm } from "@/components/agent/AgentAvailabilityForm";
import { AgentNotificationsForm } from "@/components/agent/AgentNotificationsForm";
import { AgentProfileForm } from "@/components/agent/AgentProfileForm";
import { AgentSignatureForm } from "@/components/agent/AgentSignatureForm";
import { SettingsTabs } from "@/components/agent/SettingsTabs";
import { RetryState } from "@/components/client/RetryState";
import { loadAgentSettings } from "@/lib/agent/settings";
import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";
import { validSettingsTab } from "@/lib/agent/settingsTabs";

/**
 * §3.12 Agent Profile & Settings (ruled 2026-10-17, Screen Inventory §3.12). One page, one
 * tab per URL (`?tab=`), reached from the avatar menu: Profile (3.12.1), Availability (3.12.2),
 * Notifications (3.12.3) and Signature (3.12.4).
 *
 * NOT ON THE NAV RAIL, as `nav.ts` records: §6.4 settled the rail's seven entries.
 */

export const metadata = { title: "Settings" };

export default async function AgentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active = validSettingsTab(tab);
  const settings = await loadAgentSettings();

  if (!settings) {
    // RetryState, not ErrorState: that one links to /dashboard, a traveler route.
    return <RetryState />;
  }

  return (
    <Box sx={{ mx: "auto", width: "100%", maxWidth: 1120, px: 2, pb: 8 }}>
      <Typography component="h1" variant="h4" sx={{ mt: 2.5, fontWeight: 700 }}>
        {SETTINGS_COPY.pageTitle}
      </Typography>
      <SettingsTabs />
      {active === "profile" ? (
        <AgentProfileForm
          key="profile"
          profile={settings.profile}
          responseTimeHours={settings.availability.responseTimeHours}
        />
      ) : active === "availability" ? (
        <AgentAvailabilityForm key="availability" availability={settings.availability} />
      ) : active === "notifications" ? (
        <AgentNotificationsForm key="notifications" notifications={settings.notifications} />
      ) : (
        <AgentSignatureForm key="signature" signature={settings.signature} profile={settings.profile} />
      )}
    </Box>
  );
}
