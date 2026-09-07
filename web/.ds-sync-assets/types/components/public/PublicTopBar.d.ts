export type TopBarVariant = "solid" | "overlay";
/**
 * 56px public top bar (design: ScreenTopBar role="public"; mobile: MTopBar).
 *
 * `solid` — cream/navy bar, sticky at every width (About, results, gate, legal).
 * `overlay` — below `md` the bar floats transparent over the page's hero photo with white
 * text (landing, topic pages, explore, detail); from `md` it is the same solid sticky bar.
 *
 * The right cluster is static ("Sign in" / "Create account") because the public layout
 * never reads cookies — that is what keeps every public page prerenderable. Signed-in
 * visitors who click through are bounced by the proxy.
 */
export declare function PublicTopBar({ variant }: {
    variant?: TopBarVariant;
}): import("react").JSX.Element;
