package com.storytail.adventures.api

import com.storytail.adventures.config.SupabaseConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.mfa.AuthenticatorAssuranceLevel
import io.github.jan.supabase.auth.mfa.FactorType
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/**
 * Everything the app needs from Supabase Auth.
 *
 * Session persistence and token refresh are supabase-kt's job (SharedPreferences on
 * Android, NSUserDefaults on iOS). When agent accounts land, swap in an
 * EncryptedSharedPreferences-backed session manager — agent sessions reach client PII.
 *
 * The web twin is the set of server actions under web/app/(auth)/ plus web/lib/auth/. The
 * rules that MUST hold on both sides are marked below; they are security properties, not
 * conventions, and getting one wrong on one platform is as bad as getting it wrong on both.
 */
interface AuthRepository {
    val sessionStatus: Flow<SessionStatus>

    suspend fun signInWithPassword(email: String, password: String): Result<Unit>

    /** Screen 2.1.2 Registration. */
    suspend fun signUp(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
    ): Result<SignUpOutcome>

    /** Screen 2.1.3 Email Verification — resend the confirmation link. */
    suspend fun resendVerification(email: String): Result<Unit>

    /** Screen 2.1.4 Forgot Password. */
    suspend fun requestPasswordReset(email: String): Result<Unit>

    /** Screen 2.1.5 Reset Password, on the recovery session. */
    suspend fun updatePassword(password: String): Result<Unit>

    /** Screen 2.1.6 MFA Setup — begin enrolling an authenticator app. */
    suspend fun enrollTotp(): Result<TotpEnrollment>

    /** Screens 2.1.6 and 2.1.7 — answer a challenge on [factorId]. */
    suspend fun verifyTotp(factorId: String, code: String): Result<Unit>

    /** Screen 2.1.7 — which factor the challenge screen should answer, if any. */
    suspend fun verifiedTotpFactorId(): String?

    /** How far through authentication this session is. Mirrors the web proxy's gate. */
    fun assurance(): Assurance

    suspend fun signOut(): Result<Unit>
}

/**
 * What a sign-up produced.
 *
 * ANTI-ENUMERATION, and this is the rule that matters: an address that already has an
 * account must produce [ConfirmEmail], exactly as a fresh sign-up awaiting confirmation
 * does. The web twin does the same in web/app/(auth)/register/actions.ts. Anything that
 * distinguishes the two hands somebody with a list of addresses a way to test which ones
 * are registered.
 */
sealed interface SignUpOutcome {
    /** Confirmations are off and a session already exists. */
    data object SignedIn : SignUpOutcome

    /** A link was mailed — or the address was already taken, which must look identical. */
    data class ConfirmEmail(val email: String) : SignUpOutcome
}

/** What Screen 2.1.6 shows so somebody can set up their authenticator app. */
data class TotpEnrollment(
    val factorId: String,
    /** SVG markup or a data URI, depending on which layer produced it. */
    val qrCode: String,
    /** The same secret in text, for anyone who cannot scan. */
    val secret: String,
    /** `otpauth://…` — on a phone this opens the authenticator app directly. */
    val uri: String,
)

/**
 * The three states of "signed in" once a second factor exists.
 *
 * Byte-for-byte the same distinction the web proxy makes in
 * web/lib/supabase/middleware.ts: a session can hold a valid password login and still have
 * no business reading anyone's trips.
 */
enum class Assurance {
    /** No verified second factor on the account. */
    NONE,

    /** A factor is enrolled and this session has not been challenged yet. */
    REQUIRED,

    /** The second factor was verified on this session. */
    SATISFIED,
}

/** Used when local.properties has no Supabase values yet, so the app still runs. */
class UnconfiguredAuthRepository : AuthRepository {
    override val sessionStatus: Flow<SessionStatus> =
        MutableStateFlow(SessionStatus.NotAuthenticated(false))

    override suspend fun signInWithPassword(email: String, password: String): Result<Unit> =
        notConfigured()

    override suspend fun signUp(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
    ): Result<SignUpOutcome> = notConfigured()

    override suspend fun resendVerification(email: String): Result<Unit> = notConfigured()

    override suspend fun requestPasswordReset(email: String): Result<Unit> = notConfigured()

