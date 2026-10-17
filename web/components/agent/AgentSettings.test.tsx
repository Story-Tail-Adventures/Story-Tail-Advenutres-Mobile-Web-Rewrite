import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithTheme } from "@/test/render";

const actions = vi.hoisted(() => ({
  saveProfileAction: vi.fn(),
  setAvatarAction: vi.fn(),
  removeAvatarAction: vi.fn(),
  saveAvailabilityAction: vi.fn(),
  saveTimeOffAction: vi.fn(),
  endTimeOffAction: vi.fn(),
  saveNotificationsAction: vi.fn(),
  saveSignatureAction: vi.fn(),
}));
vi.mock("@/app/(agent)/agent/settings/actions", () => actions);
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AgentAvailabilityForm } from "./AgentAvailabilityForm";
import { AgentNotificationsForm } from "./AgentNotificationsForm";
import { AgentSignatureForm } from "./AgentSignatureForm";
import { AgentProfileForm } from "./AgentProfileForm";
import { AgentTimeOffCard } from "./AgentTimeOffCard";
import { DEFAULT_AUTO_REPLY, DEFAULT_SIGNATURE, DEFAULT_WEEKLY_SCHEDULE } from "@/lib/agent/settingsRules";
import type { ProfileView } from "@/lib/agent/settingsView";

const PROFILE: ProfileView = {
  displayName: "Gyasi Story",
  pronouns: "he/him",
  email: "gyasi@example.com",
  phone: "+1-555-0100",
  bio: "I plan trips carefully.",
  avatarUrl: null,
  socialLinks: {},
};

beforeEach(() => {
  Object.values(actions).forEach((f) => f.mockReset());
  refresh.mockReset();
});

