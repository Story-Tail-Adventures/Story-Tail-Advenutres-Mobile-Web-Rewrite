"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AGENT_WORKLIST_VIEWS, activeAgentViewId } from "@/lib/agent/nav";

/**
 * §3.2's three views, under one rail destination.
 *
 * Plain links with `aria-current`, no client state — the prototype treats Worklist, Pipeline
 * and Calendar as one `tab="home"` destination, and Gyasi took that shape provisionally on
 * 2026-09-19 (revisited at §3.3). Links rather than buttons so each view is shareable and
 * the back button means what it says.
 *
 * `"use client"` only for `usePathname`. Nothing crosses the boundary but the pathname.
 */
export function AgentViews() {
  const pathname = usePathname();
  const activeId = activeAgentViewId(pathname);

  return (
    <nav className="agent-views" aria-label="Worklist views">
      {AGENT_WORKLIST_VIEWS.map((v) => (
        <Link
          key={v.id}
          href={v.href}
          className="agent-view-link"
          aria-current={v.id === activeId ? "page" : undefined}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}
