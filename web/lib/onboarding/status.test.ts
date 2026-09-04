import { describe, expect, it } from "vitest";
import {
  ONBOARDING_ROUTE,
  WELCOME_ROUTE,
  onboardingRedirectFor,
  type OnboardingStatus,
} from "./status";

/**
 * Where an unfinished wizard sends somebody.
 *
 * Kept pure for the same reason `authRedirectFor` was split out of `updateSession`: this is
 * the rule that decides whether a traveler reaches their own dashboard, and it should be
 * assertable without a Supabase client.
 */

function status(over: Partial<OnboardingStatus> = {}): OnboardingStatus {
  return { isClient: true, completedAt: null, step: null, ...over };
}

describe("onboardingRedirectFor", () => {
  it("sends a client who has never started to the welcome screen", () => {
    expect(onboardingRedirectFor(status())).toBe(WELCOME_ROUTE);
  });

  it.each(Object.entries(ONBOARDING_ROUTE))(
    "resumes step %s at %s",
    (step, route) => {
      expect(onboardingRedirectFor(status({ step }))).toBe(route);
    },
  );

  it("lets a finished wizard through", () => {
    expect(onboardingRedirectFor(status({ completedAt: "2026-09-03T00:00:00Z" }))).toBeNull();
  });

  it("lets a finished wizard through even if a step slug somehow survived", () => {
    // The database forbids this combination, but the gate must not depend on that: being
    // held in a wizard you already finished is the worst failure this function has.
    expect(
      onboardingRedirectFor(status({ completedAt: "2026-09-03T00:00:00Z", step: "profile" })),
    ).toBeNull();
  });

  it("never routes an agent into the client wizard", () => {
    expect(onboardingRedirectFor(status({ isClient: false }))).toBeNull();
  });

  it("falls open when the status could not be read", () => {
    // `onboardingStatus` returns null when the read fails or Supabase is unconfigured. A
    // bookkeeping read going wrong must not lock somebody out of their own dashboard.
    expect(onboardingRedirectFor(null)).toBeNull();
  });

  it("falls back to the welcome screen for a step it does not recognise", () => {
    // A slug added to the database ahead of the route would otherwise redirect to
    // undefined. The CHECK constraint makes this hard to reach; "hard to reach" is not
    // "unreachable" during a deploy where the migration lands before the app.
    expect(onboardingRedirectFor(status({ step: "some-future-step" }))).toBe(WELCOME_ROUTE);
  });
});