describe("AgentProfileForm (3.12.1)", () => {
  it("shows the sign-in email read-only and initials when there is no photo", () => {
    renderWithTheme(<AgentProfileForm profile={PROFILE} responseTimeHours={4} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
    expect(screen.getAllByText("GS").length).toBeGreaterThan(0);
    expect(screen.getByText("Usually replies within 4 hours")).toBeInTheDocument();
  });

  it("saves a handle as a full https link and says so", async () => {
    actions.saveProfileAction.mockResolvedValue({ ok: true, outcome: "updated" });
    const user = userEvent.setup();
    renderWithTheme(<AgentProfileForm profile={PROFILE} responseTimeHours={4} />);
    await user.type(screen.getByLabelText("Instagram"), "@story.tail");
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.saveProfileAction).toHaveBeenCalledWith(
      expect.objectContaining({ socialLinks: { instagram: "https://instagram.com/story.tail" } }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(screen.getByLabelText("Instagram")).toHaveValue("https://instagram.com/story.tail");
  });

  it("refuses an Instagram link on another site before sending anything", async () => {
    const user = userEvent.setup();
    renderWithTheme(<AgentProfileForm profile={PROFILE} responseTimeHours={4} />);
    await user.type(screen.getByLabelText("Instagram"), "https://evil.example.com/me");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.saveProfileAction).not.toHaveBeenCalled();
    expect(screen.getByText("Instagram should be a link on instagram.com.")).toBeInTheDocument();
  });

  it("needs a name", async () => {
    const user = userEvent.setup();
    renderWithTheme(<AgentProfileForm profile={PROFILE} responseTimeHours={4} />);
    await user.clear(screen.getByLabelText("Name"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.saveProfileAction).not.toHaveBeenCalled();
    expect(screen.getByText("Add the name clients will see.")).toBeInTheDocument();
  });

  it("shows the server's sentence when a save is refused", async () => {
    actions.saveProfileAction.mockResolvedValue({ ok: false, message: "That phone number doesn't look right." });
    const user = userEvent.setup();
    renderWithTheme(<AgentProfileForm profile={PROFILE} responseTimeHours={4} />);
    await user.type(screen.getByLabelText("Pronouns"), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That phone number doesn't look right.")).toBeInTheDocument();
  });
});

describe("AgentAvailabilityForm (3.12.2)", () => {
  const AVAILABILITY = {
    timeZone: "America/Chicago",
    weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
    responseTimeHours: 24,
    today: "2026-10-17",
    timeOff: [],
  };

  it("turns a day off and saves zone, hours and reply time together", async () => {
    actions.saveAvailabilityAction.mockResolvedValue({ ok: true, outcome: "updated" });
    const user = userEvent.setup();
    renderWithTheme(<AgentAvailabilityForm availability={AVAILABILITY} />);
    await user.click(screen.getByRole("switch", { name: "Working on Saturday" }));
    await user.selectOptions(screen.getByLabelText("Usually replies within"), "4");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.saveAvailabilityAction).toHaveBeenCalledWith({
      timeZone: "America/Chicago",
      weeklySchedule: { ...DEFAULT_WEEKLY_SCHEDULE, sat: null },
      responseTimeHours: 4,
    });
  });

  it("refuses hours that end before they start", async () => {
    const user = userEvent.setup();
    renderWithTheme(<AgentAvailabilityForm availability={AVAILABILITY} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Monday from" }), "22:00");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.saveAvailabilityAction).not.toHaveBeenCalled();
    expect(screen.getByText("Monday's hours have to end after they start.")).toBeInTheDocument();
  });
});

describe("AgentTimeOffCard (3.12.2 out of office)", () => {
  const today = "2026-10-17";

  it("offers I'm back on a running block, and edit or delete on an upcoming one", () => {
    renderWithTheme(
      <AgentTimeOffCard
        today={today}
        timeOff={[
          { id: "a", startsOn: "2026-10-15", endsOn: "2026-10-19", label: "Family trip", autoReplyEnabled: false, autoReplyText: "" },
          { id: "b", startsOn: "2026-11-26", endsOn: "2026-11-29", label: "Thanksgiving", autoReplyEnabled: false, autoReplyText: "" },
          { id: "c", startsOn: "2026-10-01", endsOn: "2026-10-03", label: "Over", autoReplyEnabled: false, autoReplyText: "" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Away now · Family trip")).toBeInTheDocument();
    expect(within(items[0]).getByRole("button", { name: "I'm back" })).toBeInTheDocument();
    expect(within(items[0]).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(items[1]).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("ends a running block after confirming, then refreshes", async () => {
    actions.endTimeOffAction.mockResolvedValue({ ok: true, outcome: "ended" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderWithTheme(
      <AgentTimeOffCard today={today} timeOff={[{ id: "a", startsOn: "2026-10-15", endsOn: "2026-10-19", label: "", autoReplyEnabled: false, autoReplyText: "" }]} />,
    );
    await user.click(screen.getByRole("button", { name: "I'm back" }));
    expect(actions.endTimeOffAction).toHaveBeenCalledWith({ timeOffId: "a" });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("says when nothing is planned", () => {
    renderWithTheme(<AgentTimeOffCard today={today} timeOff={[]} />);
    expect(screen.getByText("No time away planned.")).toBeInTheDocument();
  });
});

describe("AgentNotificationsForm (3.12.3)", () => {
  const DEFAULTS = { clientMessagesPush: true, clientMessagesEmail: false, quoteRequestsPush: true, quoteRequestsEmail: true };

  it("draws only the rows that fire, Email and Push, and links rest hours to Availability", () => {
    renderWithTheme(<AgentNotificationsForm notifications={DEFAULTS} />);
    expect(screen.getByRole("switch", { name: "Client message by email" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Client message by push" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "New trip request by email" })).toBeChecked();
    expect(screen.queryByText("SMS")).toBeNull();
    expect(screen.getByRole("link", { name: "Set your working hours" })).toHaveAttribute("href", "/agent/settings?tab=availability");
  });

  it("saves all four switches together", async () => {
    actions.saveNotificationsAction.mockResolvedValue({ ok: true, outcome: "updated" });
    const user = userEvent.setup();
    renderWithTheme(<AgentNotificationsForm notifications={DEFAULTS} />);
    await user.click(screen.getByRole("switch", { name: "Client message by email" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.saveNotificationsAction).toHaveBeenCalledWith({ ...DEFAULTS, clientMessagesEmail: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });
});

describe("AgentSignatureForm (3.12.4)", () => {
  it("previews the filled signature with the locked line last", () => {
    renderWithTheme(<AgentSignatureForm signature={{ text: DEFAULT_SIGNATURE, isDefault: true }} profile={PROFILE} />);
    const preview = screen.getByRole("complementary", { name: "How it looks in an email" });
    expect(within(preview).getByText("Gyasi Story, Travel Advisor")).toBeInTheDocument();
    expect(within(preview).getByText("+1-555-0100 · gyasi@example.com")).toBeInTheDocument();
    expect(within(preview).getByText("Story-Tail Adventures · Hosted by Inteletravel")).toBeInTheDocument();
  });

  it("refuses an unknown merge field before sending", async () => {
    const user = userEvent.setup();
    renderWithTheme(<AgentSignatureForm signature={{ text: "Hi", isDefault: false }} profile={PROFILE} />);
    await user.type(screen.getByLabelText("Your signature"), " {{{{client.name}}");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.saveSignatureAction).not.toHaveBeenCalled();
    expect(screen.getAllByText(/We don't have a/).length).toBeGreaterThan(0);
  });

  it("saves the edited text", async () => {
    actions.saveSignatureAction.mockResolvedValue({ ok: true, outcome: "updated" });
    const user = userEvent.setup();
    renderWithTheme(<AgentSignatureForm signature={{ text: "Hi", isDefault: false }} profile={PROFILE} />);
    await user.type(screen.getByLabelText("Your signature"), " there");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.saveSignatureAction).toHaveBeenCalledWith({ signature: "Hi there" });
  });
});

describe("AgentTimeOffCard auto-reply (Q21)", () => {
  it("shows the reply is on, and offers the default words when switched on", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <AgentTimeOffCard
        today="2026-10-17"
        timeOff={[{ id: "b", startsOn: "2026-11-26", endsOn: "2026-11-29", label: "Thanksgiving", autoReplyEnabled: true, autoReplyText: "Back {{return_date}}" }]}
      />,
    );
    expect(screen.getByText("Thanksgiving · Automatic reply on")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Schedule time away" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Automatic reply")).toBeNull();
    await user.click(within(dialog).getByRole("switch", { name: "Send an automatic reply" }));
    expect(within(dialog).getByLabelText("Automatic reply")).toHaveValue(DEFAULT_AUTO_REPLY);
  });
});
