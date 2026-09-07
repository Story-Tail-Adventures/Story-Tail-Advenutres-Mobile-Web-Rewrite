package com.storytail.adventures.domain.trip

/**
 * The four cross-cutting states Screen Inventory §5 requires of EVERY screen, as one type.
 *
 * Four states × eleven screens × two stacks is 88 implementations, and that is exactly how
 * they drift: the loading state on one screen grows a spinner, the error on another forgets
 * the escalation path, and nothing fails to compile. So it is one sealed interface here and
 * one set of primitives in `web/components/client/states.tsx`.
 *
 * [Unauthorized] is not decoration. An agent's `platform_user.client_id` is NULL, so every
 * §2.2 policy predicate evaluates NULL for them and returns zero rows — which without this
 * state renders as the friendly "no trips yet" empty state. That reads as data loss rather
 * than a wrong turn, which is the worst available outcome, and §5 asks for a real
 * permissions state instead.
 *
 * [Empty] carries its own copy because "no trips yet" and "no documents yet" are different
 * sentences and neither belongs in a shared string.
 */
sealed interface Loadable<out T> {

    /** In flight. Screens render a layout-shaped skeleton, never a spinner on blank (§5). */
    data object Loading : Loadable<Nothing>

    data class Ready<out T>(val value: T) : Loadable<T>

    /**
     * The read succeeded and there is nothing to show.
     *
     * Distinct from [Ready] with an empty list on purpose: a screen has to be able to tell
     * "you have no trips" from "here are your zero trips", because only one of those wants
     * a call to action.
     */
    data class Empty(val title: String, val body: String) : Loadable<Nothing>

    /**
     * The read failed. [detail] is for the log, never the screen — §5 forbids exposing
     * anything resembling a stack trace, and a Postgres message names tables.
     */
    data class Failed(val detail: String? = null) : Loadable<Nothing>

    /** Authenticated, but this is not the caller's view. */
    data object Unauthorized : Loadable<Nothing>
}

/** Convenience for the common `Ready` case. */
inline fun <T, R> Loadable<T>.map(transform: (T) -> R): Loadable<R> = when (this) {
    is Loadable.Ready -> Loadable.Ready(transform(value))
    is Loadable.Loading -> Loadable.Loading
    is Loadable.Empty -> this
    is Loadable.Failed -> this
    is Loadable.Unauthorized -> Loadable.Unauthorized
}

val Loadable<*>.valueOrNull: Any? get() = (this as? Loadable.Ready)?.value
