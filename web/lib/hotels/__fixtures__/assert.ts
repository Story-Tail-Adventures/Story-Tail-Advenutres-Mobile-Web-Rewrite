/**
 * A narrowing `assert`, because `expect(...).toBeTruthy()` is not one.
 *
 * The Deno tests these ports came from used `assert` from `jsr:@std/assert`, whose signature
 * is `asserts value` — so after `assert(boardwalk, "…")` the compiler knows `boardwalk` is
 * no longer `undefined` and the next line may read `boardwalk.rate`. Vitest's `expect` has
 * no such signature and cannot have one: it takes the value as an ordinary argument and
 * returns a matcher object, so the narrowing never reaches the caller's scope. Swapping
 * `assert(x)` for `expect(x).toBeTruthy()` therefore turns a passing typecheck into
 * "'boardwalk' is possibly 'undefined'" on the following line.
 *
 * The alternatives were `node:assert/strict` — correct, but it pulls a Node built-in into
 * files that otherwise run anywhere, and its failure output is not Vitest's — or sprinkling
 * `!` at each use, which silences the compiler instead of proving the thing. Six lines here
 * keeps the ported assertions reading exactly as they did upstream.
 */
export function assert(value: unknown, message?: string): asserts value {
  if (!value) throw new Error(message ?? "Assertion failed: value is not truthy");
}
