import { PublicTopBar } from "@/components/public/PublicTopBar";

/** Pages with a solid sticky top bar at every width (How it works, results, gate, legal). */
export default function PlainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col">
      <PublicTopBar variant="solid" />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
