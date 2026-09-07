import * as React from "react";
export type CardVariant = "default" | "flat" | "tonal" | "elevated";
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: CardVariant;
}
export declare function Card({ variant, className, ...props }: CardProps): React.JSX.Element;
