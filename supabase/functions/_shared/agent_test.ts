import { assertEquals, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import { requireAgentId } from "./agent.ts";
import type { AuthContext } from "./auth.ts";

/**
 * `requireAgentId` is one `if`, and it is tested because of what that `if` is guarding
 * against rather than because of what it does.
 *
 * The obvious way to write the agent routes' gate is `requireRole(ctx, "agent")`, which is
 * what the new-edge-function skill's template reaches for. It is equivalent TODAY. It stops
 * being equivalent the moment anyone widens it to `requireRole(ctx, "agent", "admin")`,
 * because `platform_user`'s CHECK has a bare `(role = 'admin')` branch — an admin row may
 * legally carry no agent_id at all, or someone else's. `requireRole` would wave that caller
 * through and `ctx.agentId` would reach a query as `undefined`.
 *
 * The admin cases below are therefore the point of the file. They are not hypothetical: the
 * same hole exists in the database and `current_agent_id()` closes it with the same test,
 * asserted in supabase/tests/rls_agent_reads.sql.
 *
 * Run: deno test --config supabase/functions/deno.json supabase/functions/
 */

function ctx(overrides: Partial<AuthContext>): AuthContext {
  return {
    accountId: "0195a2c0-1a00-7000-8000-000000000010",
    platformUserId: "0195a2c0-1a00-7000-8000-000000000020",
    role: "agent",
    agentId: "0195a2c0-1a00-7000-8000-000000000001",
    clientId: null,
    aal: "aal1",
    secondFactorVerifiedAt: null,
    ip: null,
    userAgent: null,
    ...overrides,
  } as AuthContext;
}

function rejection(call: () => unknown): { status: number; detail: string } {
  const error = assertThrows(call, HttpError) as HttpError;
  return { status: error.status, detail: error.detail ?? "" };
}

Deno.test("an agent gets their agent id back", () => {
  assertEquals(
    requireAgentId(ctx({})),
    "0195a2c0-1a00-7000-8000-000000000001",
  );
});

Deno.test("a client is refused", () => {
  const { status } = rejection(() =>
    requireAgentId(ctx({
      role: "client",
      agentId: null,
      clientId: "0195a2c0-1a00-7000-8000-000000000013",
    }))
  );
  assertEquals(status, 403);
});

Deno.test("a client carrying a stray agent_id is still refused", () => {
  // The role decides, not the column. A client row cannot legally hold an agent_id, but if
  // one ever did, the answer must not change.
  const { status } = rejection(() =>
    requireAgentId(ctx({
      role: "client",
      agentId: "0195a2c0-1a00-7000-8000-000000000001",
      clientId: "0195a2c0-1a00-7000-8000-000000000013",
    }))
  );
  assertEquals(status, 403);
});

Deno.test("an admin with no agent id is refused rather than passed through as undefined", () => {
  const { status } = rejection(() =>
    requireAgentId(ctx({ role: "admin", agentId: null, clientId: null }))
  );
  assertEquals(status, 403);
});

Deno.test("an admin CARRYING an agent id is refused — this is the whole reason the helper exists", () => {
  // platform_user's CHECK permits it. requireRole(ctx, "agent", "admin") would let this
  // caller act as whichever agent the row names.
  const { status } = rejection(() =>
    requireAgentId(ctx({
      role: "admin",
      agentId: "0195a2c0-1a00-7000-8000-000000000001",
      clientId: null,
    }))
  );
  assertEquals(status, 403);
});

Deno.test("the refusal names the side of the platform, not the role check", () => {
  // The traveler side says "This is the traveler's side of the platform." An agent who
  // fat-fingers a URL should get the mirror sentence, not a bare 403.
  const { detail } = rejection(() =>
    requireAgentId(ctx({ role: "client", agentId: null, clientId: "x" }))
  );
  assertEquals(detail, "This is the advisor's side of the platform.");
});
