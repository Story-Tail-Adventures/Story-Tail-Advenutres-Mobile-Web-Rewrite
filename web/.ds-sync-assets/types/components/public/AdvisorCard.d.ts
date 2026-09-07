interface AdvisorCardProps {
    /** `bio` (2.0.2), `planned` (2.0.5 aside), `note` (2.0.10 letter). */
    variant: "bio" | "planned" | "note";
    title?: string;
    body?: React.ReactNode;
    overline?: string;
    action?: {
        label: string;
        href: string;
    };
    className?: string;
}
/**
 * Gyasi's card in its three prototype shapes. The portrait is the initials avatar until a
 * real photograph is supplied (decision 4); stats come from the claims registry.
 */
export declare function AdvisorCard({ variant, title, body, overline, action, className }: AdvisorCardProps): import("react").JSX.Element;
export {};
