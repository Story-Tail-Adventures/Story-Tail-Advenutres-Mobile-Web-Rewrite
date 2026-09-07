export interface NavLink {
    href: string;
    label: string;
}
interface PublicNavProps {
    links: readonly NavLink[];
    /** Below `md` the bar sits on a photo, so the hamburger is white. */
    overlay?: boolean;
}
/**
 * The only client island in the public shell: desktop links need the current path for
 * `aria-current`, and the mobile menu is a native <dialog> (focus trap, Escape and the
 * backdrop come from the browser). Closes itself after navigation and hands focus back to
 * the button that opened it.
 */
export declare function PublicNav({ links, overlay }: PublicNavProps): import("react").JSX.Element;
export {};