    override suspend fun updatePassword(password: String): Result<Unit> = notConfigured()

    override suspend fun enrollTotp(): Result<TotpEnrollment> = notConfigured()

    override suspend fun verifyTotp(factorId: String, code: String): Result<Unit> = notConfigured()

    override suspend fun verifiedTotpFactorId(): String? = null

    override fun assurance(): Assurance = Assurance.NONE

    override suspend fun signOut(): Result<Unit> = Result.success(Unit)

    private fun <T> notConfigured(): Result<T> {
        // The screen shows client-facing wording; the actionable detail belongs here.
        println(
            "[auth] Supabase is not configured. Add supabase.url and supabase.anonKey " +
                "to mobile/local.properties — see mobile/local.properties.example.",
        )
        return Result.failure(AuthErrorException(AuthError.NotConfigured))
    }
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

    /**
     * EXACTLY first_name and last_name in the metadata.
     *
     * `handle_new_user()` trusts `raw_user_meta_data`, and signup is open, so anything else
     * put here is accepted by the database as fact. `agent_id` in particular would let a
     * self-registering user attach themselves to any active agent's book of business. The
     * web twin carries the same restriction and the same comment.
     */
    override suspend fun signUp(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
    ): Result<SignUpOutcome> {
        val address = email.trim()
        return runCatching {
            client.auth.signUpWith(Email) {
                this.email = address
                this.password = password
                this.data = buildJsonObject {
                    put("first_name", JsonPrimitive(firstName.trim()))
                    put("last_name", JsonPrimitive(lastName.trim()))
                }
            }
            if (client.auth.currentSessionOrNull() != null) SignUpOutcome.SignedIn
            else SignUpOutcome.ConfirmEmail(address)
        }.recoverCatching { cause ->
            // See SignUpOutcome: a taken address must be indistinguishable from a fresh
            // sign-up awaiting confirmation.
            if (cause.toAuthError() == AuthError.EmailTaken) SignUpOutcome.ConfirmEmail(address)
            else throw AuthErrorException(cause.toAuthError())
        }
    }

    /**
     * Reports success for an address with no account, deliberately.
     *
     * Same rule as [requestPasswordReset] and as the web twins: "no account with that
     * email" turns either form into an account-enumeration oracle. Rate limiting is the one
     * failure worth surfacing, because it explains a mail that is not going to arrive and
     * is a property of the request rather than of whether somebody has an account.
     */
    override suspend fun resendVerification(email: String): Result<Unit> =
        quietly { client.auth.resendEmail(OtpType.Email.SIGNUP, email.trim()) }

    override suspend fun requestPasswordReset(email: String): Result<Unit> =
        quietly { client.auth.resetPasswordForEmail(email.trim()) }

    override suspend fun updatePassword(password: String): Result<Unit> =
        runCatching { client.auth.updateUser { this.password = password } }
            .map { }
            .recoverCatching { throw AuthErrorException(it.toAuthError()) }

    /**
     * Sweeps abandoned unverified factors first.
     *
     * Every abandoned attempt leaves one behind, and after `max_enrolled_factors`
     * (supabase/config.toml, 10) enrollment starts failing for a reason nobody could guess
     * from the screen. Verified factors are never swept — one of those is somebody's
     * working second factor.
     */
    override suspend fun enrollTotp(): Result<TotpEnrollment> = runCatching {
        val verified = client.auth.mfa.verifiedFactors.map { it.id }.toSet()
        client.auth.mfa.retrieveFactorsForCurrentUser()
            .filter { it.id !in verified }
            .forEach { client.auth.mfa.unenroll(it.id) }

        val factor = client.auth.mfa.enroll(FactorType.TOTP)
        TotpEnrollment(
            factorId = factor.id,
            qrCode = factor.data.qrCode,
            secret = factor.data.secret,
            uri = factor.data.uri,
        )
    }.recoverCatching { throw AuthErrorException(it.toAuthError()) }

    override suspend fun verifyTotp(factorId: String, code: String): Result<Unit> =
        runCatching { client.auth.mfa.createChallengeAndVerify(factorId, code) }
            .map { }
            .recoverCatching { throw AuthErrorException(it.toAuthError()) }

