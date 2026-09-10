import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { TextareaField } from "@/components/ui/Textarea";
import { createClient } from "@/lib/supabase/server";

import { AccountHeader } from "../AccountHeader";
import { CLOSE } from "./content";

export const metadata: Metadata = {
  title: "Close account",
  robots: { index: false, follow: false },
};

/**
 * Screen Inventory 2.5.10 — Account Closure. §4.4 Pattern J (destructive confirmation).
 * Artboards: client-account.jsx `C2510_Closure`, client-account-mobile.jsx `M2510_Closure`.
 *
 * READ-ONLY today: the CTA is disabled because NO Edge Function writes to `account` — a grep
 * across supabase/functions returns zero hits for that table — and PostgREST is refused
 * twice over (no write policy, and the write verbs are not granted).
 *
 * A full-screen route, NOT a modal or a bottom sheet. Same argument §2.2.9 makes for the
 * status-change screen: a destructive confirmation with a text field deserves its own URL
 * and its own Back, and on mobile a sheet's grabber reads as "swipe this away", which is
 * exactly wrong here.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.10:
 *  · Confirmation is a TYPED EMAIL, not a password re-entry. `auth_provider` is
 *    ('email','google','apple'), so a Google or Apple account has no password and the
 *    artboard's password field is a wall those accounts cannot pass.
 *  · NO "within 30 days". Data-Model §18.5 describes that window and nothing implements it
 *    — no migration, no pg_cron entry, no function. A dated retention promise on a legal
 *    screen is the class of claim PUBLIC_CLAIMS_MODE=strict exists to stop.
 *  · Card revocation is stated as a CONSEQUENCE, which is true whether or not §2.4 shipped.
 *  · The reason field has no column of its own — `account.locked_reason` is agent-facing and
 *    withheld from clients — so it is disabled alongside the CTA rather than collected into
 *    the wrong place. See the note for the two options.
 */
export default async function CloseAccountPage() {
  const supabase = await createClient();
  const { data: account } = await supabase.from("account").select("email").maybeSingle();

  return (
    <div className="client-fill">
      <AccountHeader
        title={CLOSE.title}
        backHref="/account/privacy"
        backLabel={CLOSE.back}
      />

      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container"
            aria-hidden="true"
          >
            <Icon name="warning" size={20} />
          </span>
          <h2 className="t-title-l">{CLOSE.heading}</h2>
        </div>

        <Card variant="flat" className="p-4">
          <p className="t-label-s text-on-surface-variant">{CLOSE.whatHappensLabel}</p>
          <ul className="t-body-s mt-1.5 list-disc pl-5 leading-7">
            {CLOSE.whatHappens.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>

        <Card className="mt-3 border-0 bg-secondary-container p-4 text-on-secondary-container">
          <p className="t-body-s">
            {CLOSE.reconsiderBody}{" "}
            <a href={CLOSE.mailto} className="font-semibold underline">
              {CLOSE.reconsiderCta}
            </a>
          </p>
        </Card>

        <div className="mt-5">
          <TextareaField
            id="closure-reason"
            label={CLOSE.reasonLabel}
            name="reason"
            rows={3}
            placeholder={CLOSE.reasonPlaceholder}
            disabled
          />
        </div>

        <div className="mt-3">
          <Field
            id="closure-confirm-email"
            label={CLOSE.confirmLabel}
            name="confirmEmail"
            type="email"
            placeholder={account?.email ?? CLOSE.confirmPlaceholder}
            hint={CLOSE.confirmHint}
            disabled
          />
        </div>

        <button
          type="button"
          className="btn btn-danger mt-5 w-full"
          disabled
          aria-disabled="true"
          title={CLOSE.deferred}
        >
          {CLOSE.confirmCta}
        </button>
        <p className="t-body-s mt-2 text-center text-on-surface-variant">{CLOSE.deferred}</p>

        <Link href="/account" className="btn btn-text mt-2 w-full">
          {CLOSE.keepCta}
        </Link>
      </div>
    </div>
  );
}
