import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientRosterTable } from "./ClientRosterTable";
import type { ClientRosterRow } from "@/lib/agent/clients";

/**
 * §3.3.1's two structures, and the bulk-select column that is in exactly one of them.
 *
 * VITEST APPLIES NO CSS, so both layouts are in the DOM at once here — the card list and the
 * table. That is inconvenient for querying and load-bearing for what is being asserted: the
 * checkbox count must come out at one per TABLE row, not one per row per layout, and the
 * only way to get that wrong is to put checkboxes on the cards too.
 *
 * RTL's `render` IS A CLIENT RENDER, so `useSyncExternalStore` hands it the CLIENT snapshot
 * and `SelectAllClients` appears immediately — which is exactly what it does in a browser
 * after hydration, and the opposite of what the server sends. The server render is a
 * different question and gets `renderToStaticMarkup` below, which is the only way to reach
 * the third argument. Asserting the "not yet hydrated" state through `render` is impossible
 * rather than merely awkward, and a test that tried would pass for the wrong reason.
 */

function row(over: Partial<ClientRosterRow> = {}): ClientRosterRow {
  return {
    clientId: "0195a2c0-1a00-7000-8000-000000000101",
    displayName: "Annabelle Reyes",
    initials: "AR",
    email: "annabelle@example.com",
    phone: null,
    tags: ["vip"],
    archived: false,
    lifetimeLabel: "$12,400",
    lifetimeCurrencyCount: 1,
    tripCount: 3,
    lastTripLabel: "Mar 2026",
    nextTripLabel: "Nov 2026",
    nextTripIsNow: false,
    lastContactLabel: "2 days ago",
    ...over,
  };
}

describe("ClientRosterTable bulk-select", () => {
  it("puts one checkbox on each TABLE row and none on the phone cards", () => {
    // Two rows, one layout with checkboxes: four boxes would mean the cards grew them too,
    // which is invalid markup inside the card's <Link> and unreachable by a tap.
    render(<ClientRosterTable rows={[row(), row({ clientId: "b", displayName: "Noor Haddad" })]} />);
    // By name, because the hydrated select-all is a checkbox too and it posts nothing.
    expect(document.querySelectorAll('input[name="clientId"]')).toHaveLength(2);
  });

  it("posts the client id under the name the action reads", () => {
    // `bulkTagClientsAction` does `form.getAll("clientId")`. Rename either side and the
    // selection silently posts as empty — the action then answers "tick at least one
    // client" over a full page of ticks.
    render(<ClientRosterTable rows={[row()]} />);
    const boxes = document.querySelectorAll('input[name="clientId"]');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAttribute("value", "0195a2c0-1a00-7000-8000-000000000101");
  });

  it("names each checkbox after the client it selects", () => {
    // Twenty-five boxes labelled "Select" are twenty-five identical announcements. The name
    // is the only thing distinguishing them.
    render(<ClientRosterTable rows={[row()]} />);
    expect(screen.getByRole("checkbox", { name: /Annabelle Reyes/ })).toBeInTheDocument();
  });

  it("leaves the header cell empty on the SERVER render", () => {
    // SelectAllClients renders null until hydrated, because a select-all cannot work without
    // JavaScript and a checkbox that silently does nothing is worse than none. Only a real
    // server render reaches that branch — see the header.
    const html = renderToStaticMarkup(<ClientRosterTable rows={[row()]} />);
    // One checkbox, and it is the row's. No select-all.
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    expect(html).not.toContain("roster-select-all");
    // The cell itself IS there, holding the column width so nothing shifts on hydration.
    expect(html).toContain('<th scope="col" class="w-10');
  });

  it("offers the select-all once hydrated", () => {
    render(<ClientRosterTable rows={[row()]} />);
    expect(screen.getByRole("checkbox", { name: "Select every client on this page" }))
      .toBeInTheDocument();
  });

  it("still links every row into the client", () => {
    // The checkbox must not have displaced the link. Both layouts draw one, so two.
    render(<ClientRosterTable rows={[row()]} />);
    const links = screen.getAllByRole("link", { name: /Annabelle Reyes/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/agent/clients/0195a2c0-1a00-7000-8000-000000000101");
    }
  });
});
