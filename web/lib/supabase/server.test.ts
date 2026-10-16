import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §3.9.6 (2026-10-16). Web sign-ins run on the server, so the browser's user agent and first
 * forwarded address must ride along to GoTrue, or every web sign-in records the server.
 */

const mocks = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  createServerClient: vi.fn(() => ({})),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
  headers: async () => ({ get: (k: string) => mocks.headers.get(k) ?? null }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/env", () => ({ env: { supabaseUrl: "http://127.0.0.1:54321", supabaseAnonKey: "anon" } }));

import { createClient } from "./server";

function sentHeaders(): Record<string, string> {
  const call = mocks.createServerClient.mock.calls.at(-1) as unknown as [string, string, { global: { headers: Record<string, string> } }];
  return call[2].global.headers;
}

beforeEach(() => {
  mocks.headers.clear();
  mocks.createServerClient.mockClear();
});

describe("createClient", () => {
  it("forwards the browser's user agent and only the first forwarded hop", async () => {
    mocks.headers.set("user-agent", "Mozilla/5.0 (iPhone)");
    mocks.headers.set("x-forwarded-for", "203.0.113.9, 10.0.0.1");
    await createClient();
    expect(sentHeaders()).toEqual({ "user-agent": "Mozilla/5.0 (iPhone)", "x-forwarded-for": "203.0.113.9" });
  });

  it("adds nothing when the request has neither", async () => {
    await createClient();
    expect(sentHeaders()).toEqual({});
  });
});
