import { NextResponse, type NextRequest } from "next/server";

import { callAgentFunction } from "@/lib/agent/api";
import { ledgerQueryFromParams } from "@/lib/agent/commissionFilters";
import { COMMISSION_COPY } from "@/lib/agent/content";

/**
 * §3.7.2's Export — the ledger as a CSV, filtered exactly as the screen was.
 *
 * DEFERRED FROM STAGE 1 UNTIL IT COULD BE AUDITED. A ledger download carries every client's
 * name, and Data-Model §18.3 audits "any bulk client list export". `agent_export_commission`
 * writes that audit row in the same database call that returns the rows, so no file leaves
 * without its record. This handler only shapes the response.
 *
 * A GET THAT WRITES AN AUDIT ROW is deliberate, and it is why the buttons that point here are
 * plain anchors rather than next/link: a prefetch on hover would be an export nobody asked
 * for. GET route handlers are uncached by default in Next 16.
 *
 * No auth check of its own: the Edge Function resolves the caller and refuses anyone who is
 * not an active advisor, and `callAgentFunction` sends the caller's own token, never a
 * service key (web/ has none).
 */
export async function GET(request: NextRequest) {
  // A GET that writes an audit row must not be triggerable from another site: SameSite=Lax
  // cookies ride along on a cross-site top-level navigation, so a link elsewhere could make
  // a signed-in advisor's browser "export". Browsers say where a request came from.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return new NextResponse(null, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const query = ledgerQueryFromParams({
    status: params.getAll("status"),
    supplier: params.get("supplier") ?? undefined,
    trip: params.get("trip") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const call = await callAgentFunction("agent-commission", {
    op: "export",
    filters: {
      statuses: query.statuses,
      supplierId: query.supplierId,
      tripId: query.tripId,
      travelFrom: query.travelFrom,
      travelTo: query.travelTo,
    },
  });

  if (!call.ok) {
    if (call.kind === "unauthenticated") {
      return NextResponse.redirect(new URL("/login?next=%2Fagent%2Fcommission%2Fledger", request.url));
    }
    return new NextResponse(COMMISSION_COPY.exportFailed, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // No CSV in a 200 is a function that changed shape, not an empty ledger (an empty ledger
  // still has a header row). It is a failure, not a blank file.
  if (typeof call.data.csv !== "string") {
    return new NextResponse(COMMISSION_COPY.exportFailed, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const csv = call.data.csv;
  // The date in the file name is just a label for the advisor's downloads folder.
  const stamp = new Date().toISOString().slice(0, 10);

  // A byte-order mark first: without it Excel reads UTF-8 as Windows-1252 and "Roatán"
  // arrives as "RoatÃ¡n". Sheets and Numbers ignore it.
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="commission-ledger-${stamp}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * HEAD would otherwise be answered by running GET — an audited export with the body thrown
 * away. Nothing needs to HEAD this.
 */
export function HEAD() {
  return new NextResponse(null, { status: 405, headers: { allow: "GET" } });
}
