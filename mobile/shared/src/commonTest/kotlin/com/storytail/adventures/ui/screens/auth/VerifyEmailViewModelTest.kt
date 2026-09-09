package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.FakeAuthRepository
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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class VerifyEmailViewModelTest {

    @BeforeTest
    fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun resends_to_the_address_the_route_carried() = runTest {
        // There is no session to read it from — GoTrue withholds one until the address is
        // confirmed — so the route is the only place this can come from.
        val auth = FakeAuthRepository()
        val vm = VerifyEmailViewModel(auth, "jordan.hayes@example.com")

        vm.resend()
        advanceUntilIdle()

        assertEquals("jordan.hayes@example.com", auth.lastEmail)
        assertTrue(vm.state.value.resent)
        assertFalse(vm.state.value.isResending)
    }

    @Test
    fun does_nothing_when_it_has_no_address_to_send_to() = runTest {
        // A cold start on an unconfirmed account reaches this screen with no address. The
        // button is disabled for it, but the ViewModel must not depend on the button.
        val auth = FakeAuthRepository()
        val vm = VerifyEmailViewModel(auth, null)

        vm.resend()
        advanceUntilIdle()

        assertNull(auth.lastEmail)
        assertFalse(vm.state.value.resent)
    }

    @Test
    fun a_failed_resend_says_so_rather_than_claiming_success() = runTest {
        val auth = FakeAuthRepository(resendResult = Result.failure(IllegalStateException()))
        val vm = VerifyEmailViewModel(auth, "jordan.hayes@example.com")

        vm.resend()
        advanceUntilIdle()

        assertNotNull(vm.state.value.formError)
        assertFalse(vm.state.value.resent)
    }

    @Test
    fun signs_out_before_leaving_for_the_sign_in_screen() = runTest {
        // Usually a no-op with confirmations on, but "usually" is not "always": a cold start
        // on an unconfirmed account can carry a session, and leaving it behind is how
        // somebody lands on a form they are already past.
        val auth = FakeAuthRepository()
        val vm = VerifyEmailViewModel(auth, "jordan.hayes@example.com")

        vm.onSignOut()
        val event = vm.events.first()
        advanceUntilIdle()

        assertEquals(1, auth.signOutCount)
        assertEquals(VerifyEmailEvent.NavigateToSignIn, event)
    }
}
