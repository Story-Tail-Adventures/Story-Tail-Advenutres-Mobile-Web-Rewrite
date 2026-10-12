import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import MuiLink from "@mui/material/Link";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { StatementRowResolve } from "@/components/agent/StatementRowResolve";
import { EmptyState, ErrorState } from "@/components/client/states";
import NextForm from "@/components/mui/NextForm";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { searchTripsForLine } from "@/lib/agent/commission";
import { COMMISSION_COPY, STATEMENT_COPY, statementRowName } from "@/lib/agent/content";
import { AGENT_COMMISSION_VIEWS } from "@/lib/agent/nav";
import { cents } from "@/lib/agent/queries";
import { impliedRate, loadRowToResolve, loadStatement, loadTripPick, statementHref } from "@/lib/agent/statements";
import { loadSuppliers, type SupplierGroup } from "@/lib/agent/tripBuilder";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * 3.7.6's Resolve, for one statement row. The artboard draws a Resolve button and stops; this
 * is where it goes. A page rather than a dialog: four different decisions, one of which needs
 * a trip search, deserve the room and a URL that survives a reload.
 *
 * "Create a new line" needs a trip first. As on 3.7.4, the trip is a GET search that lands on
 * `?trip=`; from there the supplier is guessed from the statement's own wording, the gross
 * comes from the row, and the rate is the supplier's default — or what the row's payment works
 * out to when the supplier has none.
 */

