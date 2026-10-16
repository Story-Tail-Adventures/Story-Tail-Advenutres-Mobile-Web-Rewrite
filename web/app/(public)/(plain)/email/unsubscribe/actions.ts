"use server";

import { redirect } from "next/navigation";
import { isEmailToken, setMessagesEmail } from "@/lib/email/unsubscribe";

/**
 * The page's one button, either way. Redirects back with `done=` so a refresh never re-posts,
 * and so the page reads the switch fresh rather than trusting what it just asked for.
 */
export async function changeMessagesEmail(formData: FormData): Promise<void> {
  const token = formData.get("t");
  const on = formData.get("on") === "true";
  if (!isEmailToken(token)) redirect("/email/unsubscribe");
  const status = await setMessagesEmail(token, on);
  const done = status === "on" || status === "off" ? `&done=${status}` : "";
  redirect(`/email/unsubscribe?t=${encodeURIComponent(token)}${done}`);
}
