import { describe, expect, it } from "vitest";

import { ICON_NAMES } from "@/components/ui/icon-paths";
import {
  AGENT_COMMISSION_VIEWS,
  AGENT_DESTINATIONS,
  AGENT_WORKLIST_VIEWS,
  activeAgentDestinationId,
  activeAgentViewId,
  agentDestinationsFor,
  isBuilt,
} from "./nav";

/**
 * The agent nav registry.
 *
 * MODELLED ON lib/client/nav.test.ts BUT NOT COPIED. Its "nothing Phase-1 is left unbuilt"
 * assertion would fail here on day one — Clients, Trips, Messages and Commission are all P1
 * and all unbuilt — so the equivalent is an explicit snapshot of what is unbuilt. That keeps
 * the same property the client test has: it fails when anything is added OR built, so each
 * §3.x section landing forces a deliberate edit here rather than passing silently.
 */

describe("AGENT_DESTINATIONS", () => {
  it("is the prototype's seven on the rail, in its order", () => {
    // design/source-prototype/shared/screen-frame.jsx:91-99. Gyasi took this over §6.4's
    // eleven on 2026-09-19, provisionally — revisited at §3.3.
    expect(agentDestinationsFor("rail").map((d) => d.label)).toEqual([
      "Worklist",
      "Clients",
      "Trips",
      "Leads",
      "Messages",
      "Commission",
      "Reports",
    ]);
  });

  it("is §6.6's four on the mobile bar", () => {
    expect(agentDestinationsFor("bar").map((d) => d.label)).toEqual([
      "Worklist",
      "Clients",
      "Messages",
      "More",
    ]);
  });

  it("knows exactly which destinations are unbuilt today", () => {
    // The snapshot that replaces the client test's phase assertion. Editing it is the point:
    // when §3.3 ships, this line changes in the same commit.
    expect(AGENT_DESTINATIONS.filter((d) => !isBuilt(d)).map((d) => d.id)).toEqual(["more"]);
    // `clients` joined `worklist` when §3.3.1 shipped on 2026-09-26, and `trips` joined both
    // on 2026-09-27 with §3.4.1. The note this line used to carry was the reason it was
    // unbuilt: trip DETAIL existed at /agent/trips/[tripId] while the rail entry pointed at
    // the LIST, which had no route. It does now.
    // `commission` joined on 2026-10-11 with §3.7.1 and §3.7.2, and `messages` on 2026-10-13
    // with §3.10 Stage 1 (the inbox and thread). The phone app's own Messages tab is still
    // unbuilt (Stage 3); that is the Kotlin bar, not this one.
    expect(AGENT_DESTINATIONS.filter(isBuilt).map((d) => d.id)).toEqual([
      "worklist",
      "clients",
      "trips",
      "leads",
      "messages",
      "commission",
      "reports",
    ]);
    // `reports` joined on 2026-10-21 with §3.11's PR 1: the hub and its first three reports.
    // `leads` joined the same day with §3.8's web PR. It had been the one `deferred`
    // destination since 2026-09-09; §3.8 was revived (BRD §6.5) and the state went with it.
  });

  it("gives every planned destination a phase and a section", () => {
    for (const d of AGENT_DESTINATIONS) {
      if (d.availability.kind !== "planned") continue;
      expect(d.availability.section, d.id).toMatch(/^§3\./);
      expect(["P1", "P2", "P3"]).toContain(d.availability.phase);
    }
  });

  it("has only two availability states now that Leads is built", () => {
    // `deferred` existed for Leads alone and went with it on 2026-10-21 (§3.8 revived, BRD
    // §6.5). Nothing may quietly reintroduce a destination drawn but deliberately unbuilt.
    for (const d of AGENT_DESTINATIONS) expect(["built", "planned"], d.id).toContain(d.availability.kind);
    expect(AGENT_DESTINATIONS.find((d) => d.id === "leads")?.href).toBe("/agent/leads");
  });

  it("uses only icons the web set actually has", () => {
    for (const d of AGENT_DESTINATIONS) {
      expect(ICON_NAMES, `${d.id} wants ${d.icon}`).toContain(d.icon);
    }
  });

  it("has unique ids and hrefs", () => {
    expect(new Set(AGENT_DESTINATIONS.map((d) => d.id)).size).toBe(AGENT_DESTINATIONS.length);
    expect(new Set(AGENT_DESTINATIONS.map((d) => d.href)).size).toBe(AGENT_DESTINATIONS.length);
  });

  it("keeps every destination under /agent", () => {
    // A route that escaped this prefix would escape PROTECTED_PREFIXES with it, and serve
    // the book to anybody.
    for (const d of AGENT_DESTINATIONS) expect(d.href.startsWith("/agent")).toBe(true);
  });
});

describe("active state", () => {
  it("folds all three §3.2 views into the Worklist rail item", () => {
    for (const v of AGENT_WORKLIST_VIEWS) {
      expect(activeAgentDestinationId(v.href), v.href).toBe("worklist");
    }
  });

  it("names which of the three views is showing", () => {
    expect(activeAgentViewId("/agent")).toBe("worklist");
    expect(activeAgentViewId("/agent/pipeline")).toBe("pipeline");
    expect(activeAgentViewId("/agent/calendar")).toBe("calendar");
    expect(activeAgentViewId("/agent/clients")).toBeNull();
  });

  it("folds both §3.7 views into the Commission rail item, and names which is showing", () => {
    for (const v of AGENT_COMMISSION_VIEWS) {
      expect(activeAgentDestinationId(v.href), v.href).toBe("commission");
    }
    expect(activeAgentViewId("/agent/commission", AGENT_COMMISSION_VIEWS)).toBe("dashboard");
    expect(activeAgentViewId("/agent/commission/ledger", AGENT_COMMISSION_VIEWS)).toBe("ledger");
    // A line's page and the add page are the LEDGER view; the dashboard is exact-only.
    expect(activeAgentViewId("/agent/commission/ledger/abc", AGENT_COMMISSION_VIEWS)).toBe("ledger");
    expect(activeAgentViewId("/agent/commission/ledger/new", AGENT_COMMISSION_VIEWS)).toBe("ledger");
    // §3.7.5 / §3.7.6: a statement and its rows light Statements, not the ledger.
    expect(activeAgentViewId("/agent/commission/import", AGENT_COMMISSION_VIEWS)).toBe("statements");
    expect(activeAgentViewId("/agent/commission/import/abc", AGENT_COMMISSION_VIEWS)).toBe("statements");
    expect(activeAgentViewId("/agent/commission/import/abc/rows/def", AGENT_COMMISSION_VIEWS)).toBe("statements");
    expect(activeAgentViewId("/agent/commission/forecast", AGENT_COMMISSION_VIEWS)).toBe("forecast");
    // The default list is still §3.2's: a commission path lights none of its three, and the
    // root view never lights by prefix (or every /agent page would be "Worklist").
    expect(activeAgentViewId("/agent/commission/ledger")).toBeNull();
    expect(activeAgentViewId("/agent/clients/abc")).toBeNull();
  });

  it("matches on / boundaries only", () => {
    expect(activeAgentDestinationId("/agent/clients")).toBe("clients");
    expect(activeAgentDestinationId("/agent/clients/abc")).toBe("clients");
    // Not `clients`: a longest-prefix match without a boundary check would say otherwise.
    expect(activeAgentDestinationId("/agent/clients-archive")).toBe("worklist");
    expect(activeAgentDestinationId("/dashboard")).toBeNull();
  });
});
