import { describe, expect, it } from "vitest";
import { AuthApiError, AuthError } from "@supabase/supabase-js";
import { authErrorByKind, mapAuthError } from "./auth-errors";

/**
 * GoTrue error codes → Story-Tail's error taxonomy.
 *
 * The sign-up codes matter for account enumeration: `user_already_exists` must map to a
 * kind the gate can collapse into the success path, and `email_address_invalid` must
 * land on the email field rather than the generic "credentials don't match" fallback.
 */
describe("mapAuthError — sign-in codes", () => {
  it("collapses wrong password and unknown account into one kind", () => {
    expect(mapAuthError(new AuthApiError("nope", 400, "invalid_credentials")).kind).toBe(
      "invalid_credentials",
    );
    expect(mapAuthError(new AuthApiError("nope", 400, "invalid_grant")).kind).toBe(
      "invalid_credentials",
    );
  });

  it("maps the rest of the shared kinds", () => {
    expect(mapAuthError(new AuthApiError("x", 400, "email_not_confirmed")).kind).toBe(
      "email_not_confirmed",
    );
    expect(mapAuthError(new AuthApiError("x", 403, "user_banned")).kind).toBe("account_locked");
    expect(mapAuthError(new AuthApiError("x", 422, "weak_password")).kind).toBe("weak_password");
  });
});

describe("mapAuthError — sign-up codes (Screen 2.0.6)", () => {
  it("maps both spellings of 'that email already has an account' to email_taken", () => {
    expect(mapAuthError(new AuthApiError("x", 422, "user_already_exists"))).toBe(
      authErrorByKind.email_taken,
    );
    expect(mapAuthError(new AuthApiError("x", 422, "email_exists"))).toBe(
      authErrorByKind.email_taken,
    );
  });

  it("does not let a 400 email_address_invalid fall through to invalid_credentials", () => {
    expect(mapAuthError(new AuthApiError("x", 400, "email_address_invalid"))).toBe(
      authErrorByKind.email_invalid,
    );
  });

  it("treats disabled sign-ups like an unconfigured auth server", () => {
    expect(mapAuthError(new AuthApiError("x", 422, "signup_disabled"))).toBe(
      authErrorByKind.not_configured,
    );
  });

  it("keeps the email_taken wording indistinguishable from a fresh sign-up", () => {
    // If this ever says "already", "exists" or "taken", it has become an oracle.
    expect(authErrorByKind.email_taken.message).not.toMatch(/already|exist|taken|registered/i);
  });
});

describe("mapAuthError — status fallbacks", () => {
  it("maps 429 and the two rate-limit codes to rate_limited", () => {
    expect(mapAuthError(new AuthApiError("x", 429, undefined)).kind).toBe("rate_limited");
    expect(mapAuthError(new AuthApiError("x", 429, "over_request_rate_limit")).kind).toBe(
      "rate_limited",
    );
    expect(mapAuthError(new AuthApiError("x", 429, "over_email_send_rate_limit")).kind).toBe(
      "rate_limited",
    );
  });

  it("maps a request that never reached the server to network", () => {
    const offline = new AuthError("fetch failed", 0);
    offline.name = "AuthRetryableFetchError";
    expect(mapAuthError(offline).kind).toBe("network");
  });

  it("falls back to unknown for anything unrecognised", () => {
    expect(mapAuthError(new AuthApiError("x", 500, "unexpected_failure")).kind).toBe("unknown");
  });
});
