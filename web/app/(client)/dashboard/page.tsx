import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { BrandWordmark } from "@/components/brand/BrandWordmark";

export const metadata: Metadata = { title: "Your trips" };

/**
 * Placeholder for Screen 2.2.1 Client Dashboard / Home.
 *
 * Exists so 2.1.1 Login has somewhere to land and the redirect path is real. The
 * upcoming-trip hero, agent card and quick actions come with the real screen.
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <BrandWordmark size={32} />
      <h1 className="t-headline mt-6">You&rsquo;re signed in.</h1>
      <p className="t-body mt-2 text-on-surface-variant">
        Your dashboard is still coming together — your trips will live right here soon.
      </p>
      <Card className="mt-6 p-5">
        <div className="t-title-s">What&rsquo;s next</div>
        <p className="t-body-s mt-1 text-on-surface-variant">
          Your next trip, a quick line to your agent, and a few shortcuts.
        </p>
      </Card>
    </div>
  );
}
