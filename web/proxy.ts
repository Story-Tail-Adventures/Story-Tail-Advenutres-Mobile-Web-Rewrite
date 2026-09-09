import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs on every request: refreshes the Supabase session and gates the protected route
 * groups. See web/lib/supabase/middleware.ts for the logic.
 *
 * This is the `proxy` file convention, not `middleware` — Next.js 16 deprecated and renamed
 * `middleware.ts` to `proxy.ts`, and the exported function with it. (The helper module keeps
 * the name `middleware.ts` because that is what @supabase/ssr's own docs call it.)
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Running on image requests
     * would burn an auth round-trip per asset.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