export const metadata = { title: "Resolve statement row" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The supplier the statement names: the one whose name appears in the statement's supplier
 * text (or the other way round), and when several do, the LONGEST — "Royal Caribbean" over a
 * "Royal" that would also match. Two of the same length is no guess at all.
 */
function guessSupplier(groups: SupplierGroup[], text: string | null): string {
  const fold = (v: string) =>
    v.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const t = text ? fold(text) : "";
  if (t.length < 3) return "";
  const hits = groups
    .flatMap((g) => g.suppliers)
    .map((x) => ({ id: x.supplierId, name: fold(x.name) }))
    .filter((x) => x.name.length > 2 && (` ${t} `.includes(` ${x.name} `) || ` ${x.name} `.includes(` ${t} `)))
    .sort((a, b) => b.name.length - a.name.length);
  if (hits.length === 0) return "";
  return hits.length > 1 && hits[0].name.length === hits[1].name.length ? "" : hits[0].id;
}

export default async function ResolveRowPage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string; rowId: string }>;
  searchParams: Promise<{ trip?: string | string[]; q?: string | string[] }>;
}) {
  const { importId, rowId } = await params;
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const views = <AgentViews views={AGENT_COMMISSION_VIEWS} label={COMMISSION_COPY.viewsLabel} />;

  const notFound = (
    <Box sx={PAGE_SX}>
      {views}
      <EmptyState
        icon="search"
        title={STATEMENT_COPY.notFoundTitle}
        body={STATEMENT_COPY.notFoundBody}
        action={{ label: STATEMENT_COPY.backToImport, href: "/agent/commission/import" }}
      />
    </Box>
  );
  if (!UUID.test(importId) || !UUID.test(rowId)) return notFound;

  const [statement, resolved, suppliers] = await Promise.all([
    loadStatement(importId),
    loadRowToResolve(importId, rowId),
    loadSuppliers(),
  ]);
  if ((!statement.ok && statement.reason === "not-found") || (!resolved.ok && resolved.reason === "not-found")) {
    return notFound;
  }
  if (!statement.ok || !resolved.ok || !suppliers) return <ErrorState />;
  const s = statement.statement;
  const { row, candidates } = resolved.view;
  const back = `${statementHref(importId)}#row-${row.rowNumber}`;

  // Nothing to resolve: a statement no longer in review, or a row against a line already
  // paid (it never changes that line). Back to the statement, not a dead form.
  if (s.status !== "review" || row.state === "already_recorded") redirect(statementHref(importId));

  const canDecideMoney = row.state !== "unreadable";
  const tripParam = first(sp.trip);
  const tripId = tripParam && UUID.test(tripParam) ? tripParam : null;
  const search = (first(sp.q) ?? "").trim();
  // The chosen trip is read by id, not found in a page of search results it may not be on.
  const chosen = canDecideMoney && tripId ? await loadTripPick(tripId) : null;
  // A `?trip=` that does not resolve (archived, not this advisor's) falls back to the search.
  const trips = canDecideMoney && !chosen ? await searchTripsForLine(search) : [];
  if (trips === null) return <ErrorState />;

  const supplierId = guessSupplier(suppliers, row.raw.supplier_text);
  const supplier = suppliers.flatMap((g) => g.suppliers).find((x) => x.supplierId === supplierId);
  const received = row.raw.received_cents === null ? 0 : cents(row.raw.received_cents);
  const fee = row.raw.fee_cents === null ? 0 : cents(row.raw.fee_cents);
  const grossCents = row.raw.gross_cents === null ? 0 : cents(row.raw.gross_cents);
  const initialRate = supplier?.defaultCommissionPct != null
    ? String(supplier.defaultCommissionPct)
    : impliedRate(received, fee, grossCents);

  const selfHref = `${statementHref(importId)}/rows/${rowId}`;

  return (
    <Box sx={PAGE_SX}>
      {views}
      <Box component="header" sx={{ mt: 2.5, mb: 2 }}>
        <MuiLink component={NextLink} href={back} underline="hover" variant="body2">
          {STATEMENT_COPY.backToStatement}
        </MuiLink>
        <Typography component="h1" variant="h5" sx={{ m: 0, mt: 1 }}>
          {`${STATEMENT_COPY.resolveTitle} · ${statementRowName(row.rowNumber)}`}
        </Typography>
      </Box>

      {/* The statement line itself, as the table shows it. */}
      <Card sx={{ maxWidth: 720, mb: 1.75 }}>
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Typography component="p" sx={{ fontFamily: "mono", fontWeight: 500, fontSize: 13, overflowWrap: "anywhere" }}>
            {row.statementLine}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.5 }}>
            {[row.amountLabel, row.paidOnLabel].filter(Boolean).join(" · ")}
          </Typography>
          {/* Not repeated when the suggestion card below already says it. */}
          {row.note && row.note !== row.suggestion?.note && (
            <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "warning.main" }}>
              {row.note}
            </Typography>
          )}
        </CardContent>
      </Card>

      <StatementRowResolve
        importId={importId}
        version={s.version}
        rowId={rowId}
        canDecideMoney={canDecideMoney}
        suggestion={row.suggestion}
        candidates={candidates}
        createTrip={chosen ? { tripId: chosen.tripId, title: chosen.title, clientName: chosen.clientName } : null}
        suppliers={suppliers}
        initialSupplierId={supplierId}
        initialGross={row.createGross}
        initialRate={initialRate}
      />

      {/* "Create a new line", step one: which trip. Below the decisions, because most rows
          are settled by the first two. */}
      {canDecideMoney && !chosen && (
        <Card sx={{ maxWidth: 720, mt: 1.75 }}>
          <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
            <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
              {STATEMENT_COPY.createTitle}
            </Typography>
            <Typography component="p" variant="caption" sx={{ display: "block", mb: 1, color: "text.secondary" }}>
              {STATEMENT_COPY.createHint}
            </Typography>
            {tripId && (
              <Typography component="p" variant="body2" sx={{ mb: 1, color: "warning.main" }}>
                {STATEMENT_COPY.tripNotAvailable}
              </Typography>
            )}
            <Box component={NextForm} action={selfHref} sx={{ display: "flex", gap: 1, mb: 1.5 }}>
              <Box component="label" htmlFor="resolve-trip-q" sx={VISUALLY_HIDDEN}>
                {STATEMENT_COPY.createTripSearch}
              </Box>
              <OutlinedInput
                id="resolve-trip-q"
                type="search"
                name="q"
                defaultValue={search}
                placeholder={STATEMENT_COPY.createTripPlaceholder}
                size="small"
                sx={{ flex: 1, minWidth: 0 }}
              />
              <Button type="submit" variant="tonal" size="sm">
                {STATEMENT_COPY.createTripSearch}
              </Button>
            </Box>
            {trips.length === 0 ? (
              <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
                {STATEMENT_COPY.createTripNone}
              </Typography>
            ) : (
              <List disablePadding aria-label={STATEMENT_COPY.createTripLabel}>
                {trips.map((t) => (
                  <ListItem key={t.tripId} disablePadding>
                    <ListItemButton
                      component={NextLink}
                      href={`${selfHref}?trip=${t.tripId}`}
                      sx={{ borderRadius: 1, display: "block" }}
                    >
                      <Typography component="span" variant="body2" sx={{ display: "block", fontWeight: 600 }}>
                        {t.title}
                      </Typography>
                      <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                        {[t.clientName, t.travelLabel, t.statusLabel].filter(Boolean).join(" · ")}
                      </Typography>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}
      {canDecideMoney && chosen && (
        <Box sx={{ maxWidth: 720, mt: 1 }}>
          <MuiLink component={NextLink} href={selfHref} underline="hover" variant="body2">
            {STATEMENT_COPY.createTripChange}
          </MuiLink>
        </Box>
      )}
    </Box>
  );
}

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;
