import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

import { AccountHeader } from "../AccountHeader";
import { PRIVACY } from "./content";

export const metadata: Metadata = { title: "Privacy & data" };

/**
 * Screen Inventory 2.5.9 — Privacy & Data Export. §4.4 Pattern A.
 * Artboards: client-account.jsx `C259_Privacy`, client-account-mobile.jsx `M259_Privacy`.
 *
 * READ-ONLY today. Everything shown is static or already-published content; the one action
 * is disabled with a reason.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.9:
 *  · The Analytics / Marketing tracking toggles are GONE, replaced by a statement. There is
 *    no analytics script, tag manager or advertising pixel anywhere in web/, and
 *    web/content/public/legal/cookies.ts already tells people in writing that we run none.
 *    Switches over nothing are a control that lies, and they contradicted a shipped legal
 *    page. They come back the day a tracker does.
 *  · The export does NOT claim to include the document-access trail. Every signature from
 *    trip-document-url writes an `audit_event`, but that is the agency's table and §2.2
 *    deliberately gave clients no policy on it — naming it here would promise data the
 *    client has no path to.
 *  · "Request an export" is DISABLED: there is no `data_export_request` entity to write to
 *    and no Edge Function that creates one. Reading a status out of `audit_event` is the
 *    side door §2.2 refused. The entity has to land first — it is specified in the Screen
 *    Inventory note and belongs in Data-Model §18.5.
 */
export default function PrivacyPage() {
  return (
    <div className="client-fill">
      <AccountHeader title={PRIVACY.title} sub={PRIVACY.subtitle} />

      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Icon name="download" size={18} />
            <h2 className="t-title-s">{PRIVACY.exportTitle}</h2>
          </div>
          <p className="t-body-s mt-1.5 text-on-surface-variant">{PRIVACY.exportBody}</p>
          <button
            type="button"
            className="btn btn-filled mt-4 w-full"
            disabled
            aria-disabled="true"
            title={PRIVACY.exportDeferred}
          >
            {PRIVACY.exportCta}
          </button>
          <p className="t-body-s mt-2 text-center text-on-surface-variant">
            {PRIVACY.exportDeferred}
          </p>
        </Card>

        <h2 className="t-label mt-6 mb-2 px-1 tracking-wide text-on-surface-variant">
          {PRIVACY.trackingHeading}
        </h2>
        <Card className="flex gap-3 p-4">
          <Icon name="shield" size={18} className="shrink-0 text-on-surface-variant" />
          <p className="t-body-s text-on-surface-variant">
            {PRIVACY.trackingBody}{" "}
            <Link href="/legal/cookies" className="underline">
              {PRIVACY.cookiesLink}
            </Link>
          </p>
        </Card>

        <Card className="mt-6 border-0 bg-error-container p-5 text-on-error-container">
          <div className="flex items-center gap-2">
            <Icon name="warning" size={18} />
            <h2 className="t-title-s">{PRIVACY.closeTitle}</h2>
          </div>
          <p className="t-body-s mt-1.5 opacity-90">{PRIVACY.closeBody}</p>
          <Link
            href="/account/close"
            className="btn mt-4 w-full bg-on-error-container text-error-container"
          >
            {PRIVACY.closeCta}
          </Link>
        </Card>
      </div>
    </div>
  );
}
