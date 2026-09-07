import * as React from "react";
/**
 * A labelled `<textarea>`, wired the same way [Field] wires an input.
 *
 * Shares `.input`'s box so it lines up beside one, with the fixed height and the
 * single-line `line-height` overridden — those are what make `.input` an input.
 */
export interface TextareaFieldProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
    id: string;
    label: string;
    error?: string;
    hint?: string;
    /** The id of a message outside this field that also describes it — see [Field]. */
    describedBy?: string;
}
export declare function TextareaField({ id, label, error, hint, describedBy: groupDescribedBy, className, rows, ...props }: TextareaFieldProps): React.JSX.Element;
