package com.storytail.adventures.api

import com.storytail.adventures.config.SupabaseConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext

/**
 * Everything the app needs from Supabase Auth.
 *
 * Session persistence and token refresh are supabase-kt's job (SharedPreferences on
 * Android, NSUserDefaults on iOS). When agent accounts land, swap in an
 * EncryptedSharedPreferences-backed session manager — agent sessions reach client PII.
 */
interface AuthRepository {
    val sessionStatus: Flow<SessionStatus>
    suspend fun signInWithPassword(email: String, password: String): Result<Unit>
    suspend fun signOut(): Result<Unit>
}

/** Used when local.properties has no Supabase values yet, so the app still runs. */
class UnconfiguredAuthRepository : AuthRepository {
    override val sessionStatus: Flow<SessionStatus> =
        MutableStateFlow(SessionStatus.NotAuthenticated(false))

    override suspend fun signInWithPassword(email: String, password: String): Result<Unit> {
        // The screen shows client-facing wording; the actionable detail belongs here.
        println(
            "[auth] Supabase is not configured. Add supabase.url and supabase.anonKey " +
                "to mobile/local.properties — see mobile/local.properties.example.",
        )
        return Result.failure(AuthErrorException(AuthError.NotConfigured))
    }

    override suspend fun signOut(): Result<Unit> = Result.success(Unit)
}

class SupabaseAuthRepository(private val client: SupabaseClient) : AuthRepository {

    override val sessionStatus: Flow<SessionStatus> = client.auth.sessionStatus

    override suspend fun signInWithPassword(email: String, password: String): Result<Unit> =
        runCatching {
            client.auth.signInWith(Email) {
                this.email = email.trim()
                this.password = password
            }
        }.recoverCatching { throw AuthErrorException(it.toAuthError()) }

    override suspend fun signOut(): Result<Unit> =
        runCatching { client.auth.signOut() }
            .recoverCatching { throw AuthErrorException(it.toAuthError()) }
}

/** Carries a mapped, user-presentable error out of a failed Result. */
class AuthErrorException(val error: AuthError) : Exception(error.message)

/** Pull the mapped error back out of any Result failure from this layer. */
fun Throwable.asAuthError(): AuthError =
    (this as? AuthErrorException)?.error ?: toAuthError()

internal fun Throwable.toAuthError(): AuthError = when (this) {
    is AuthErrorException -> error
    is HttpRequestException -> AuthError.Network
    is RestException -> when {
        // supabase-kt surfaces the GoTrue error_code in the message body.
        message?.contains("invalid_credentials", ignoreCase = true) == true ||
            message?.contains("invalid_grant", ignoreCase = true) == true ->
            AuthError.InvalidCredentials
        message?.contains("email_not_confirmed", ignoreCase = true) == true ->
            AuthError.EmailNotConfirmed
        message?.contains("over_request_rate_limit", ignoreCase = true) == true ||
            message?.contains("429") == true ->
            AuthError.RateLimited
        message?.contains("user_banned", ignoreCase = true) == true ->
            AuthError.AccountLocked
        message?.contains("weak_password", ignoreCase = true) == true ->
            AuthError.WeakPassword
        // Deliberately Unknown, not InvalidCredentials. An unrecognised REST error is
        // not evidence the credentials were wrong, and saying so sends the user off to
        // reset a password that was fine — which is exactly what happened with
        // weak_password before it was mapped above.
        else -> AuthError.Unknown
    }
    else -> AuthError.Unknown
}

/**
 * Builds the app's single SupabaseClient, or the unconfigured stand-in.
 *
 * Only the ANON key is ever compiled into the app. The service-role key bypasses RLS
 * and must never leave the Edge Functions — see docs/Data-Model.md §21.2.
 */
object SupabaseClientProvider {
    private var cached: AuthRepository? = null

    /**
     * Builds the auth repository. **Call this off the main thread.**
     *
     * `createSupabaseClient` with the Auth plugin is not cheap: it reads the persisted
     * session from platform storage (SharedPreferences on Android) and starts the
     * token-refresh machinery. Constructing it inside composition pushed cold start to
     * ~26s on an emulator and tripped an ANR — measured, not theorised. `App()` builds it
     * in a LaunchedEffect on Dispatchers.Default and shows the splash route until it is
     * ready.
     *
     * Cached because the client owns a session and a refresh loop; building a second one
     * would mean two of each.
     */
    suspend fun authRepository(): AuthRepository = withContext(Dispatchers.Default) {
        cached ?: run {
            val repo = if (!SupabaseConfig.isConfigured) {
                UnconfiguredAuthRepository()
            } else {
                SupabaseAuthRepository(
                    createSupabaseClient(
                        supabaseUrl = SupabaseConfig.URL,
                        supabaseKey = SupabaseConfig.ANON_KEY,
                    ) {
                        install(Auth)
                        install(Postgrest)
                    }
                )
            }
            cached = repo
            repo
        }
    }
}