    override suspend fun verifiedTotpFactorId(): String? =
        client.auth.mfa.verifiedFactors.firstOrNull { it.factorType == "totp" }?.id

    override fun assurance(): Assurance {
        val level = client.auth.mfa.getAuthenticatorAssuranceLevel()
        return when {
            level.current == AuthenticatorAssuranceLevel.AAL2 -> Assurance.SATISFIED
            level.next == AuthenticatorAssuranceLevel.AAL2 -> Assurance.REQUIRED
            else -> Assurance.NONE
        }
    }

    override suspend fun signOut(): Result<Unit> =
        runCatching { client.auth.signOut() }
            .recoverCatching { throw AuthErrorException(it.toAuthError()) }

    /**
     * Run [block], and report success unless the failure is one that is safe AND useful to
     * show. See [resendVerification] for why the default is silence.
     */
    private suspend fun quietly(block: suspend () -> Unit): Result<Unit> =
        runCatching { block() }.recoverCatching { cause ->
            when (val error = cause.toAuthError()) {
                AuthError.RateLimited, AuthError.NotConfigured -> throw AuthErrorException(error)
                else -> Unit
            }
        }
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
        message?.contains("user_already_exists", ignoreCase = true) == true ||
            message?.contains("email_exists", ignoreCase = true) == true ->
            AuthError.EmailTaken
        message?.contains("over_request_rate_limit", ignoreCase = true) == true ||
            message?.contains("over_email_send_rate_limit", ignoreCase = true) == true ||
            message?.contains("429") == true ->
            AuthError.RateLimited
        message?.contains("user_banned", ignoreCase = true) == true ->
            AuthError.AccountLocked
        message?.contains("weak_password", ignoreCase = true) == true ->
            AuthError.WeakPassword
        message?.contains("mfa_verification_failed", ignoreCase = true) == true ->
            AuthError.MfaCodeRejected
        // Deliberately Unknown, not InvalidCredentials. An unrecognised REST error is not
        // evidence the credentials were wrong, and saying so sends the user off to reset a
        // password that was fine — which is exactly what happened with weak_password before
        // it was mapped above.
        else -> AuthError.Unknown
    }
    else -> AuthError.Unknown
}

/**
 * Builds the app's single SupabaseClient, or the unconfigured stand-in.
 *
 * Only the ANON key is ever compiled into the app. The service-role key bypasses RLS and
 * must never leave the Edge Functions — see docs/Data-Model.md §21.2.
 */
object SupabaseClientProvider {
    private var cached: AuthRepository? = null
    private var cachedOnboarding: OnboardingRepository? = null

    /**
     * Builds the auth repository. **Call this off the main thread.**
     *
     * `createSupabaseClient` with the Auth plugin is not cheap: it reads the persisted
     * session from platform storage (SharedPreferences on Android) and starts the
     * token-refresh machinery. Constructing it inside composition pushed cold start to ~26s
     * on an emulator and tripped an ANR — measured, not theorised. `App()` builds it in a
     * LaunchedEffect on Dispatchers.Default and shows the splash route until it is ready.
     *
     * Cached because the client owns a session and a refresh loop; building a second one
     * would mean two of each.
     */
    suspend fun authRepository(): AuthRepository = withContext(Dispatchers.Default) {
        cached ?: run {
            build()
            cached!!
        }
    }

    /**
     * The onboarding writes, on the SAME client as [authRepository].
     *
     * One client, because it owns the session and the token-refresh loop — a second would
     * mean two of each, and the Edge Functions authenticate with the token this one holds.
     */
    suspend fun onboardingRepository(): OnboardingRepository =
        withContext(Dispatchers.Default) {
            cachedOnboarding ?: run {
                build()
                cachedOnboarding!!
            }
        }

    private fun build() {
        if (!SupabaseConfig.isConfigured) {
            cached = UnconfiguredAuthRepository()
            cachedOnboarding = UnconfiguredOnboardingRepository()
            return
        }
        val client = createSupabaseClient(
            supabaseUrl = SupabaseConfig.URL,
            supabaseKey = SupabaseConfig.ANON_KEY,
        ) {
            install(Auth)
            install(Postgrest)
            install(Functions)
        }
        cached = SupabaseAuthRepository(client)
        cachedOnboarding = SupabaseOnboardingRepository(client)
    }
}
