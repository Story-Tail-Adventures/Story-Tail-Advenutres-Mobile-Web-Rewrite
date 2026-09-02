import * as React from "react";
import { cn } from "@/lib/cn";

export type CardVariant = "default" | "flat" | "tonal" | "elevated";

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: "",
  flat: "card-flat",
  tonal: "card-tonal",
  elevated: "card-elev",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export function Card({ variant = "default", className, ...props }: CardProps) {
  return (
    <div className={cn("card", VARIANT_CLASS[variant], className)} {...props} />
  );
}
