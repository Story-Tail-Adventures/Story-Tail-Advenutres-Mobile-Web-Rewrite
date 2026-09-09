import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WELCOME_CARDS, WELCOME_TEXT } from "./state";

/**
 * Screen 2.1.9's render.
 *
 * The one thing here that is a real bug rather than a layout preference: the greeting must
 * never render the placeholder name `handle_new_user()` writes when a sign-up carried no
 * name claims. "So glad you're here, New." is the first sentence that traveler would ever
 * read.
 */

// next/image needs the Next runtime's loader config (web/lib/image-loader.ts, registered in
// next.config.ts); a plain <img> is enough here. Same shim the public page tests use.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./actions", () => ({
  beginOnboardingAction: vi.fn(async () => {}),
  skipOnboardingAction: vi.fn(async () => ({})),
}));

import WelcomePage from "./page";

function clientRow(row: { first_name?: string | null; preferred_name?: string | null } | null) {
  mocks.createClient.mockResolvedValue({
    from: () => ({
      select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
    }),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  mocks.createClient.mockReset();
  clientRow({ first_name: "Jordan", preferred_name: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("2.1.9 Welcome — the greeting", () => {
  it("greets the traveler by name", async () => {
    render(await WelcomePage());
    expect(
      screen.getByRole("heading", { level: 1, name: WELCOME_TEXT.title("Jordan") }),
    ).toBeInTheDocument();
  });

  it("prefers the name they said they go by", async () => {
    clientRow({ first_name: "Jordan", preferred_name: "Jo" });
    render(await WelcomePage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      WELCOME_TEXT.title("Jo"),
    );
  });

  it.each(["New", null, "", "   "])(
    "greets nobody in particular rather than %j",
    async (name) => {
      // 'New' is the literal placeholder handle_new_user() writes when a sign-up carried no
      // name claims — Apple sends none after the first authorization.
      clientRow({ first_name: name, preferred_name: null });
      render(await WelcomePage());
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        WELCOME_TEXT.titleNoName,
      );
      expect(screen.queryByText(/here, New\./)).not.toBeInTheDocument();
    },
  );

  it("greets nobody in particular when there is no client row at all", async () => {
    clientRow(null);
    render(await WelcomePage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      WELCOME_TEXT.titleNoName,
    );
  });
});

describe("2.1.9 Welcome — what it says the portal does", () => {
  it("renders every card as a list item under one heading", async () => {
    render(await WelcomePage());
    expect(
      screen.getByRole("heading", { level: 2, name: WELCOME_TEXT.sectionHeading }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(WELCOME_CARDS.length);
    for (const card of WELCOME_CARDS) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
    }
  });

  it("offers both exits, and labels the skip for a screen reader", async () => {
    render(await WelcomePage());
    expect(
      screen.getByRole("button", { name: new RegExp(WELCOME_TEXT.primaryCta) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: WELCOME_TEXT.secondaryCtaA11y }),
    ).toBeInTheDocument();
  });

  it("leaves the hero photo out of the accessibility tree", async () => {
    // The h1 beside it carries the meaning; announcing the photo first is noise before
    // the greeting.
    render(await WelcomePage());
    expect(screen.queryByRole("img", { name: /.+/ })).not.toBeInTheDocument();
  });
});
