import Link from "next/link";
import { inquiryHref } from "@/lib/public/inquiry";
import { RESULTS } from "./content";

/** Empty state for 2.0.4 (fidelity spec §5.7). Never a dead end: clear, or message Gyasi. */
export function EmptyResults() {
  return (
    <div className="card p-8 text-center">
      <h2 className="t-title-l text-on-surface">{RESULTS.empty.title}</h2>
      <p className="t-body mx-auto mt-1.5 max-w-105 text-on-surface-variant">{RESULTS.empty.body}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link href="/explore/results" className="btn btn-tonal">
          {RESULTS.empty.clear}
        </Link>
        <a href={inquiryHref({ source: "results" })} className="btn btn-text">
          {RESULTS.empty.message}
        </a>
      </div>
    </div>
  );
}
