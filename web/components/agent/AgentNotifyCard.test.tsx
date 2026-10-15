import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithTheme } from "@/test/render";
import { AGENT_MESSAGES_COPY } from "@/lib/agent/content";

const mocks = vi.hoisted(() => ({
  pushSupported: vi.fn(),
  refreshPushIfOn: vi.fn(),
  turnOnPush: vi.fn(),
}));
vi.mock("@/lib/agent/pushClient", () => mocks);

import { AgentNotifyCard, NOT_NOW_KEY } from "./AgentNotifyCard";

/** jsdom has no Notification; the card reads only its permission. */
function permission(value: NotificationPermission) {
  vi.stubGlobal("Notification", { permission: value });
}

// Bare `localStorage` can be undefined under vitest (see the theme toggle's tests), so the card
// wraps every access; these tests install a real-enough one.
function installStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  Object.defineProperty(window, "localStorage", { value: globalThis.localStorage, configurable: true });
  return store;
}

let store: Map<string, string>;
beforeEach(() => {
  store = installStorage();
  mocks.pushSupported.mockReturnValue(true);
  mocks.refreshPushIfOn.mockResolvedValue(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const title = () => screen.queryByRole("heading", { name: AGENT_MESSAGES_COPY.notifyTitle });

describe("AgentNotifyCard (§3.10.7, A3107)", () => {
  it("offers itself when this browser can notify and has not been asked", async () => {
    permission("default");
    renderWithTheme(<AgentNotifyCard />);
    expect(await screen.findByRole("heading", { name: AGENT_MESSAGES_COPY.notifyTitle })).toBeInTheDocument();
    expect(screen.getByText(AGENT_MESSAGES_COPY.notifyBody)).toBeInTheDocument();
  });

  it("stays away where it cannot help: no support, permission denied, or already on", async () => {
    mocks.pushSupported.mockReturnValue(false);
    permission("default");
    const { unmount } = renderWithTheme(<AgentNotifyCard />);
    expect(title()).toBeNull();
    unmount();

    mocks.pushSupported.mockReturnValue(true);
    permission("denied");
    const second = renderWithTheme(<AgentNotifyCard />);
    expect(title()).toBeNull();
    second.unmount();

    permission("granted");
    mocks.refreshPushIfOn.mockResolvedValue(true);
    renderWithTheme(<AgentNotifyCard />);
    await waitFor(() => expect(mocks.refreshPushIfOn).toHaveBeenCalled());
    expect(title()).toBeNull();
  });

  it("asks for permission only on Turn on, and says when it worked", async () => {
    permission("default");
    mocks.turnOnPush.mockResolvedValue("on");
    renderWithTheme(<AgentNotifyCard />);
    expect(mocks.turnOnPush).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole("button", { name: AGENT_MESSAGES_COPY.notifyTurnOn }));
    expect(mocks.turnOnPush).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent(AGENT_MESSAGES_COPY.notifyOn);
    expect(title()).toBeNull();
  });

  it("explains a block, and keeps the card for a failure worth retrying", async () => {
    permission("default");
    mocks.turnOnPush.mockResolvedValueOnce("failed").mockResolvedValueOnce("blocked");
    renderWithTheme(<AgentNotifyCard />);

    await userEvent.click(await screen.findByRole("button", { name: AGENT_MESSAGES_COPY.notifyTurnOn }));
    expect(await screen.findByRole("alert")).toHaveTextContent(AGENT_MESSAGES_COPY.notifyFailed);

    await userEvent.click(screen.getByRole("button", { name: AGENT_MESSAGES_COPY.notifyTurnOn }));
    expect(await screen.findByRole("alert")).toHaveTextContent(AGENT_MESSAGES_COPY.notifyBlocked);
    // Blocked: another tap cannot help, so the button goes; "Not now" stays.
    expect(screen.queryByRole("button", { name: AGENT_MESSAGES_COPY.notifyTurnOn })).toBeNull();
    expect(screen.getByRole("button", { name: AGENT_MESSAGES_COPY.notifyNotNow })).toBeInTheDocument();
  });

  it("closing the browser's prompt goes quietly back to the offer", async () => {
    permission("default");
    mocks.turnOnPush.mockResolvedValue("dismissed");
    renderWithTheme(<AgentNotifyCard />);
    await userEvent.click(await screen.findByRole("button", { name: AGENT_MESSAGES_COPY.notifyTurnOn }));
    await waitFor(() => expect(mocks.turnOnPush).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: AGENT_MESSAGES_COPY.notifyTurnOn })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Not now hides it in this browser and remembers", async () => {
    permission("default");
    const { unmount } = renderWithTheme(<AgentNotifyCard />);
    await userEvent.click(await screen.findByRole("button", { name: AGENT_MESSAGES_COPY.notifyNotNow }));
    expect(title()).toBeNull();
    expect(store.get(NOT_NOW_KEY)).toBe("1");
    unmount();

    renderWithTheme(<AgentNotifyCard />);
    expect(title()).toBeNull();
  });
});
