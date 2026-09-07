interface AvatarProps {
    initials: string;
    /** Diameter in px. The .avatar class is 36; larger sizes scale the type with the circle. */
    size?: number;
    /** Brand burgundy on white is the prototype's agent avatar; tertiary is the default. */
    tone?: "brand" | "tertiary";
    className?: string;
    /** Accessible name; omit for decorative use next to the person's printed name. */
    label?: string;
}
/**
 * Initials avatar (design: `.avatar`, e.g. the "GS" agent avatar in the top bar).
 * Used everywhere the prototype showed a stock photograph of a person — testimonial
 * avatars and, until a real portrait exists, Gyasi's.
 */
export declare function Avatar({ initials, size, tone, className, label }: AvatarProps): import("react").JSX.Element;
export {};
