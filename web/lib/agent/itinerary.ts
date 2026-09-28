import { ITINERARY_COPY } from "@/lib/agent/content";

/**
 * §3.4.14's vocabulary and form shapes.
 *
 * SERVER-FREE, like `components.ts` and `payments.ts`, and for the same reason: the forms
 * are client components, and anything reaching `lib/supabase/server.ts` drags `next/headers`
 * into the browser bundle and 500s the route.
 */

/**
 * `block_kind`, plus an empty option that means "derive it from the time".
 *
 * THE EMPTY ONE IS THE DEFAULT, deliberately. `block_for_time` in SQL maps 06:40 to morning
 * and 15:00 to afternoon, which is what an advisor would have picked anyway — so the common
 * case is one fewer decision. Picking a block explicitly overrides it, which is what an
 * all-day entry with a start time needs.
 */
export const BLOCKS = [
  { value: "", label: ITINERARY_COPY.blockAuto },
  { value: "morning", label: ITINERARY_COPY.blockMorning },
  { value: "afternoon", label: ITINERARY_COPY.blockAfternoon },
  { value: "evening", label: ITINERARY_COPY.blockEvening },
  { value: "all_day", label: ITINERARY_COPY.blockAllDay },
] as const;

const BLOCK_VALUES = ["morning", "afternoon", "evening", "all_day"];

export function isBlock(value: unknown): boolean {
  return typeof value === "string" && BLOCK_VALUES.includes(value);
}

export type DayValues = {
  dayId: string;
  date: string;
  label: string;
  summary: string;
};

export type ActivityValues = {
  activityId: string;
  dayId: string;
  title: string;
  block: string;
  startTime: string;
  endTime: string;
  body: string;
  location: string;
  address: string;
  phone: string;
  confirmationNumber: string;
  gyasisTip: string;
};

export type ItineraryState = {
  fieldErrors?: Record<string, string[]>;
  formError?: string;
  dayValues?: DayValues;
  activityValues?: ActivityValues;
};

export function emptyDay(date = ""): DayValues {
  return { dayId: "", date, label: "", summary: "" };
}

export function emptyActivity(dayId: string): ActivityValues {
  return {
    activityId: "",
    dayId,
    title: "",
    // Empty means "derive from the time" — see BLOCKS.
    block: "",
    startTime: "",
    endTime: "",
    body: "",
    location: "",
    address: "",
    phone: "",
    confirmationNumber: "",
    gyasisTip: "",
  };
}

export function dayFromFormData(form: FormData): DayValues {
  const text = (n: string) => (form.get(n) ?? "").toString().trim();
  return {
    dayId: text("dayId"),
    date: text("date"),
    label: text("label"),
    summary: text("summary"),
  };
}

export function activityFromFormData(form: FormData): ActivityValues {
  const text = (n: string) => (form.get(n) ?? "").toString().trim();
  const rawBlock = text("block");
  return {
    activityId: text("activityId"),
    dayId: text("dayId"),
    title: text("title"),
    // An unrecognised block becomes "derive it", not a throw: the value came from a select
    // whose options this module owns, so anything else is a stale page rather than input
    // worth refusing.
    block: isBlock(rawBlock) ? rawBlock : "",
    startTime: text("startTime"),
    endTime: text("endTime"),
    body: text("body"),
    location: text("location"),
    address: text("address"),
    phone: text("phone"),
    confirmationNumber: text("confirmationNumber"),
    gyasisTip: text("gyasisTip"),
  };
}

export function validateDay(values: DayValues): Record<string, string[]> | null {
  // `itinerary_day.date` is NOT NULL, and only on a create — the SQL keeps the existing
  // date when none is sent, so an advisor editing a label need not resend it.
  if (values.dayId === "" && !values.date) {
    return { date: [ITINERARY_COPY.dayDateRequired] };
  }
  return null;
}

export function validateActivity(values: ActivityValues): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (!values.title) errors.title = [ITINERARY_COPY.activityTitleRequired];
  return Object.keys(errors).length > 0 ? errors : null;
}
