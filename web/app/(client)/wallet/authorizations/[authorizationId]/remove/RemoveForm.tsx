"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import type { AuthorizeState } from "@/lib/wallet/actions";
import { WALLET } from "@/lib/wallet/content";

const IDLE: AuthorizeState = { status: "idle" };

/**
 * Screen 2.4.7's confirmation.
 *
 * NO TYPE-TO-CONFIRM. §2.5.10's account closure asks the traveler to type their email,
 * because that is irreversible and takes everything with it. This is not that: removing an
 * authorization stops future charges on one card for one trip, and re-authorizing is two
 * taps. Matching the heavier ceremony would teach people to type past confirmations.
 *
 * The destructive button is the one on the right and is not the default focus; Cancel is a
 * plain link so a stray Enter cannot fire the revoke.
 */
export function RemoveForm({
  action,
}: {
  action: (previous: AuthorizeState, formData: FormData) => Promise<AuthorizeState>;
}) {
  const [state, submit, pending] = useActionState(action, IDLE);

  return (
    <form action={submit} className="mt-5">
      {state.status === "error" && (
        <p role="alert" className="t-body-s mb-2 text-error">
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <Link href="/wallet" className="btn btn-outlined tap-44 h-11">
          {WALLET.removeCancel}
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-danger tap-44 ml-auto h-11"
        >
          <Icon name={pending ? "clock" : "warning"} size={14} />
          {WALLET.removeCta}
        </button>
      </div>
    </form>
  );
}
