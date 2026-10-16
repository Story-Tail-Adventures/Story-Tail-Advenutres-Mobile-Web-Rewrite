package com.storytail.adventures.domain.trip

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * §2.2.3's pay block. The site line is the client's one look at where a pay button goes
 * before they tap it, so most of these are about not being fooled.
 */
class PayLinksTest {

    @Test
    fun `the site is the host, lower-cased, without www`() {
        assertEquals("sandals.com", paySiteName("https://www.sandals.com/pay?ref=1"))
        assertEquals("sandals.com", paySiteName("https://WWW.Sandals.COM"))
        assertEquals("travefy.com", paySiteName("https://travefy.com/trip/abc/invoice#top"))
        // Only a LEADING www. goes; a subdomain is part of where the money goes.
        assertEquals("pay.royalcaribbean.com", paySiteName("https://pay.royalcaribbean.com/x"))
        assertEquals("www2.example.com", paySiteName("https://www2.example.com"))
    }

    @Test
    fun `port, userinfo and a trailing dot do not reach the line`() {
        assertEquals("sandals.com", paySiteName("https://sandals.com:8443/pay"))
        assertEquals("sandals.com", paySiteName("https://sandals.com./pay"))
    }

    @Test
    fun `userinfo cannot dress one site up as another`() {
        // The browser goes to the host AFTER the last @, so that is the one we name.
        assertEquals("evil.example", paySiteName("https://sandals.com@evil.example/pay"))
        assertEquals("evil.example", paySiteName("https://a@sandals.com@evil.example"))
    }

    @Test
    fun `a backslash ends the host the way a browser reads it`() {
        // Browsers treat \ as / in an https URL, so this goes to evil.example.
        assertEquals("evil.example", paySiteName("https://evil.example\\@sandals.com"))
    }

    @Test
    fun `a look-alike IDN shows as punycode, not as the site it imitates`() {
        // "sаndals.com" with a Cyrillic а (U+0430). In Unicode it looks exactly like Sandals.
        val lookAlike = "https://www.sаndals.com/pay"
        assertEquals("xn--sndals-3nf.com", paySiteName(lookAlike))
        assertEquals("xn--pypal-4ve.com", paySiteName("https://pаypal.com"))
    }

    @Test
    fun `punycode matches the RFC 3492 vectors`() {
        assertEquals("bcher-kva", punycodeEncode("bücher"))
        assertEquals("mnchen-3ya", punycodeEncode("münchen"))
        assertEquals("and-6ma2c", punycodeEncode("ñandú"))
        assertEquals("xn--mnchen-3ya.de", paySiteName("https://MÜNCHEN.de"))
    }

    @Test
    fun `anything but an https link with a host has no site, so no button`() {
        assertNull(paySiteName("http://sandals.com"))
        assertNull(paySiteName("javascript:alert(1)"))
        assertNull(paySiteName("https://"))
        assertNull(paySiteName("https:///pay"))
        assertNull(paySiteName("https://user@"))
        assertNull(paySiteName("sandals.com"))
        assertNull(paySiteName("https://sandals..com"))
    }

    @Test
    fun `the button is named from the label`() {
        assertEquals("Pay deposit", payActionLabel("Deposit"))
        assertEquals("Pay final balance", payActionLabel("Final balance"))
        assertEquals("Pay final balance", payActionLabel("  Final balance "))
        // Only the first letter lowers; a supplier's capitalised name stays as written.
        assertEquals("Pay second payment to Sandals", payActionLabel("Second payment to Sandals"))
    }

    @Test
    fun `the I have paid note names the payment and the amount`() {
        assertEquals("I've paid the final balance (\$4,180).", ivePaidMessage("Final balance", "\$4,180"))
        assertEquals("I've paid the deposit (\$800).", ivePaidMessage("Deposit", "\$800"))
    }

    @Test
    fun `the amount in the note is what is still open`() {
        assertEquals(318_000L, openAmountCents(418_000, 100_000))
        assertEquals(418_000L, openAmountCents(418_000, 0))
        // Nothing open by that sum (a data oddity): the full amount, never zero or negative.
        assertEquals(418_000L, openAmountCents(418_000, 418_000))
    }

    @Test
    fun `only an open milestone with a link is payable`() {
        assertTrue(isPayable("scheduled", "https://sandals.com"))
        assertTrue(isPayable("overdue", "https://sandals.com"))
        assertFalse(isPayable("paid", "https://sandals.com"))
        assertFalse(isPayable("waived", "https://sandals.com"))
        assertFalse(isPayable("scheduled", null))
    }

    @Test
    fun `the copy is exactly the contract wording`() {
        assertEquals("Paid directly to the supplier on their secure site.", PayLinkMessages.PAY_DIRECT)
        assertEquals("I've paid", PayLinkMessages.I_HAVE_PAID)
        assertEquals("Thanks. Gyasi will check and mark it paid.", PayLinkMessages.I_HAVE_PAID_THANKS)
        assertEquals(
            "No payments scheduled yet. Gyasi will add them here once your trip is booked.",
            PayLinkMessages.EMPTY_SCHEDULE,
        )
        assertEquals(
            "Say yes and Gyasi locks it in. Payments go straight to each supplier.",
            statusChangeNextSteps(TripStatus.PROPOSAL).last(),
        )
    }
}
