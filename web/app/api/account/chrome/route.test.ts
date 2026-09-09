import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "./route";

type ClientRow = {
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
};

function session(user: { id: string } | null, row: ClientRow | null = null) {
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({
      select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
    }),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/account/chrome", () => {
  it("reports signed out without touching Supabase when it is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const body = await (await GET()).json();

    expect(body).toEqual({ signedIn: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reports signed out when there is no user", async () => {
    session(null);
    expect(await (await GET()).json()).toEqual({ signedIn: false });
  });

  it("returns initials from the name columns", async () => {
    session({ id: "u1" }, { first_name: "Jordan", last_name: "Hale", preferred_name: null });
    expect(await (await GET()).json()).toEqual({ signedIn: true, initials: "JH" });
  });

  // The reason this endpoint exists rather than reading the JWT: preferred_name is not in the
  // token, and it is what the dashboard avatar uses.
  it("prefers preferred_name, matching the dashboard", async () => {
    session({ id: "u1" }, { first_name: "Margaret", last_name: "Shaw", preferred_name: "Peggy" });
    expect(await (await GET()).json()).toEqual({ signedIn: true, initials: "PS" });
  });

  it("returns empty initials for a provisioning placeholder, leaving the fallback to the caller", async () => {
    session({ id: "u1" }, { first_name: "New", last_name: "Traveler", preferred_name: null });
    expect(await (await GET()).json()).toEqual({ signedIn: true, initials: "" });
  });

  // An agent has no client row at all.
  it("returns empty initials when there is no client row", async () => {
    session({ id: "u1" }, null);
    expect(await (await GET()).json()).toEqual({ signedIn: true, initials: "" });
  });

  // It is chrome. A public page has no business holding more than it draws.
  it("leaks no name, surname or email into the response", async () => {
    session({ id: "u1" }, { first_name: "Margaret", last_name: "Shaw", preferred_name: "Peggy" });

    const raw = await (await GET()).text();

    for (const secret of ["Margaret", "Shaw", "Peggy", "first_name", "last_name", "preferred_name", "u1"]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("is cached per browser only, and briefly", async () => {
    session({ id: "u1" }, { first_name: "Jordan", last_name: "Hale" });
    expect((await GET()).headers.get("Cache-Control")).toBe("private, max-age=60");
  });
});
