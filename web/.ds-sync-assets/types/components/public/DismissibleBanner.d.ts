/**
 * Wraps a banner with a dismiss button remembered in localStorage.
 *
 * Deliberately not a cookie: reading a cookie in the page would make every public route
 * dynamic. The banner renders on the server and disappears on hydration for visitors who
 * dismissed it before — a brief flash for them, static HTML for everyone.
 */
export declare function DismissibleBanner({ storageKey, children, className, }: {
    storageKey: string;
    children: React.ReactNode;
    className?: string;
}): import("react").JSX.Element | null;
