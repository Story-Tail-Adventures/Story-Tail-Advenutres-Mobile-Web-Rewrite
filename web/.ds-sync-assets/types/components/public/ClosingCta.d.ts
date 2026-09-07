import type { ImageKey } from "../../lib/images";
interface ClosingCtaProps {
    image: ImageKey;
    title: string;
    body: string;
    primary: {
        label: string;
        href: string;
    };
    secondary: {
        label: string;
        href: string;
    };
    className?: string;
}
/** Photo band with two CTAs at the end of the topic and advisor pages (design: ClosingCTA). */
export declare function ClosingCta({ image, title, body, primary, secondary, className }: ClosingCtaProps): import("react").JSX.Element;
export {};
