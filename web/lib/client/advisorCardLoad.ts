import { type AdvisorCardRow, type AdvisorCardView, toAdvisorCard } from "@/lib/client/advisorCard";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * §3.12 PR 3: the signed-in client's own advisor. SERVER ONLY (session cookie). Null when the
 * read fails or there is no card; every caller then keeps its long-standing fixed words, so a
 * failed read never empties a page.
 */
export async function loadAdvisorCard(): Promise<AdvisorCardView | null> {
  if (env.authChecksDisabledForLocalDev) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_advisor_card");
  if (error) {
    console.warn("[client] advisor card read failed", { code: error.code });
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as AdvisorCardRow | null;
  return row ? toAdvisorCard(row, env.supabaseUrl) : null;
}
