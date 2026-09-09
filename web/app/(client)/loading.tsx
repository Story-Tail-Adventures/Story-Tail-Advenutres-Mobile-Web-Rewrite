import { ScreenSkeleton } from "@/components/client/states";

/**
 * The §5 loading state for every authenticated client route.
 *
 * A skeleton that matches the screen's layout, not a spinner — §5 rules out
 * spinner-on-blank explicitly, and every §2.2 screen except the thread opens on a title
 * plus a hero plus cards, which is what this traces.
 *
 * Note this renders AFTER the layout's auth and onboarding queries resolve, because the
 * layout blocks on them deliberately — see the comment in layout.tsx about why the chrome
 * is not hoisted above the gate. Those are two indexed single-row reads; the wait this
 * covers is the page's own data.
 */
export default function ClientLoading() {
  return <ScreenSkeleton />;
}
