import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §3.10.5's editor: an unknown token blocks Save and is named, a chip goes in at the cursor, the
 * preview uses the fixed sample, and a new template is created once under the id the form
 * minted, after which the URL becomes its own.
 */

const mocks = vi.hoisted(() => ({ save: vi.fn(), archive: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("@/app/(agent)/agent/messages/templates/actions", () => ({
  saveMessageTemplateAction: mocks.save,
  setMessageTemplateArchivedAction: mocks.archive,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, refresh: vi.fn() }),
}));

import { MessageTemplateEditor } from "./MessageTemplateEditor";
import { renderWithTheme } from "@/test/render";

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NEW = { id: null, category: "other" as const, name: "", body: "", tags: [] };

beforeEach(() => vi.clearAllMocks());

describe("MessageTemplateEditor", () => {
  it("names an unknown merge field and does not save", async () => {
    const user = userEvent.setup();
    renderWithTheme(<MessageTemplateEditor initial={NEW} tagSuggestions={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Typo");
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hi {{{{client.firstname}}");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAccessibleDescription(
      "{{client.firstname}} isn't a merge field. Pick from the list under the message.",
    );
  });

  it("a chip goes in at the cursor, and the preview fills it from the sample", async () => {
    const user = userEvent.setup();
    renderWithTheme(<MessageTemplateEditor initial={{ ...NEW, body: "Hi , welcome" }} tagSuggestions={[]} />);
    const body = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
    body.focus();
    body.setSelectionRange(3, 3);
    await user.click(screen.getByRole("button", { name: "{{client.firstName}}" }));
    expect(body).toHaveValue("Hi {{client.firstName}}, welcome");
    expect(screen.getByText("Hi Jordan, welcome")).toBeInTheDocument();
  });

  it("creates under the id it minted, then moves to the template's own URL", async () => {
    const user = userEvent.setup();
    mocks.save.mockImplementation(async (input: { templateId: string }) => ({ ok: true, templateId: input.templateId, changed: true }));
    renderWithTheme(<MessageTemplateEditor initial={NEW} tagSuggestions={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "  Check-in ");
    await user.selectOptions(screen.getByRole("combobox", { name: "Category" }), "post_trip");
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hi {{{{client.firstName}}");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.save).toHaveBeenCalledWith({
      mode: "create",
      templateId: expect.stringMatching(V7),
      category: "post_trip",
      name: "Check-in",
      body: "Hi {{client.firstName}}",
      tags: [],
    });
    const id = mocks.save.mock.calls[0][0].templateId;
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(`/agent/messages/templates/${id}`));
  });

  it("a refused save keeps every word and says why", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue({ ok: false, message: "That template is not in your library." });
    renderWithTheme(
      <MessageTemplateEditor initial={{ id: "t1", category: "pre_trip", name: "Packing", body: "Pack light", tags: [] }} tagSuggestions={[]} />,
    );
    await user.type(screen.getByRole("textbox", { name: "Message" }), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ mode: "update", templateId: "t1", body: "Pack light!" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That template is not in your library.");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Pack light!");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("an unchanged template does not call the server", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <MessageTemplateEditor initial={{ id: "t1", category: "pre_trip", name: "Packing", body: "Pack light", tags: [] }} tagSuggestions={[]} />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByText("No changes to save.")).toBeInTheDocument();
  });
});
