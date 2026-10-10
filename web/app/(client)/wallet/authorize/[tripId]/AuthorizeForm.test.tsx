import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/render";
import type { WalletCard } from "@/lib/wallet/queries";

vi.mock("@/lib/wallet/actions", () => ({}));

import { AuthorizeForm } from "./AuthorizeForm";

/**
 * 2.4.3 posts the card's id, the limit in cents, the expiry and the consent box; the action
 * reads those four. The MUI RadioGroup also posts `cardChoice` (the same payment_card uuid —
 * RadioGroup always names its radios). This pins the exact set, so nothing else (and no
 * Stripe id) ever rides along, and that the hidden fields follow the picker.
 * PCI: nothing beyond brand / last 4 / expiry appears (CLAUDE.md rules 1 and 4).
 */
const card = (id: string, last4: string): WalletCard => ({
  id,
  brand: "visa",
  last4,
  expMonth: 11,
  expYear: 2029,
  nickname: null,
  status: "active",
  consentRecordedAt: "2026-09-01T00:00:00Z",
  revokedAt: null,
  revokedReason: null,
});

function setup() {
  const action = vi.fn(async () => ({ status: "idle" as const }));
  renderWithTheme(
    <AuthorizeForm
      action={action as never}
      cards={[card("card-a", "4242"), card("card-b", "0005")]}
      presets={[
        { label: "Deposit", cents: 50000 },
        { label: "Exact", cents: 784500 },
      ]}
      defaultExpiryIso="2026-12-19T12:00:00.000Z"
      defaultExpiryLabel="Dec 19"
    />,
  );
  const form = document.querySelector("form")!;
  return { form, fields: () => Object.fromEntries(new FormData(form)) };
}

describe("AuthorizeForm", () => {
  it("posts the card, limit, expiry and consent, and nothing else", async () => {
    const user = userEvent.setup();
    const { fields } = setup();
    expect(Object.keys(fields()).sort()).toEqual([
      "cardChoice",
      "cardId",
      "expiresAt",
      "spendingLimitCents",
    ]);

    await user.click(screen.getByRole("radio", { name: /0005/ }));
    await user.click(screen.getByRole("button", { name: /Deposit/ }));
    await user.click(screen.getByRole("checkbox"));

    expect(fields()).toEqual({
      cardChoice: "card-b",
      cardId: "card-b",
      spendingLimitCents: "50000",
      expiresAt: "2026-12-19T12:00:00.000Z",
      consent: "on",
    });
  });

  it("names the card group and marks the chosen limit", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole("radiogroup")).toHaveAccessibleName();
    const deposit = screen.getByRole("button", { name: /Deposit/ });
    expect(deposit).toHaveAttribute("aria-pressed", "false");
    await user.click(deposit);
    expect(deposit).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps submit disabled until consent is given", async () => {
    const user = userEvent.setup();
    const { form } = setup();
    const submit = form.querySelector('button[type="submit"]')!;
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
  });
});
