import { type IconName } from "../ui/Icon";
export interface InquiryField {
    label: string;
    value: string;
    icon: IconName;
}
interface InquiryBarProps {
    fields: readonly InquiryField[];
    action: {
        label: string;
        href: string;
        icon?: IconName;
    };
    /** Sticks under the top bar from `md` (topic pages). */
    sticky?: boolean;
    /** `compact` = the 2.0.4 header pill. */
    density?: "default" | "compact";
    /** Below `md`: a stacked card, a one-line summary pill, or nothing (topic pages use StickyCta). */
    mobile?: "stacked" | "summary" | "hidden";
    /** Text for the mobile summary pill ("Caribbean · Aug · 2 adults"). */
    summary?: string;
    /** Href of the mobile summary's "Edit" chip. */
    editHref?: string;
    className?: string;
}
/**
 * The read-only inquiry pill (design: StickyInquireBar, the C203/C204 search pills and the
 * M203/M204 mobile variants). Cells are display text; the CTA is a link. The real search
 * form on 2.0.3 is a separate component built on next/form.
 */
export declare function InquiryBar({ fields, action, sticky, density, mobile, summary, editHref, className, }: InquiryBarProps): import("react").JSX.Element;
export {};
