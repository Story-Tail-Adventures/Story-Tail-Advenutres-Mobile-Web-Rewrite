// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The traveler's read-clearing: one RPC on their own session, true only when a count moved. */

const SEEN = "2026-10-13T14:02:11.123456+00:00";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/trips/api", () => ({ callTripFunction: vi.fn() }));

import { markConversationRead } from "./actions";

beforeEach(() => vi.clearAllMocks());

describe("markConversationRead", () => {
  it("reads up to the newest message shown, as text, and refreshes the inbox when it cleared something", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(markConversationRead("c1", SEEN)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("client_mark_conversation_read", { p_conversation_id: "c1", p_seen_up_to: SEEN });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/messages", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/trips/[tripId]/messages", "page");
  });

  it("answers false, and refreshes nothing, when nothing moved or the call failed", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(markConversationRead("c1", SEEN)).resolves.toBe(false);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(markConversationRead("c1", SEEN)).resolves.toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
