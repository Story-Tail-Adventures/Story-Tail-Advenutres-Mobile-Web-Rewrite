package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.FakeAuthRepository
import com.storytail.adventures.domain.validation.AuthValidation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ForgotPasswordViewModelTest {

    @BeforeTest
    fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun reports_the_same_thing_whether_or_not_the_address_has_an_account() = runTest {
        // The repository cannot tell us, and must not: GoTrue answers a request for an
        // unknown address exactly as it answers a known one. If this screen ever branched
        // on that, the form would become a way to test a list of addresses.
        val auth = FakeAuthRepository()
        val vm = ForgotPasswordViewModel(auth)
        vm.onEmailChange(" nobody@example.com ")

        vm.submit()
        advanceUntilIdle()

        assertTrue(vm.state.value.sent)
        assertNull(vm.state.value.formError)
        assertEquals("nobody@example.com", auth.lastEmail)
    }

    @Test
    fun refuses_an_address_that_is_not_one() = runTest {
        val auth = FakeAuthRepository()
        val vm = ForgotPasswordViewModel(auth)
        vm.onEmailChange("not-an-email")

        vm.submit()
        advanceUntilIdle()

        assertEquals(AuthValidation.Messages.EMAIL_INVALID, vm.state.value.emailError)
        assertNull(auth.lastEmail)
        assertFalse(vm.state.value.sent)
    }

    @Test
    fun a_transport_failure_is_NOT_swallowed_by_the_uniform_answer() = runTest {
        // "We couldn't reach the mail server" is about us, not about whether they have an
        // account. Hiding it behind the anti-enumeration panel would leave somebody waiting
        // for a message nobody sent.
        val auth = FakeAuthRepository(resetResult = Result.failure(IllegalStateException()))
        val vm = ForgotPasswordViewModel(auth)
        vm.onEmailChange("jordan.hayes@example.com")

        vm.submit()
        advanceUntilIdle()

        assertNotNull(vm.state.value.formError)
        assertFalse(vm.state.value.sent)
    }
}
