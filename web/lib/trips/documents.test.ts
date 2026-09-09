import { describe, expect, it } from "vitest";

import {
  documentBadge,
  documentGroupFor,
  DOCUMENT_MESSAGES,
  formatFileSize,
  groupDocuments,
  READABLE_DOCUMENT_KINDS,
  UPLOADABLE_DOCUMENT_KINDS,
  uploadedByLabel,
} from "./documents";

describe("formatFileSize", () => {
  // These four are the artboards' own printed numbers against the seed's own byte counts.
  // If this table ever disagrees with `client-trip.jsx`, the design is right and this is
  // wrong — the divisor is binary on purpose, see the docblock.
  it.each([
    [327_680, "320 KB"],
    [634_880, "620 KB"],
    [1_153_434, "1.1 MB"],
    [2_411_724, "2.3 MB"],
  ])("prints the artboard's number for %i bytes", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it("drops the decimal past 10 MB, where a tenth is noise", () => {
    expect(formatFileSize(48 * 1024 * 1024)).toBe("48 MB");
  });

  it("shows bytes below a kilobyte rather than rounding to 0 KB", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("refuses to invent a size for a value it cannot format", () => {
    expect(formatFileSize(Number.NaN)).toBe("—");
    expect(formatFileSize(-1)).toBe("—");
  });
});

describe("documentBadge", () => {
  it("reads the mime type, not the filename", () => {
    // The case the extension check would get wrong: a JPEG named .pdf would paint a
    // burgundy PDF tile over a photograph. `filename` is the one field a client controls.
    expect(documentBadge("image/jpeg")).toBe("IMG");
    expect(documentBadge("application/pdf")).toBe("PDF");
  });
});

describe("documentGroupFor", () => {
  it("files passports and visas in one drawer, as both artboards do", () => {
    expect(documentGroupFor("passport")).toBe("identity");
    expect(documentGroupFor("visa")).toBe("identity");
  });

  it("has a home for every kind a client can actually read", () => {
    // A readable kind landing in `other` would render under "Everything else", which is the
    // catch-all for a kind somebody adds to the read policy without telling this file.
    for (const kind of READABLE_DOCUMENT_KINDS) {
      expect(documentGroupFor(kind)).not.toBe("other");
    }
  });

  it("routes an unknown kind to the catch-all rather than throwing", () => {
    expect(documentGroupFor("receipt")).toBe("other");
    expect(documentGroupFor("something_new")).toBe("other");
  });
});

describe("uploadable kinds", () => {
  it("is a strict subset of what a client may read", () => {
    // The narrower list is the write allowlist in _shared/trip.ts. A kind a client may
    // upload but not read would produce a document they cannot open.
    for (const kind of UPLOADABLE_DOCUMENT_KINDS) {
      expect(READABLE_DOCUMENT_KINDS).toContain(kind);
    }
    expect(UPLOADABLE_DOCUMENT_KINDS.length).toBeLessThan(READABLE_DOCUMENT_KINDS.length);
  });
});

describe("groupDocuments", () => {
  const doc = (kind: string, createdAt: string) => ({ kind, createdAt });

  it("orders groups by the fixed list, not by first appearance", () => {
    // Filed insurance-first, which is the order that would put Insurance at the top if the
    // grouping followed the data. The heading a traveler is looking for should not move.
    const groups = groupDocuments([
      doc("insurance_cert", "2026-03-28"),
      doc("supplier_confirmation", "2026-03-14"),
      doc("photo", "2026-04-02"),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["confirmations", "insurance", "photos"]);
  });

  it("puts the newest document first inside a group", () => {
    const groups = groupDocuments([
      doc("passport", "2026-03-20T10:00:00Z"),
      doc("visa", "2026-05-01T10:00:00Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].documents.map((d) => d.kind)).toEqual(["visa", "passport"]);
  });

  it("drops empty groups rather than rendering a bare heading", () => {
    expect(groupDocuments([doc("photo", "2026-04-02")]).map((g) => g.label)).toEqual([
      DOCUMENT_MESSAGES.groupPhotos,
    ]);
  });

  it("returns nothing for an empty library, so the caller can show the empty state", () => {
    expect(groupDocuments([])).toEqual([]);
  });

  it("does not mutate the array it was given", () => {
    const input = [doc("visa", "2026-01-01"), doc("passport", "2026-06-01")];
    const snapshot = [...input];
    groupDocuments(input);
    expect(input).toEqual(snapshot);
  });
});

describe("uploadedByLabel", () => {
  it("names the traveler and the advisor, never a role word", () => {
    expect(uploadedByLabel(true)).toBe("added by you");
    expect(uploadedByLabel(false)).toBe("added by Gyasi");
  });
});
