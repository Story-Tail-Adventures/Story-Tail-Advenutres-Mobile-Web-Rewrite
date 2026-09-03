import { Icon } from "@/components/ui/Icon";

/** One credential row (design: C2011 / M2011 credentials). Values come from the claims registry. */
export function CredentialCard({ title, detail }: { title: string; detail?: string }) {
  return (
    <li className="card flex items-center gap-2.5 px-3.5 py-2.5 md:items-start md:gap-3 md:p-3.5">
      <span className="hidden size-9 shrink-0 items-center justify-center rounded-sm bg-secondary-container text-on-secondary-container md:inline-flex">
        <Icon name="shield" size={16} />
      </span>
      <Icon name="shield" size={14} className="shrink-0 text-secondary md:hidden" />
      <div>
        <p className="t-title-s text-on-surface">{title}</p>
        {detail && <p className="t-body-s hidden text-on-surface-variant md:block">{detail}</p>}
      </div>
    </li>
  );
}
