import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ICON_NAMES } from "@/components/ui/icon-paths";
import {
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
    expect(AGENT_DESTINATIONS.filter((d) => !isBuilt(d)).map((d) => d.id)).toEqual([
      "clients",
      "trips",
      "leads",
      "messages",
      "commission",
      "reports",
      "more",
    ]);
    expect(AGENT_DESTINATIONS.filter(isBuilt).map((d) => d.id)).toEqual(["worklist"]);
  });

  it("gives every planned destination a phase and a section", () => {
    for (const d of AGENT_DESTINATIONS) {
      if (d.availability.kind !== "planned") continue;
      expect(d.availability.section, d.id).toMatch(/^§3\./);
      expect(["P1", "P2", "P3"]).toContain(d.availability.phase);
    }
  });

  it("has exactly one deferred destination, and it explains itself", () => {
    // `deferred` must not become a dumping ground for "not yet" — that is what `planned` is
    // for. Leads is the only thing a decision was taken against (BRD §6.5), and its reason
    // is the content rather than a section number.
    const deferred = AGENT_DESTINATIONS.filter((d) => d.availability.kind === "deferred");
    expect(deferred.map((d) => d.id)).toEqual(["leads"]);
    const reason = deferred[0].availability.kind === "deferred" ? deferred[0].availability.reason : "";
    expect(reason).toMatch(/Inquiry/);
    expect(reason.length).toBeGreaterThan(40);
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

  it("matches on / boundaries only", () => {
    expect(activeAgentDestinationId("/agent/clients")).toBe("clients");
    expect(activeAgentDestinationId("/agent/clients/abc")).toBe("clients");
    // Not `clients`: a longest-prefix match without a boundary check would say otherwise.
    expect(activeAgentDestinationId("/agent/clients-archive")).toBe("worklist");
    expect(activeAgentDestinationId("/dashboard")).toBeNull();
  });
});

describe("the tablet breakpoint trap", () => {
  it("never pairs md: with an unqualified max-web: in AgentNav", () => {
    // `web:` is px-based and `md:` is rem-based, so Tailwind emits `web:` FIRST — an
    // unqualified `max-web:` therefore applies at phone width too. Four places in web/ have
    // lost a `web:` value this way. The agent rail sidesteps it by not needing a
    // tablet-only strip at all; this asserts it stays that way.
    // Asserted against the SOURCE: it is a class-string mistake no amount of rendering in
    // jsdom would catch. Comments are stripped first so the explanation above cannot trip it.
    const code = readFileSync(join(__dirname, "../../components/agent/AgentNav.tsx"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    expect(code.match(/(?<!md:)max-web:/g)).toBeNull();
  });
});
