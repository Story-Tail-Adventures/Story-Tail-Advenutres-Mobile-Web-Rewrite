import * as React from "react";
type Href = string | {
    pathname?: string;
    query?: Record<string, string | number>;
    hash?: string;
};
export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
    href: Href;
    prefetch?: boolean | null;
    replace?: boolean;
    scroll?: boolean;
    shallow?: boolean;
    passHref?: boolean;
    legacyBehavior?: boolean;
    locale?: string | false;
}
export declare const Link: React.ForwardRefExoticComponent<LinkProps & React.RefAttributes<HTMLAnchorElement>>;
export default Link;
