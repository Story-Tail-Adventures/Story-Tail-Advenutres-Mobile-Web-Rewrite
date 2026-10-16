import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "@/test/render";

/**
 * The consent gate for Google Analytics: the banner, the 2.5.9 switch, and the loader.
 *
 * The point of the gate is what does NOT happen, so the loader tests assert that the
 * Firebase SDK is never imported without a yes, as much as what it sends after one.
 */

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const configured = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/firebase", () => ({
  get firebaseAnalyticsConfigured() {
    return configured.value;
  },
  firebaseWebConfig: () =>
    configured.value ? { apiKey: "k", projectId: "p", appId: "a", measurementId: "G-TEST" } : null,
}));

const sdk = vi.hoisted(() => ({
  imported: 0,
  initializeAnalytics: vi.fn(() => ({ app: {} })),
  logEvent: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
  setDefaultEventParameters: vi.fn(),
  isSupported: vi.fn(async () => true),
}));
vi.mock("firebase/analytics", () => {
  sdk.imported++;
  return sdk;
});
vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})), getApps: () => [] }));

const KEY = "sta-analytics-consent";

beforeEach(() => {
  window.localStorage.clear();
  nav.pathname = "/";
  configured.value = true;
  vi.clearAllMocks();
  sdk.imported = 0;
});

afterEach(() => {
  vi.resetModules();
});

async function load() {
  const [{ AnalyticsConsentBanner }, { AnalyticsSwitch }, { FirebaseAnalytics }] = await Promise.all([
    import("./AnalyticsConsentBanner"),
    import("@/app/(client)/account/privacy/AnalyticsSwitch"),
    import("./FirebaseAnalytics"),
  ]);
  return { AnalyticsConsentBanner, AnalyticsSwitch, FirebaseAnalytics };
}

describe("AnalyticsConsentBanner", () => {
  it("asks once, and remembers a yes", async () => {
    const { AnalyticsConsentBanner } = await load();
    renderWithTheme(<AnalyticsConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(window.localStorage.getItem(KEY)).toBe("granted");
    expect(screen.queryByRole("region", { name: "Google Analytics" })).toBeNull();
  });

  it("remembers a no", async () => {
    const { AnalyticsConsentBanner } = await load();
    renderWithTheme(<AnalyticsConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(window.localStorage.getItem(KEY)).toBe("denied");
  });

  it("does not ask when Firebase is not configured", async () => {
    configured.value = false;
    const { AnalyticsConsentBanner } = await load();
    renderWithTheme(<AnalyticsConsentBanner />);
    expect(screen.queryByRole("region", { name: "Google Analytics" })).toBeNull();
  });

  it("does not ask on the agent surface", async () => {
    nav.pathname = "/agent/clients";
    const { AnalyticsConsentBanner } = await load();
    renderWithTheme(<AnalyticsConsentBanner />);
    expect(screen.queryByRole("region", { name: "Google Analytics" })).toBeNull();
  });
});

describe("AnalyticsSwitch (2.5.9)", () => {
  it("reads unanswered as off and writes both answers", async () => {
    const { AnalyticsSwitch } = await load();
    renderWithTheme(<AnalyticsSwitch />);
    const toggle = screen.getByRole("switch", { name: "Google Analytics" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(window.localStorage.getItem(KEY)).toBe("granted");
    fireEvent.click(toggle);
    expect(window.localStorage.getItem(KEY)).toBe("denied");
  });
});

describe("FirebaseAnalytics", () => {
  it("never loads the SDK without a yes", async () => {
    const { FirebaseAnalytics } = await load();
    renderWithTheme(<FirebaseAnalytics />);
    window.localStorage.setItem(KEY, "denied");
    await act(async () => {});
    expect(sdk.imported).toBe(0);
    expect(sdk.initializeAnalytics).not.toHaveBeenCalled();
  });

  it("after a yes, sends a redacted page view with Google's ad features off", async () => {
    window.localStorage.setItem(KEY, "granted");
    window.history.replaceState(null, "", "/trips/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b?tab=docs");
    nav.pathname = "/trips/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    const { FirebaseAnalytics } = await load();
    renderWithTheme(<FirebaseAnalytics />);

    await waitFor(() => expect(sdk.logEvent).toHaveBeenCalled());
    const page = `${window.location.origin}/trips/[id]`;
    expect(sdk.initializeAnalytics).toHaveBeenCalledWith(expect.anything(), {
      config: { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false },
    });
    expect(sdk.setDefaultEventParameters).toHaveBeenCalledWith(
      expect.objectContaining({ page_location: page, page_title: "/trips/[id]" }),
    );
    expect(sdk.logEvent).toHaveBeenCalledWith(expect.anything(), "page_view", {
      page_location: page,
      page_title: "/trips/[id]",
    });
    window.history.replaceState(null, "", "/");
  });

  it("does not start on the agent surface even with a yes", async () => {
    window.localStorage.setItem(KEY, "granted");
    window.history.replaceState(null, "", "/agent/clients?q=Smith");
    nav.pathname = "/agent/clients";
    const { FirebaseAnalytics } = await load();
    renderWithTheme(<FirebaseAnalytics />);
    await act(async () => {});
    expect(sdk.initializeAnalytics).not.toHaveBeenCalled();
    expect(sdk.logEvent).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/");
  });

  it("on a no, deletes the IndexedDB stores where Firebase keeps its installation id", async () => {
    const deleteDatabase = vi.fn();
    vi.stubGlobal("indexedDB", { deleteDatabase });
    window.localStorage.setItem(KEY, "denied");
    const { FirebaseAnalytics } = await load();
    renderWithTheme(<FirebaseAnalytics />);
    await act(async () => {});
    expect(deleteDatabase).toHaveBeenCalledWith("firebase-installations-database");
    expect(deleteDatabase).toHaveBeenCalledWith("firebase-heartbeat-database");
    vi.unstubAllGlobals();
  });
});
