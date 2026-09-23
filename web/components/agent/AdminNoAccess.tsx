import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { signOutAction } from "@/lib/auth/actions";

/**
 * §5's permissions state, written for the one role that now reaches it.
 *
 * ONE COMPONENT, TWO SHELLS. This was written out twice — byte-for-byte, heading, body,
 * icon, Card classes and form — once in web/app/(agent)/layout.tsx and once in
 * web/app/(client)/layout.tsx, with a comment in each saying the other copy existed. That
 * is not a pin: nothing fails when one of them is edited and the other is not, there is no
 * test over either, and `check_copy_parity.py` does not read TSX. So a future wording change
 * lands on one shell and the admin sees two different explanations depending on which URL
 * they happened to type.
 *
 * A LAYOUT CANNOT EXPORT IT. Next rejects named exports other than its own conventions from
 * a layout file, so hoisting the shared copy needed a module of its own rather than one
 * layout importing the other's function.
 *
 * WHY IT SITS UNDER components/agent/ WHILE THE CLIENT SHELL USES IT TOO: it is §3.2's
 * find. Before §3.2 an agent on a client route got `UnauthorizedState`; §3.2 redirects
 * agents, which leaves ADMIN as the only role on either branch, and that is the role this
 * screen is written for. Moving it to components/ui/ when a third caller appears is a
 * rename, not a rewrite.
 *
 * `UnauthorizedState` (web/components/client/states.tsx) is still not usable here. Its body
 * is fixed to "Your account is set up as an advisor" and its button offers to sign the
 * caller back in as a traveler — true while an agent was the only caller, false for an
 * admin, who is neither and would land right back here. Giving that component a body prop
 * would collapse this into it, and is still the right follow-up.
 */
export function AdminNoAccess() {
  return (
    <Card className="mx-auto mt-6 max-w-lg p-7 text-center">
      <span
        className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-3 text-on-surface-variant"
        aria-hidden="true"
      >
        <Icon name="shield" size={26} />
      </span>
      <h2 className="t-title-l">You don’t have access to this view</h2>
      <p className="t-body mt-2 text-on-surface-variant">
        Your account is set up as an administrator. Story-Tail has no admin area yet, so
        there is nothing here for you — the traveler’s side and the advisor’s worklist are
        both somebody else’s desk.
      </p>
      {/* A form, not a link: the action clears the session server-side and then redirects,
          which is the only sequence the proxy will let through. */}
      <form action={signOutAction}>
        <button type="submit" className="btn btn-tonal mt-4">
          Sign out
        </button>
      </form>
    </Card>
  );
}
