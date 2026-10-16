import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/render";

const mocks = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("@/lib/email/unsubscribe", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/unsubscribe")>()),
  unsubscribeStatus: mocks.status,
}));
vi.mock("./actions", () => ({ changeMessagesEmail: vi.fn() }));

import UnsubscribePage from "./page";

const TOKEN = "abcdefghijklmnopqrstuvwxyz";
const render = async (params: Record<string, string>) =>
  renderWithTheme(await UnsubscribePage({ searchParams: Promise.resolve(params) }));

beforeEach(() => vi.clearAllMocks());

describe("email unsubscribe page (§3.10 Stage 4)", () => {
  it("opening the link changes nothing: it asks, with one button", async () => {
    mocks.status.mockResolvedValue("on");
    await render({ t: TOKEN });
    expect(mocks.status).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByRole("heading", { name: "Stop emailing you about messages?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop these emails" })).toHaveAttribute("type", "submit");
  });

  it("once off, says so and offers to turn them back on", async () => {
    mocks.status.mockResolvedValue("off");
    await render({ t: TOKEN, done: "off" });
    expect(screen.getByRole("heading", { name: "Done. We've stopped the message emails." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn them back on" })).toBeInTheDocument();
  });

  it("a malformed token is never sent anywhere", async () => {
    await render({ t: "../../etc" });
    expect(mocks.status).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "This link doesn't work anymore" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("a press that failed says so above the same question", async () => {
    mocks.status.mockResolvedValue("on");
    await render({ t: TOKEN, done: "error" });
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't go through. Please try again in a moment.");
    expect(screen.getByRole("button", { name: "Stop these emails" })).toBeInTheDocument();
  });

  it("a failed read says so instead of guessing", async () => {
    mocks.status.mockResolvedValue("unavailable");
    await render({ t: TOKEN });
    expect(screen.getByRole("heading", { name: "We couldn't reach your settings just now" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
