"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The full-width primary submit every 2.1.x form ends with, with its pending state.
 *
 * `useFormStatus` only reports the status of the nearest ancestor `<form>`, which is why
 * this has to be its own component rather than a branch inside each form — a hook called
 * in the component that renders the form would read `pending: false` forever.
 */
export function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" size="lg" fullWidth disabled={pending}>
      {pending ? (
        <>
          <Spinner className="size-5" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
