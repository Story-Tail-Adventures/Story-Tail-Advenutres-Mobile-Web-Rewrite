"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { MFA_CODE_LENGTH } from "@/lib/validation/mfa";
import { beginMfaEnrollmentAction, verifyMfaEnrollmentAction } from "./actions";
import {
  MFA_SETUP_TEXT,
  initialMfaEnrollState,
  initialMfaVerifyState,
} from "./state";

/** The method tiles from C216. Only one of them is a choice today — see actions.ts. */
function MethodTiles() {
  const methods = [
    {
      icon: "sparkle" as const,
      title: MFA_SETUP_TEXT.methodAppTitle,
      sub: MFA_SETUP_TEXT.methodAppSub,
      on: true,
    },
    {
      icon: "phone" as const,
      title: MFA_SETUP_TEXT.methodSmsTitle,
      sub: MFA_SETUP_TEXT.methodSmsSub,
      on: false,
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-2">
      {methods.map((method) => (
        <li
          key={method.title}
          className={cn(
            "rounded-md border-[1.5px] p-3",
            method.on
              ? "border-primary bg-primary-container text-on-primary-container"
              : "border-outline-variant bg-surface-1 text-on-surface opacity-60",
          )}
        >
          <Icon name={method.icon} size={18} />
          <p className="t-title-s mt-1.5">{method.title}</p>
          <p className="t-body-s opacity-80">{method.sub}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Screen 2.1.6 MFA Setup — the interactive half (design: C216 / M216).
 *
 * Two forms, one per action. `useFormStatus` only reports on its nearest ancestor form, and
 * the two beats have genuinely different pending states — "getting your code" and "checking
 * that code" are not the same wait.
 */
export function MfaSetupForm({ next }: { next: string }) {
  const [enrollState, enrollAction] = useActionState(
    beginMfaEnrollmentAction,
    initialMfaEnrollState,
  );
  const [verifyState, verifyAction, isVerifying] = useActionState(
    verifyMfaEnrollmentAction,
    initialMfaVerifyState,
  );

  const { enrollment } = enrollState;

  return (
    <div className="flex flex-col gap-3.5">
      <MethodTiles />

      {enrollment ? (
        <>
          <Card variant="flat" className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
            {/* A plain <img>, not next/image, and deliberately.
                `next/image` refuses SVG data URIs outright — SVG is only allowed behind
                `dangerouslyAllowSVG`, a global relaxation whose name is the argument
                against turning it on for one QR code. There is also nothing here for it to
                do: the bytes are already in the response, so there is no fetch to optimise,
                no remote host to whitelist, and no layout shift to prevent at a fixed 112px.
                An SVG loaded through <img> cannot run script or fetch anything, which is
                the property that makes this safe. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qrCode}
              alt={MFA_SETUP_TEXT.scanTitle}
              width={112}
              height={112}
              className="size-28 shrink-0 self-center rounded-sm bg-white p-1.5"
            />
            <div className="min-w-0">
              <p className="t-title-s text-on-surface">{MFA_SETUP_TEXT.scanTitle}</p>
              <p className="t-body-s mt-1 text-on-surface-variant">{MFA_SETUP_TEXT.scanBody}</p>
              <p className="t-label mt-2 text-on-surface-variant">
                {MFA_SETUP_TEXT.secretLabel}
              </p>
              {/* Selectable and wrapping: "can't scan" is exactly when someone needs to
                  copy this by hand. */}
              <code className="t-mono block break-all text-on-surface">{enrollment.secret}</code>
            </div>
          </Card>

          <form action={verifyAction} className="flex flex-col gap-3.5">
            <input type="hidden" name="factorId" value={enrollment.factorId} />
            <input type="hidden" name="next" value={next} />

            <FormError error={verifyState.formError} />

            <fieldset disabled={isVerifying} className="contents">
              <Field
                id="code"
                name="code"
                label={MFA_SETUP_TEXT.codeLabel}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={MFA_CODE_LENGTH + 2}
                hint={MFA_SETUP_TEXT.codeHint}
                error={verifyState.fieldErrors?.code?.[0]}
                className="text-center font-mono tracking-[0.5em]"
              />
            </fieldset>

            <SubmitButton
              label={MFA_SETUP_TEXT.verify}
              pendingLabel={MFA_SETUP_TEXT.verifyPending}
            />
          </form>
        </>
      ) : (
        <form action={enrollAction} className="flex flex-col gap-3.5">
          <FormError error={enrollState.formError} />
          <SubmitButton
            label={MFA_SETUP_TEXT.begin}
            pendingLabel={MFA_SETUP_TEXT.beginPending}
          />
        </form>
      )}

      <Card variant="flat" className="p-3.5">
        <p className="t-title-s text-on-surface">{MFA_SETUP_TEXT.recoveryTitle}</p>
        <p className="t-body-s mt-1 text-on-surface-variant">{MFA_SETUP_TEXT.recoveryBody}</p>
      </Card>

      <Link href={next} className="t-label-l tap-44 self-center text-on-surface-variant">
        {MFA_SETUP_TEXT.skip}
      </Link>
    </div>
  );
}
