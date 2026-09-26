import type { ClientField } from "@/lib/validation/client";

/**
 * Screens 3.3.9 and 3.3.10's form state.
 *
 * SEPARATE FROM `actions.ts` because a `"use server"` module may only export async
 * functions; every other export is treated as a Server Action and rejected at runtime. The
 * §2.1 wizard's `state.ts` files exist for the same reason and say so.
 */

/** Every input on the screen, as the strings a form posts. Also the prefill shape. */
export interface ClientFormValues {
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  notes: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
  /** Posted as repeated `tag` inputs; held here as the list the chips render from. */
  tags: string[];
  /** Posted as parallel `dateLabel` / `dateValue` / `dateRecurring` inputs. */
  importantDates: { label: string; date: string; recurring: boolean }[];
}

export interface ClientFormState {
  fieldErrors?: Partial<Record<ClientField, string[]>>;
  formError?: string;
  /**
   * Set when the email collides with a client the advisor already has. Carries the id so
   * the form can offer a link to that record rather than only refusing — which is the whole
   * reason the Edge Function answers a duplicate with 200 instead of a 4xx.
   */
  duplicateClientId?: string;
  /** Echoed back so a failed submit does not empty the form somebody just filled in. */
  values?: ClientFormValues;
}

export const initialClientFormState: ClientFormState = {};

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  firstName: "",
  lastName: "",
  preferredName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  notes: "",
  addressLine1: "",
  addressLine2: "",
  addressCity: "",
  addressRegion: "",
  addressPostalCode: "",
  addressCountry: "",
  tags: [],
  importantDates: [],
};

/**
 * Read the form back out of a `FormData`.
 *
 * `tag` and the three `date*` inputs repeat, which is why they are read with `getAll` and
 * zipped rather than indexed by name. A row whose label and date are BOTH blank is dropped
 * rather than validated: an empty repeater row is somebody who added one and changed their
 * mind, not an error.
 */
export function clientFormFromFormData(form: FormData): ClientFormValues {
  const text = (k: string) => (form.get(k) ?? "").toString();

  const labels = form.getAll("dateLabel").map((v) => v.toString());
  const dates = form.getAll("dateValue").map((v) => v.toString());
  const recurring = new Set(form.getAll("dateRecurring").map((v) => v.toString()));

  const importantDates = labels
    .map((label, i) => ({
      label: label.trim(),
      date: (dates[i] ?? "").trim(),
      recurring: recurring.has(String(i)),
    }))
    .filter((d) => d.label !== "" || d.date !== "");

  return {
    firstName: text("firstName"),
    lastName: text("lastName"),
    preferredName: text("preferredName"),
    email: text("email"),
    phone: text("phone"),
    dateOfBirth: text("dateOfBirth"),
    notes: text("notes"),
    addressLine1: text("addressLine1"),
    addressLine2: text("addressLine2"),
    addressCity: text("addressCity"),
    addressRegion: text("addressRegion"),
    addressPostalCode: text("addressPostalCode"),
    addressCountry: text("addressCountry"),
    tags: form.getAll("tag").map((v) => v.toString().trim().toLowerCase())
      .filter((t) => t !== ""),
    importantDates,
  };
}
