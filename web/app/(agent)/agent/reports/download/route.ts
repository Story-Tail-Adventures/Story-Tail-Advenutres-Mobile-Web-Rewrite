import { NextResponse, type NextRequest } from "next/server";

import { callAgentFunction } from "@/lib/agent/api";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";
import { readBasis, readPeriod } from "@/lib/agent/reportsView";

/**
 * §3.11's per-report Export: the report on screen, for its period, as a CSV (P1).
 *
 * The shape of §3.7.2's ledger export, on purpose. `agent_report_export` writes the audit row
 * in the same database call that returns the rows, and it runs the very SQL the screen read,
 * so the file is the screen. This handler only checks the request and shapes the response.
 *
 * A GET THAT WRITES AN AUDIT ROW, reached by plain anchors (never next/link, which would
 * prefetch it on hover), refused unless the browser says it came from this origin.
 *
 * `/download`, not `/export`: `/agent/reports/export` is the Export Center's page (§3.11.8).
 */

const REPORTS = ["revenue", "suppliers", "destinations", "clients", "funnel", "pipeline"] as const;
type Report = (typeof REPORTS)[number];

function failed() {
  return new NextResponse(REPORTS_COPY.exportFailed, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function isReport(value: string | null): value is Report {
  return (REPORTS as readonly (string | null)[]).includes(value);
}

/**
 * Only this origin's own pages, or a link the advisor typed or bookmarked ("none"). Stricter
 * than refusing "cross-site": a page on a sibling subdomain is "same-site", and an <img> there
 * could otherwise run an audited export for a signed-in advisor. A browser too old to send the
 * header is let through, as the ledger export does: the export still needs the session.
 */
const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);

export async function GET(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && !ALLOWED_FETCH_SITES.has(site)) {
    return new NextResponse(null, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const report = params.get("report");
  // An unknown report is a broken link, not a default: exporting a DIFFERENT report than the
  // one asked for would be an audited file nobody wanted.
  if (!isReport(report)) {
    return new NextResponse(null, { status: 404 });
  }
  const call = await callAgentFunction("agent-report", {
    op: "export",
    report,
    // Lifetime value is lifetime and the pipeline is today: neither takes a period, and the
    // function refuses one.
    ...(report === "clients" || report === "pipeline" ? {} : { period: readPeriod(params.get("period") ?? undefined) }),
    ...(report === "revenue" ? { basis: readBasis(params.get("basis") ?? undefined) } : {}),
  });

  if (!call.ok) {
    if (call.kind === "unauthenticated") {
      const back = `/agent/reports/${report}`;
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, request.url));
    }
    return failed();
  }

  // No CSV or no file name in a 200 is a function that changed shape, not an empty report (an
  // empty report still has a header row). A failure, not a blank file.
  const { csv, fileName } = call.data as { csv?: unknown; fileName?: unknown };
  if (typeof csv !== "string" || typeof fileName !== "string" || !/^[a-z0-9-]+\.csv$/.test(fileName)) {
    return failed();
  }

  // A byte-order mark first, so Excel reads UTF-8 ("Roatán", not "RoatÃ¡n").
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** HEAD would otherwise run GET: an audited export with the body thrown away. */
export function HEAD() {
  return new NextResponse(null, { status: 405, headers: { allow: "GET" } });
}
