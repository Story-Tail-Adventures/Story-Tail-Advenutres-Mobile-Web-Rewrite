/**
 * The Google / Apple pair at the top of 2.1.1, 2.1.2 and 2.0.6.
 *
 * A server component: the buttons submit the surrounding form to
 * `signInWithProviderAction` through `formAction`, so they work with JavaScript off and
 * carry the form's `next` field along without any client state.
 *
 * The provider is bound into the action rather than posted as `name`/`value` on the
 * button. React puts the action's own identity in that `name` attribute, so a name of our
 * own is silently overwritten — see the note on `signInWithProviderAction`.
 *
 * `formNoValidate` matters more than it looks. These sit inside a form whose email and
 * password inputs are `required`; without it, clicking "Continue with Google" trips HTML
 * validation on fields the person deliberately did not fill in, and the browser refuses to
 * submit while pointing at an input they have no reason to touch.
 */
export declare function SocialButtons({ googleEnabled, appleEnabled, googleLabel, appleLabel, disabledTitle, }: {
    googleEnabled: boolean;
    appleEnabled: boolean;
    googleLabel: string;
    appleLabel: string;
    disabledTitle: string;
}): import("react").JSX.Element;
