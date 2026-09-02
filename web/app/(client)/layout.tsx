import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Authenticated client portal shell (Screen Inventory §2.2.x onward).
 *
 * Middleware already gates these routes, but this second check is deliberate: a
 * misconfigured matcher would silently open the whole group, and defence in depth at
 * the layout costs one query. The real app chrome — top bar and nav rail — arrives
 * with 2.2.1.
 */
export default async function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // In production this branch always runs — env.authChecksDisabledForLocalDev is false
  // there even when config is missing, so a misconfigured deploy 500s rather than
  // exposing the portal.
  if (!env.authChecksDisabledForLocalDev) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }

  return <div className="flex min-h-dvh flex-1 flex-col bg-bg">{children}</div>;
}
