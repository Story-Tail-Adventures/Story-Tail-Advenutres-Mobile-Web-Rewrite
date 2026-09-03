import Link from "next/link";
import { NOT_FOUND } from "./fallback-content";

/**
 * Overline, headline, body and the two ways home — shared by the public not-found page (inside
 * the shell) and the root not-found page (outside it) so the copy and markup stay identical.
 */
export function NotFoundBody() {
  return (
    <>
      <p className="t-label-s text-brand-orange">{NOT_FOUND.overline}</p>
      <h1 className="t-page-title mt-1 text-on-surface">{NOT_FOUND.title}</h1>
      <p className="t-body-l mx-auto mt-3 max-w-120 text-on-surface-variant">{NOT_FOUND.body}</p>
      <div className="mt-6 flex flex-col items-center justify-center gap-2.5 md:flex-row">
        <Link href={NOT_FOUND.primary.href} className="btn btn-filled w-full md:w-auto">
          {NOT_FOUND.primary.label}
        </Link>
        <Link href={NOT_FOUND.secondary.href} className="btn btn-tonal w-full md:w-auto">
          {NOT_FOUND.secondary.label}
        </Link>
      </div>
    </>
  );
}
