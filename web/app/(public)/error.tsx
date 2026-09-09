"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Container } from "@/components/public/Container";
import { PublicTopBar } from "@/components/public/PublicTopBar";
import { Button } from "@/components/ui/Button";
import { SOMETHING_WENT_WRONG } from "./fallback-content";

interface PublicErrorProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the segment (Next 16.3+). Preferred. */
  retry?: () => void;
  /** Clears the boundary without re-fetching — the older API, kept as the fallback. */
  reset: () => void;
}

/**
 * Error boundary for the public surface (Screen Inventory §5 error state). A Client Component by
 * Next's convention. Never renders `error.message`: server errors arrive as a generic string plus
 * a digest, and a client error's text is not something a visitor needs to read. Like not-found,
 * it replaces the nested layouts' children, so it carries its own top bar and `<main>`.
 */
export default function PublicError({ error, retry, reset }: PublicErrorProps) {
  useEffect(() => {
    // For matching against server logs; nothing from the error reaches the page.
    console.error("Public page error", error.digest ?? error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col">
      <PublicTopBar variant="solid" />
      <main id="main" className="flex flex-1 flex-col">
        <Container size="prose" className="py-16 text-center">
          <h1 className="t-page-title text-on-surface">{SOMETHING_WENT_WRONG.title}</h1>
          <p className="t-body-l mx-auto mt-3 max-w-120 text-on-surface-variant">{SOMETHING_WENT_WRONG.body}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2.5 md:flex-row">
            <Button variant="filled" className="w-full md:w-auto" onClick={() => (retry ?? reset)()}>
              {SOMETHING_WENT_WRONG.retry}
            </Button>
            <Link href={SOMETHING_WENT_WRONG.message.href} className="btn btn-text">
              {SOMETHING_WENT_WRONG.message.label}
            </Link>
          </div>
        </Container>
      </main>
    </div>
  );
}
