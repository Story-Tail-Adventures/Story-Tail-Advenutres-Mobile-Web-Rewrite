import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §3.10.2's reply box: sends a reply or an internal note, keeps every word (and the note switch)
 * through a refused send, and on "Message client" starts the thread and goes to it.
 */

const mocks = vi.hoisted(() => ({ send: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("@/app/(agent)/agent/messages/actions", () => ({ sendAgentMessageAction: mocks.send }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push, replace: mocks.replace }),
}));

import { AgentReplyBox } from "./AgentReplyBox";
import { renderWithTheme } from "@/test/render";

const SEEN = "2026-10-13T14:02:11.123456+00:00";
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => vi.clearAllMocks());

describe("AgentReplyBox", () => {
  it("sends a reply with its own id and what was on screen, then clears and is ready for the next", async () => {
    const user = userEvent.setup();
    mocks.send.mockResolvedValue({ ok: true, conversationId: "c1" });
    renderWithTheme(<AgentReplyBox conversationId="c1" seenUpTo={SEEN} clientFirstName="Maya" clientCanSignIn />);
    const box = screen.getByRole("textbox", { name: "Reply" });
    await user.type(box, "Done — bungalow is yours.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.send).toHaveBeenCalledWith({
      conversationId: "c1",
      clientId: undefined,
      tripId: undefined,
      messageId: expect.stringMatching(V7),
      seenUpTo: SEEN,
      body: "Done — bungalow is yours.",
      internalNote: false,
    });
    await waitFor(() => expect(box).toHaveValue(""));
    expect(screen.getByRole("status")).toHaveTextContent("Sent");
    expect(box).toHaveFocus();
    // The action's revalidation redraws the thread; a refresh on top would be a second render.
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("an internal note looks and reads like one, is sent as one, and the switch goes back off", async () => {
    const user = userEvent.setup();
    mocks.send.mockResolvedValue({ ok: true, conversationId: "c1" });
    renderWithTheme(<AgentReplyBox conversationId="c1" seenUpTo={SEEN} clientFirstName="Maya" clientCanSignIn />);
    await user.click(screen.getByRole("switch", { name: "Internal note" }));
    const box = screen.getByRole("textbox", { name: "Internal note" });
    expect(box).toHaveAccessibleDescription("Only you can see this note.");
    await user.type(box, "margin is 14%");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ internalNote: true, body: "margin is 14%" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Note added"));
    expect(screen.getByRole("switch", { name: "Internal note" })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "Reply" })).toHaveValue("");
  });

  it("a refused send keeps the words and the note switch, and a retry of the same words reuses the id", async () => {
    const user = userEvent.setup();
    mocks.send.mockResolvedValue({ ok: false, message: "That didn't send. Try again in a moment." });
    renderWithTheme(<AgentReplyBox conversationId="c1" seenUpTo={SEEN} clientFirstName="Maya" clientCanSignIn />);
    await user.click(screen.getByRole("switch", { name: "Internal note" }));
    await user.type(screen.getByRole("textbox", { name: "Internal note" }), "keep me");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't send");
    expect(screen.getByRole("textbox", { name: "Internal note" })).toHaveValue("keep me");
    expect(screen.getByRole("switch", { name: "Internal note" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    const [first, second] = mocks.send.mock.calls.map((c) => c[0].messageId);
    expect(second).toBe(first);

    // Different words are a different message.
    await user.type(screen.getByRole("textbox", { name: "Internal note" }), "!");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(3));
    expect(mocks.send.mock.calls[2][0].messageId).not.toBe(first);
  });

  it("an action that throws keeps the draft and says so", async () => {
    const user = userEvent.setup();
    mocks.send.mockRejectedValue(new Error("network"));
    renderWithTheme(<AgentReplyBox conversationId="c1" seenUpTo={SEEN} clientFirstName="Maya" clientCanSignIn />);
    await user.type(screen.getByRole("textbox", { name: "Reply" }), "still here");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't send. Try again in a moment.");
    expect(screen.getByRole("textbox", { name: "Reply" })).toHaveValue("still here");
  });

  it("to a client with no thread yet: a message, no note switch, and it replaces itself with the thread it started", async () => {
    const user = userEvent.setup();
    mocks.send.mockResolvedValue({ ok: true, conversationId: "new-1" });
    renderWithTheme(<AgentReplyBox clientId="k1" tripId="t1" clientFirstName="Nora" clientCanSignIn={false} />);
    expect(screen.queryByRole("switch", { name: "Internal note" })).toBeNull();
    const box = screen.getByRole("textbox", { name: "Message" });
    expect(box).toHaveAttribute("placeholder", "Write a message…");
    expect(box).toHaveAccessibleDescription("Nora hasn't set up a login yet, so this won't be emailed. It will be waiting when they sign in.");
    await user.type(box, "Hi Nora");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "k1", tripId: "t1", seenUpTo: null, internalNote: false }),
    );
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/agent/messages/new-1"));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("will not send nothing", async () => {
    const user = userEvent.setup();
    renderWithTheme(<AgentReplyBox conversationId="c1" clientFirstName="Maya" clientCanSignIn />);
    await user.type(screen.getByRole("textbox", { name: "Reply" }), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  describe("with templates (§3.10 Stage 2)", () => {
    const tpl = (id: string, category: string, name: string, body: string) => ({
      id,
      category: category as never,
      name,
      body,
      tags: [],
      archived: false,
      lastEditedLabel: "Last edited Oct 14",
    });
    const picker = {
      templates: [
        tpl("t1", "lead_response", "Lead response", "Hi {{client.firstName}}!"),
        tpl("t2", "payment_reminder", "Payment reminder", "{{payment.label}} due {{payment.dueDate}}"),
      ],
      values: { "client.firstName": "Maya" },
      startOn: null,
    };

    it("inserts a template at the cursor without replacing the draft", async () => {
      const user = userEvent.setup();
      renderWithTheme(<AgentReplyBox conversationId="c1" clientFirstName="Maya" clientCanSignIn picker={picker} />);
      const box = screen.getByRole("textbox", { name: "Reply" });
      await user.type(box, "P.S. ");
      await user.click(screen.getByRole("button", { name: "Insert template" }));
      await user.click(screen.getByRole("button", { name: "Insert as-is" }));
      await waitFor(() => expect(box).toHaveValue("P.S. Hi Maya!"));
      expect(screen.getByRole("status")).toHaveTextContent("Template added. Read it over, then send.");
    });

    it("refuses to send while a merge field is left, naming it, and keeps the words", async () => {
      const user = userEvent.setup();
      renderWithTheme(<AgentReplyBox conversationId="c1" clientFirstName="Maya" clientCanSignIn picker={picker} />);
      await user.click(screen.getByRole("button", { name: "Insert template" }));
      await user.click(screen.getByRole("button", { name: "Payment reminder" }));
      await user.click(screen.getByRole("button", { name: "Insert & edit" }));
      const box = screen.getByRole("textbox", { name: "Reply" });
      await waitFor(() => expect(box).toHaveValue("{{payment.label}} due {{payment.dueDate}}"));
      await user.click(screen.getByRole("button", { name: "Send" }));
      expect(mocks.send).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "{{payment.label}}, {{payment.dueDate}} are still in your message, and this thread has no values for them. Fill them in before you send.",
      );
      expect(box).toHaveValue("{{payment.label}} due {{payment.dueDate}}");
    });

    it("opened from the reminder door, starts open on Payment reminder", () => {
      renderWithTheme(
        <AgentReplyBox
          conversationId="c1"
          clientFirstName="Maya"
          clientCanSignIn
          picker={{ ...picker, startOn: "payment_reminder" }}
        />,
      );
      expect(screen.getByRole("dialog", { name: "Insert a template" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Payment reminder" })).toHaveAttribute("aria-current", "true");
    });

    it("offers no picker when the templates could not be read", () => {
      renderWithTheme(<AgentReplyBox conversationId="c1" clientFirstName="Maya" clientCanSignIn picker={null} />);
      expect(screen.queryByRole("button", { name: "Insert template" })).toBeNull();
    });
  });
});
