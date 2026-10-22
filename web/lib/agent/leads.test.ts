import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import type { AgentLeadListRow } from "./api";
import { LEAD_COPY, matchesFilter, pageLabel, replyHref, toListItem } from "./leads";
import { waitingLabel } from "./queries";
import { leadSourcesReport } from "./reportsView";

/**
 * §3.8's view models (revived 2026-10-21, BRD §6.5). Pinned: the Reply link cannot be turned
 * into a mail header by a name, "Open" means New and Contacted, the wait label counts calendar
 * days in the advisor's zone and never goes negative, an "Already a client" row says so, and
 * the Lead Sources bars are shares of the largest source.
 */

const row = (over: Partial<AgentLeadListRow> = {}): AgentLeadListRow => ({
  id: "0195a2c0-1a00-7000-8000-0000000000aa",
  first_name: "Dana",
  last_name: "Reyes",
  email: "dana@example.com",
  source: "website",
  status: "new",
  already_client: false,
  client_id: null,
  message_count: 2,
  latest_preview: "June works.",
  first_message_at: "2026-10-19T15:00:00Z",
  last_message_at: "2026-10-21T15:00:00Z",
  first_contacted_at: null,
  converted_at: null,
  closed_at: null,
  ...over,
});

describe("replyHref", () => {
  it("opens the advisor's own email app, addressed to the lead", () => {
    const href = replyHref({ email: "dana@example.com", first_name: "Dana" });
    expect(href.startsWith("mailto:dana@example.com?subject=")).toBe(true);
    const url = new URL(href);
    expect(url.searchParams.get("subject")).toBe("Your note to Story-Tail Adventures");
    expect(url.searchParams.get("body")).toBe("Hi Dana,\n\n");
  });

  it("never lets a name or an address start a new mail header", () => {
    const href = replyHref({ email: "dana@example.com\r\nBcc: x@y.com", first_name: "Dana\r\nBcc: x@y.com" });
    expect(href).not.toMatch(/[\r\n]/);
    expect(href.split("?")[0]).not.toContain("Bcc:");
  });
});

describe("filters and labels", () => {
  it("Open is New and Contacted", () => {
    expect(matchesFilter("new", "open")).toBe(true);
    expect(matchesFilter("contacted", "open")).toBe(true);
    expect(matchesFilter("closed", "open")).toBe(false);
    expect(matchesFilter("converted", "converted")).toBe(true);
    expect(matchesFilter("closed", "all")).toBe(true);
  });

  it("names the page a note came from, and nothing for an unknown one", () => {
    expect(pageLabel("detail")).toBe("trip page");
    expect(pageLabel("app")).toBe("Android app");
    expect(pageLabel("evil")).toBeNull();
    expect(pageLabel(null)).toBeNull();
  });

  it("an 'Already a client' row says so, and only a New lead says how long it waited", () => {
    const item = toListItem(row(), "2026-10-21", "America/Chicago");
    expect(item.name).toBe("Dana Reyes");
    expect(item.statusLabel).toBe("New");
    expect(item.waitLabel).toBe("Waiting 2 days");
    expect(item.dateLabel).toBe("Oct 21");
    const already = toListItem(row({ status: "converted", already_client: true }), "2026-10-21", "America/Chicago");
    expect(already.statusLabel).toBe(LEAD_COPY.alreadyClient);
    expect(already.waitLabel).toBeNull();
  });
});

describe("waitingLabel", () => {
  it("counts calendar days in the advisor's zone", () => {
    // 03:00Z on the 21st is still the 20th in Chicago.
    expect(waitingLabel("2026-10-21", "2026-10-21T03:00:00Z", "America/Chicago")).toBe("Waiting 1 day");
    expect(waitingLabel("2026-10-21", "2026-10-21T15:00:00Z", "America/Chicago")).toBe("Arrived today");
    expect(waitingLabel("2026-10-21", "2026-10-16T15:00:00Z", "America/Chicago")).toBe("Waiting 5 days");
  });

  it("never goes negative, and is null with nothing to count from", () => {
    expect(waitingLabel("2026-10-21", "2026-10-25T15:00:00Z", "America/Chicago")).toBe("Arrived today");
    expect(waitingLabel("2026-10-21", null, "America/Chicago")).toBeNull();
  });
});

describe("leadSourcesReport", () => {
  it("totals the sources and draws each bar as a share of the largest", () => {
    const r = leadSourcesReport(
      [
        { source: "website", lead_count: 4, converted_count: 1, open_count: 2, closed_count: 1 },
        { source: "referral", lead_count: 2, converted_count: 2, open_count: 0, closed_count: 0 },
        { source: "phone", lead_count: 0, converted_count: 0, open_count: 0, closed_count: 0 },
      ],
      [{ utm_source: "instagram", lead_count: 3, converted_count: 1 }],
    );
    expect(r.total).toBe(6);
    expect(r.clients).toBe(3);
    expect(r.empty).toBe(false);
    expect(r.lines[0]).toMatchObject({ label: "Website form", clientsPct: 25, openPct: 50, closedPct: 25 });
    expect(r.lines[1]).toMatchObject({ label: "Referral", clientsPct: 50 });
    expect(r.campaigns).toEqual([{ name: "instagram", leads: 3, clients: 1 }]);
  });

  it("is empty with no leads", () => {
    expect(leadSourcesReport([], []).empty).toBe(true);
  });
});
