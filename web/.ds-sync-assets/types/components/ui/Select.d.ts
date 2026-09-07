import * as React from "react";
/**
 * A labelled `<select>`, wired for accessibility the same way [Field] wires an input.
 *
 * Deliberately a sibling of `Field` rather than a mode of it: the two share only the label
 * and hint/error wiring, and a component that took either `options` or `type` would be
 * doing two jobs badly. What they DO share is the `.input` box, so a country picker sitting
 * beside a city input lines up.
 *
 * The chevron is an overlay rather than a `background-image`, because a background SVG
 * cannot read `currentColor` and would need one hex per scheme.
 */
export interface SelectOption {
    value: string;
    label: string;
}
export interface SelectFieldProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> {
    id: string;
    label: string;
    error?: string;
    hint?: string;
    options: readonly SelectOption[];
    /** Rendered first with an empty value — "no answer" as a real choice, not a default. */
    placeholder?: string;
    /** The id of a message outside this field that also describes it — see [Field]. */
    describedBy?: string;
}
export declare function SelectField({ id, label, error, hint, options, placeholder, describedBy: groupDescribedBy, className, ...props }: SelectFieldProps): React.JSX.Element;
