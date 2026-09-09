package com.storytail.adventures.api

import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * A recording stand-in for [AuthRepository], shared by every auth ViewModel test.
 *
 * One fake rather than one per test class, because the interface grows with each screen in
 * Screen Inventory §2.1 and a private fake in each file means every one of them breaks
 * whenever a method is added. Each operation has an overridable result and records what it
 * was called with, so a test asserts on the call rather than on a mock framework.
 */
class FakeAuthRepository(
    var signInResult: Result<Unit> = Result.success(Unit),
    var signUpResult: Result<SignUpOutcome> = Result.success(SignUpOutcome.SignedIn),
    var resendResult: Result<Unit> = Result.success(Unit),
    var resetResult: Result<Unit> = Result.success(Unit),
    var updatePasswordResult: Result<Unit> = Result.success(Unit),
    var enrollResult: Result<TotpEnrollment> = Result.success(
        TotpEnrollment(
            factorId = "factor-1",
            qrCode = "data:image/svg+xml;utf-8,<svg></svg>",
            secret = "SECRET",
            uri = "otpauth://totp/example",
        ),
    ),
    var verifyTotpResult: Result<Unit> = Result.success(Unit),
    var verifiedFactorId: String? = null,
    var assurance: Assurance = Assurance.NONE,
) : AuthRepository {

    var lastEmail: String? = null
        private set
    var lastPassword: String? = null
        private set
    var lastSignUpNames: Pair<String, String>? = null
        private set
    var lastVerifiedCode: Pair<String, String>? = null
        private set
    var signOutCount: Int = 0
        private set

    override val sessionStatus: Flow<SessionStatus> =
        MutableStateFlow(SessionStatus.NotAuthenticated(false))

    override suspend fun signInWithPassword(email: String, password: String): Result<Unit> {
        lastEmail = email
        lastPassword = password
        return signInResult
    }

    override suspend fun signUp(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
    ): Result<SignUpOutcome> {
        lastEmail = email
        lastPassword = password
        lastSignUpNames = firstName to lastName
        return signUpResult
    }

    override suspend fun resendVerification(email: String): Result<Unit> {
        lastEmail = email
        return resendResult
    }

    override suspend fun requestPasswordReset(email: String): Result<Unit> {
        lastEmail = email
        return resetResult
    }

    override suspend fun updatePassword(password: String): Result<Unit> {
        lastPassword = password
        return updatePasswordResult
    }

    override suspend fun enrollTotp(): Result<TotpEnrollment> = enrollResult

    override suspend fun verifyTotp(factorId: String, code: String): Result<Unit> {
        lastVerifiedCode = factorId to code
        return verifyTotpResult
    }

    override suspend fun verifiedTotpFactorId(): String? = verifiedFactorId

    override fun assurance(): Assurance = assurance

    override suspend fun signOut(): Result<Unit> {
        signOutCount++
        return Result.success(Unit)
    }
}
