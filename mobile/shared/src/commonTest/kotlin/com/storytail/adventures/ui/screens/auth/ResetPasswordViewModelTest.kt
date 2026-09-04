package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.FakeAuthRepository
import com.storytail.adventures.domain.validation.RegistrationValidation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ResetPasswordViewModelTest {

    @BeforeTest
    fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun applies_the_full_policy_here_and_not_the_sign_in_rule() = runTest {
        // Sign-in checks presence only, deliberately. This is setting a credential, so the
        // twelve-character policy applies — the same rule registration uses.
        val auth = FakeAuthRepository()
        val vm = ResetPasswordViewModel(auth)
        vm.onPasswordChange("short")
        vm.onConfirmPasswordChange("short")

        vm.submit()
        advanceUntilIdle()

        assertNotNull(vm.state.value.passwordError)
        assertNull(auth.lastPassword)
    }

    @Test
    fun reports_a_mismatch_on_the_confirmation_and_not_on_the_password() = runTest {
        val vm = ResetPasswordViewModel(FakeAuthRepository())
        vm.onPasswordChange("GreenPastures1")
        vm.onConfirmPasswordChange("GreenPastures2")

        vm.submit()
        advanceUntilIdle()

        // The field somebody is looking at is the one they just typed; marking the first
        // one red suggests the first one is wrong.
        assertEquals(
            RegistrationValidation.Messages.CONFIRM_MISMATCH,
            vm.state.value.confirmPasswordError,
        )
        assertNull(vm.state.value.passwordError)
    }

    @Test
    fun forgets_the_password_once_it_has_been_saved() = runTest {
        // The state object holds a plaintext password and a ViewModel outlives the screen
        // that made it.
        val auth = FakeAuthRepository()
        val vm = ResetPasswordViewModel(auth)
        vm.onPasswordChange("GreenPastures1")
        vm.onConfirmPasswordChange("GreenPastures1")

        vm.submit()
        val event = vm.events.first()
        advanceUntilIdle()

        assertEquals(ResetPasswordEvent.NavigateToDashboard, event)
        assertEquals("", vm.state.value.password)
        assertEquals("", vm.state.value.confirmPassword)
        assertEquals("GreenPastures1", auth.lastPassword)
    }

    @Test
    fun keeps_what_was_typed_when_the_save_fails() = runTest {
        val auth = FakeAuthRepository(
            updatePasswordResult = Result.failure(IllegalStateException()),
        )
        val vm = ResetPasswordViewModel(auth)
        vm.onPasswordChange("GreenPastures1")
        vm.onConfirmPasswordChange("GreenPastures1")

        vm.submit()
        advanceUntilIdle()

        assertNotNull(vm.state.value.formError)
        assertEquals("GreenPastures1", vm.state.value.password)
    }
}
