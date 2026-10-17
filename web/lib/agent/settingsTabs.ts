/** §3.12's tabs, in order. Pure data: the page and the client tab bar both read it. */
export const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "availability", label: "Availability" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

/** An unknown or missing `?tab=` is the first tab, never an error page. */
export function validSettingsTab(value: string | undefined): SettingsTab {
  return SETTINGS_TABS.some((t) => t.id === value) ? (value as SettingsTab) : "profile";
}
