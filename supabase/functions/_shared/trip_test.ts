/**
 * The refund vocabulary, pinned against the database that actually enforces it.
 *
 * `trip_refund_status_vocabulary` (20261001100000) is the authority: this list existing
 * does not make Postgres accept anything. SQL and TypeScript cannot share one definition,
 * so the two are pinned separately — `constraints_trip_totals.sql` section 5 asserts the
 * CHECK takes exactly these four and refuses a fifth, and this asserts the list the Edge
 * Function validates against is the same four.
 *
 * Drifting apart is a 500 on a write path: a value this list allows and the CHECK does not
 * passes validation, reaches Postgres, and comes back as a constraint violation the agent
 * reads as "something went wrong".
 */
import { assertEquals } from "jsr:@std/assert@^1";
import { isRefundStatus, REFUND_STATUSES } from "./trip.ts";

Deno.test("the refund vocabulary is exactly what the CHECK constrains", () => {
  assertEquals([...REFUND_STATUSES], ["none_expected", "pending", "partial", "full"]);
});

Deno.test("isRefundStatus accepts the four and nothing else", () => {
  for (const v of REFUND_STATUSES) assertEquals(isRefundStatus(v), true);

  // The shapes a caller actually sends by mistake.
  assertEquals(isRefundStatus("refunded"), false);
  assertEquals(isRefundStatus("Partial"), false, "case matters: the CHECK is exact");
  assertEquals(isRefundStatus(""), false);
  assertEquals(isRefundStatus("Refunded $1,640 on Feb 12"), false);
  assertEquals(isRefundStatus(null), false);
  assertEquals(isRefundStatus(undefined), false);
  assertEquals(isRefundStatus(0), false);
});

Deno.test("NULL is not a member, and that is the point", () => {
  // The column allows NULL and the vocabulary does not contain it, deliberately. "Not
  // stated" is an advisor who has not checked; `none_expected` is one who has. Adding null
  // here would let the Edge Function accept it as a value and lose that distinction.
  assertEquals((REFUND_STATUSES as readonly unknown[]).includes(null), false);
  assertEquals((REFUND_STATUSES as readonly string[]).includes("null"), false);
});
