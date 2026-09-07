/**
 * The full-width primary submit every 2.1.x form ends with, with its pending state.
 *
 * `useFormStatus` only reports the status of the nearest ancestor `<form>`, which is why
 * this has to be its own component rather than a branch inside each form — a hook called
 * in the component that renders the form would read `pending: false` forever.
 */
export declare function SubmitButton({ label, pendingLabel, }: {
    label: string;
    pendingLabel: string;
}): import("react").JSX.Element;
