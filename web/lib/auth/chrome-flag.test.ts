import { afterEach, describe, expect, it } from "vitest";

import {
  AUTH_FLAG_ATTR,
  AUTH_FLAG_COOKIE,
  AUTH_FLAG_PATTERN,
  authFlagAction,
  authFlagScript,
  hasAuthFlag,
} from "./chrome-flag";

/**
 * The proxy's write decision. Pure, so it pins the "no redundant Set-Cookie" rule without a
 * Supabase client — same reasoning as authRedirectFor's tests in lib/supabase/middleware.test.ts.
 */
describe("authFlagAction", () => {
  it("sets the flag for a signed-in request that has none", () => {
    expect(authFlagAction(undefined, true)).toBe("set");
  });

  it("leaves an already-correct flag alone", () => {
    expect(authFlagAction("1", true)).toBeNull();
  });

  it("rewrites a flag whose value is not ours", () => {
    expect(authFlagAction("0", true)).toBe("set");
    expect(authFlagAction("", true)).toBe("set");
  });

  it("clears the flag when the request is signed out", () => {
    expect(authFlagAction("1", false)).toBe("clear");
  });

  it("writes nothing for a signed-out request that has no flag", () => {
    expect(authFlagAction(undefined, false)).toBeNull();
  });
});

/**
 * The browser read. The inline script builds its RegExp from the same AUTH_FLAG_PATTERN, so
 * these cases cover both.
 */
describe("hasAuthFlag", () => {
  afterEach(() => {
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=; max-age=0; path=/`;
    }
  });

  it("is false with no cookies at all", () => {
    expect(hasAuthFlag()).toBe(false);
  });

  it("finds the flag as the only cookie", () => {
    document.cookie = `${AUTH_FLAG_COOKIE}=1; path=/`;
    expect(hasAuthFlag()).toBe(true);
  });

  it("finds the flag after another cookie", () => {
    document.cookie = "sta-theme=dark; path=/";
    document.cookie = `${AUTH_FLAG_COOKIE}=1; path=/`;
    expect(hasAuthFlag()).toBe(true);
  });

  it("ignores unrelated cookies", () => {
    document.cookie = "sb-127-auth-token=eyJhbGci; path=/";
    expect(hasAuthFlag()).toBe(false);
  });

  // The right-hand anchor: a value of "10" must not read as "1".
  it("does not match a longer value", () => {
    expect(new RegExp(AUTH_FLAG_PATTERN).test(`${AUTH_FLAG_COOKIE}=10`)).toBe(false);
  });

  // The left-hand anchor: a cookie whose name merely ends in ours must not match.
  it("does not match a longer cookie name", () => {
    expect(new RegExp(AUTH_FLAG_PATTERN).test(`not-${AUTH_FLAG_COOKIE}=1`)).toBe(false);
  });

  it("matches mid-string as well as at the end", () => {
    expect(new RegExp(AUTH_FLAG_PATTERN).test(`a=b; ${AUTH_FLAG_COOKIE}=1; c=d`)).toBe(true);
  });
});

describe("authFlagScript", () => {
  it("only ever adds the attribute, so the signed-out default is the absence of it", () => {
    const script = authFlagScript();
    expect(script).toContain(`setAttribute(${JSON.stringify(AUTH_FLAG_ATTR)}`);
    expect(script).not.toContain("removeAttribute");
  });

  // The whole point of the module: one pattern, two readers.
  it("carries the same cookie pattern hasAuthFlag uses", () => {
    expect(authFlagScript()).toContain(JSON.stringify(AUTH_FLAG_PATTERN));
  });

  it("reads no environment variables — a prerendered route may not", () => {
    expect(authFlagScript()).not.toMatch(/process\.env|SUPABASE/);
  });

  it("survives blocked cookies", () => {
    expect(authFlagScript()).toContain("catch");
  });
});
