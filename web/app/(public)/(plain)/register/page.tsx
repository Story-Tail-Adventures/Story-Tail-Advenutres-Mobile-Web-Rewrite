import { redirect } from "next/navigation";

/**
 * Screen 2.1.2 Registration is not built yet, but 2.1.1 Login already links here. Until it
 * ships, registration happens through the public sign-up gate (Screen 2.0.6, /join), which
 * carries the same form. Keep this a redirect rather than a second form.
 */
export default function RegisterPage() {
  redirect("/join");
}
