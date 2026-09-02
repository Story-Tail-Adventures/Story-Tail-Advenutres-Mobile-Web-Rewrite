import { cn } from "@/lib/cn";

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("divider", className)} />;
}

/**
 * A labelled rule — "———— OR ————". Used between the social and email sign-in
 * blocks on 2.1.1 / 2.1.2.
 */
export function DividerWithLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Divider className="flex-1" />
      <span className="t-label text-on-surface-variant">{label}</span>
      <Divider className="flex-1" />
    </div>
  );
}
