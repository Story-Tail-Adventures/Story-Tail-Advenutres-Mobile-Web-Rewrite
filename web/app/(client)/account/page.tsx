import type { Metadata } from "next";

import { Icon } from "@/components/ui/Icon";
import { SettingsGroup, SettingsRow } from "@/components/ui/SettingsList";
import { signOutAction } from "@/lib/auth/actions";
import { INITIALS_FALLBACK, initialsFor } from "@/lib/auth/initials";
import { createClient } from "@/lib/supabase/server";

import { ACCOUNT } from "./content";

export const metadata: Metadata = { title: "Account" };

/**
 * Screen Inventory 2.5.1 — Account Overview / My Account.
 * §4.4 Pattern D variant: "Mobile: list of tiles. Tablet/web: grid of tiles."
 *
 * Artboards: design/source-prototype/screens/client-account.jsx (C251_AccountOverview),
 * and client-account-mobile.jsx (M251_AccountOverview).
 *
 * This is the ROOT of the Account destination, so it is the one §2.5 screen that is reached
 * from the rail rather than pushed from a hub — and it is the only place in the app that
 * owns SIGN OUT. `states.tsx`'s `UnauthorizedState` records that sign-out had no home until
 * this screen existed.
 *
 * DEPARTURES FROM THE ARTBOARD, each recorded in the Screen Inventory note at 2.5.1:
 *  · No "Member ID · STA-5839" chip — there is no such column anywhere, and inventing a
 *    customer number is a support burden rather than a feature.
 *  · The avatar is INITIALS, not a photograph. `web/lib/images.ts` has no avatar entries at
 *    all, so every `staImg('avatar*')` in the artboards is a stock portrait of a stranger.
 *    `platform_user.avatar_url` exists for the day a traveler uploads one.
 *  · "Payment methods" renders disabled with a reason — §2.4 is unbuilt. This matches the
 *    built dashboard, which carries `authorizeCardComingSoon`, rather than the §2.2
 *    artboard, which still draws a live "Authorize a card" CTA.
 *  · "Notifications" is disabled too: `notification_preference` has RLS with no policy and
 *    no row-creation path, so 2.5.6 would read zero rows forever. See its own note.
 *
 * The tile subtitles say what is INSIDE, in data, and the document count is read rather than
 * hardcoded — a count here that the destination screen contradicts is the cheapest possible
 * bug to ship.
 */
export default async function AccountPage() {
  const supabase = await createClient();

  const [{ data: client }, { data: documents }] = await Promise.all([
    supabase
      .from("client")
      .select("first_name, last_name, preferred_name, email, created_at")
      .maybeSingle(),
    // `document_self_select` scopes this to the caller; no `.eq()` needed, and none of the
    // withheld columns (storage_bucket / storage_key / checksum_sha256) is selected.
    supabase.from("document").select("id, kind").is("archived_at", null),
  ]);

  const initials = initialsFor(client?.preferred_name ?? client?.first_name, client?.last_name);
  const displayName =
    [client?.preferred_name ?? client?.first_name, client?.last_name].filter(Boolean).join(" ") ||
    "Your account";

  const memberSince = client?.created_at
    ? new Date(client.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  const fileCount = documents?.length ?? 0;

  return (
    <div className="client-fill">
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <header className="mb-6 flex items-center gap-4 rounded-[20px] bg-linear-to-br from-primary-container to-secondary-container p-5 text-on-primary-container">
          <span
            className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface text-on-surface"
            aria-hidden="true"
          >
            <span className="t-title-l">{initials || INITIALS_FALLBACK}</span>
          </span>
          <div className="min-w-0">
            <h1 className="t-headline truncate">{displayName}</h1>
            {client?.email && <p className="t-body-s truncate opacity-85">{client.email}</p>}
            {memberSince && (
              <p className="t-body-s opacity-85">{ACCOUNT.memberSince(memberSince)}</p>
            )}
          </div>
        </header>

        <SettingsGroup label={ACCOUNT.groupYou}>
          <SettingsRow
            first
            icon="user"
            title={ACCOUNT.personal}
            sub={ACCOUNT.personalSub}
            href="/account/personal"
          />
          <SettingsRow
            icon="heart"
            title={ACCOUNT.preferences}
            sub={ACCOUNT.preferencesSub}
            href="/account/preferences"
          />
          <SettingsRow
            icon="passport"
            title={ACCOUNT.documents}
            sub={fileCount === 0 ? ACCOUNT.documentsEmptySub : ACCOUNT.documentsSub(fileCount, 0)}
            href="/documents"
          />
        </SettingsGroup>

        <SettingsGroup label={ACCOUNT.groupApp}>
          <SettingsRow
            first
            icon="bell"
            title={ACCOUNT.notifications}
            disabled
            reason={ACCOUNT.comingSoon}
          />
          <SettingsRow
            icon="shield"
            title={ACCOUNT.security}
            sub={ACCOUNT.securitySub}
            href="/account/security"
          />
          <SettingsRow
            icon="link"
            title={ACCOUNT.connected}
            sub={ACCOUNT.connectedSub}
            href="/account/connected"
          />
          <SettingsRow icon="card" title={ACCOUNT.wallet} disabled reason={ACCOUNT.comingSoon} />
        </SettingsGroup>

        <SettingsGroup label={ACCOUNT.groupSupport}>
          <SettingsRow
            first
            icon="question"
            title={ACCOUNT.help}
            sub={ACCOUNT.helpSub}
            href="/account/help"
          />
          <SettingsRow
            icon="lock"
            title={ACCOUNT.privacy}
            sub={ACCOUNT.privacySub}
            href="/account/privacy"
          />
        </SettingsGroup>

        {/* A form rather than a button with an onClick: this is a server component, and a
            handler cannot cross the RSC boundary. `signOutAction` signs out THIS browser
            only — "sign out everywhere" is 2.5.7's, deliberately. */}
        <form action={signOutAction} className="mt-6">
          <button type="submit" className="btn btn-outlined w-full">
            <Icon name="arrow_left" size={15} /> {ACCOUNT.signOut}
          </button>
        </form>
      </div>
    </div>
  );
}
