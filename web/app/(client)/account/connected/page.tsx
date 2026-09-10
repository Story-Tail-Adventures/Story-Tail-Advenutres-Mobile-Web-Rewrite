import type { Metadata } from "next";

import { SettingsGroup, SettingsRow } from "@/components/ui/SettingsList";
import { OAUTH_PROVIDERS, PROVIDER_LABEL } from "@/lib/auth/providers";
import { createClient } from "@/lib/supabase/server";

import { AccountHeader } from "../AccountHeader";
import { CONNECTED } from "./content";

export const metadata: Metadata = { title: "Connected accounts" };

/**
 * Screen Inventory 2.5.8 — Connected Accounts. §4.4 Pattern A.
 * Artboards: client-account.jsx `C258_Connected`, client-account-mobile.jsx `M258_Connected`.
 *
 * READ-ONLY today. The state reads; neither action has a safe path.
 *
 * GOOGLE AND APPLE ONLY, and the Screen Inventory is already correct on this — it is the
 * ARTBOARD that adds a Facebook row marked "Not connected · available". `auth_provider` is
 * ENUM ('email','google','apple') and `web/lib/auth/providers.ts` carries the same two, so
 * the list is derived from that constant rather than typed out here. A provider we do not
 * have, described as available, reads as one click away.
 *
 * WHY DISCONNECT IS DISABLED — and it must stay disabled until an Edge Function exists.
 * Unlinking the last identity on an account with no password is a PERMANENT LOCKOUT: there
 * would be no way back in. The refusal has to happen server-side, in an audited function
 * that checks what else the account can authenticate with. It cannot be a disabled button
 * (the client decides nothing) and it must not lean on GoTrue's own guard. This is the same
 * OAuth-shaped assumption 2.5.7 closes on its password card and 2.5.10 on its confirmation
 * field — three screens, one thing to stop assuming.
 *
 * WHY CONNECT IS DISABLED: `linkIdentity` needs manual linking enabled on the project, and
 * it is not. Turning it on is a config change with its own consequences, so it is a decision
 * rather than a cleanup.
 *
 * The provider state is read from `account.auth_provider` — the column is granted and this
 * works today. The richer source is `supabase.auth.getUserIdentities()`, which lists every
 * linked identity rather than the one the account was created with; it belongs here the day
 * linking is actually possible, because until then the two agree.
 */
export default async function ConnectedAccountsPage() {
  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from("account")
    .select("auth_provider")
    .maybeSingle();

  // A FAILED read is not the same as "no provider". Defaulting to null used to fall through
  // to the OAuth note, which tells an email-and-password user they have no password — a
  // false statement about their own account, on the screen they came to to check. Unknown
  // stays unknown and the note is omitted.
  if (error) console.warn("[account] auth_provider read failed", { code: error.code });
  const signedUpWith = error ? undefined : (account?.auth_provider ?? null);

  return (
    <div className="client-fill">
      <AccountHeader title={CONNECTED.title} sub={CONNECTED.subtitle} />

      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <SettingsGroup>
          {OAUTH_PROVIDERS.map((provider, index) => {
            const linked = signedUpWith === provider;
            return (
              <SettingsRow
                key={provider}
                first={index === 0}
                title={PROVIDER_LABEL[provider]}
                sub={linked ? CONNECTED.linked : CONNECTED.notLinked}
                trailing={
                  <button
                    type="button"
                    className="btn btn-outlined btn-sm shrink-0"
                    disabled
                    aria-disabled="true"
                    title={linked ? CONNECTED.unlinkDeferred : CONNECTED.linkDeferred}
                  >
                    {linked ? CONNECTED.unlinkCta : CONNECTED.linkCta}
                  </button>
                }
              />
            );
          })}
        </SettingsGroup>

        {signedUpWith !== undefined && (
          <p className="t-body-s mt-4 text-on-surface-variant">
            {signedUpWith === "email" ? CONNECTED.emailAccountNote : CONNECTED.oauthAccountNote}
          </p>
        )}
        <p className="t-body-s mt-3 text-on-surface-variant">{CONNECTED.safetyNote}</p>
      </div>
    </div>
  );
}
