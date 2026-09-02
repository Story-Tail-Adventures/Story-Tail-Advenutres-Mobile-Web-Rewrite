import { redirect } from "next/navigation";

/**
 * Root.
 *
 * Placeholder: the public landing page (Screen 2.0.1) lands in the (public) route
 * group later. Until then, send people to sign in.
 */
export default function Home() {
  redirect("/login");
}
