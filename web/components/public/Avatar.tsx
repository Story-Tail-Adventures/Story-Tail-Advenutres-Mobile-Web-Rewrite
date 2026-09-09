import { cn } from "@/lib/cn";

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
export function Avatar({ initials, size = 36, tone = "tertiary", className, label }: AvatarProps) {
  const fontSize = Math.max(10, Math.round(size * 0.36));
  return (
    <span
      className={cn("avatar select-none", tone === "brand" && "bg-brand-burgundy text-white", className)}
      style={{ width: size, height: size, fontSize }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {initials}
    </span>
  );
}
