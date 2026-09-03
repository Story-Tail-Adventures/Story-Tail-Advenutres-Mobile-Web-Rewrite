import { Icon, type IconName } from "@/components/ui/Icon";

/** Icon + short label on a tonal surface (design: 2.0.5 amenity grid). */
export function AmenityPill({ icon, label }: { icon: IconName; label: string }) {
  return (
    <li className="flex items-center gap-2 rounded-sm bg-surface-2 px-3 py-2.5">
      <Icon name={icon} size={16} className="shrink-0 text-brand-orange" />
      <span className="t-body-s text-on-surface">{label}</span>
    </li>
  );
}
