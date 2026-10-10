import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicSailing } from "@/lib/public/cruises";
import { renderWithTheme } from "@/test/render";
import { CruiseCard } from "./CruiseCard";

const sailing = (ports: string[]): PublicSailing => ({
  id: "01a12635-0000-7000-8000-000000000001",
  title: "7 Night Western Caribbean",
  line: "Royal Caribbean",
  ship: "Allure of the Seas",
  departureDate: "2027-01-10",
  nights: 7,
  destinations: ["Caribbean"],
  ports,
  shipImage: null,
});

describe("CruiseCard ports of call", () => {
  afterEach(() => vi.restoreAllMocks());

  // A round trip starts and ends at the same port. Keyed by name alone, React logs
  // "Encountered two children with the same key" and may drop or duplicate a chip.
  it("renders a round trip's repeated port as two chips, without a duplicate-key error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithTheme(
      <CruiseCard sailing={sailing(["Miami, Florida", "Nassau, Bahamas", "Perfect Day CocoCay", "Miami, Florida"])} />,
    );

    expect(screen.getAllByText("Miami, Florida")).toHaveLength(2);
    expect(error.mock.calls.some((args) => args.some((a) => String(a).includes("same key")))).toBe(false);
  });
});
