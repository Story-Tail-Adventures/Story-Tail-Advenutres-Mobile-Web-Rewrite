import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { NotFoundBody } from "./(public)/NotFoundBody";

/**
 * Root not-found — URLs that match no route at all. It renders inside the root layout only,
 * outside the public shell, so it is one centred column with the wordmark as the way home.
 * `.scheme-dark` is set on <html> by ThemeScript before paint, so bg-bg / text-on-bg switch
 * with the visitor's scheme; `.pub-surface` brings the public focus-ring and reduced-motion rules.
 */
export default function RootNotFound() {
  return (
    <main
      id="main"
      className="pub-surface flex min-h-dvh flex-1 flex-col items-center justify-center bg-bg px-4.5 py-16 text-center text-on-bg"
    >
      <Link href="/" aria-label="Story-Tail Adventures home" className="mb-8">
        <BrandMark size={120} alt="" />
      </Link>
      <div className="w-full max-w-160">
        <NotFoundBody />
      </div>
    </main>
  );
}
