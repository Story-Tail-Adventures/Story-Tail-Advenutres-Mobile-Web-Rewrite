/** One day of a sample itinerary (design: 2.0.5). Render inside an <ol>. */
export function NumberedRow({ n, label }: { n: number; label: string }) {
  return (
    <li className="card flex items-center gap-2.5 px-3 py-2 md:gap-3 md:px-3.5 md:py-2.5">
      <span
        aria-hidden="true"
        className="t-badge inline-flex size-5.5 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container normal-case md:size-7"
      >
        {n}
      </span>
      <span className="t-body-s md:t-body text-on-surface">{label}</span>
    </li>
  );
}
