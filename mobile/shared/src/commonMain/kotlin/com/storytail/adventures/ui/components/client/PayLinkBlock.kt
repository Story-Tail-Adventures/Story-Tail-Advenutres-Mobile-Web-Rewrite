package com.storytail.adventures.ui.components.client

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.storytail.adventures.domain.trip.PayLinkMessages
import com.storytail.adventures.domain.trip.payActionLabel
import com.storytail.adventures.domain.trip.paySiteName
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark

/** Where one milestone's "I've paid" note stands. It never describes the milestone itself. */
enum class IvePaidState { IDLE, SENDING, SENT, FAILED }

/**
 * §2.2.3's pay block, the artboard's `MPayLink` (client-trip-mobile.jsx). Calm by design: no
 * countdown, no red, one tap to the supplier's own site, opened in the BROWSER through the
 * platform [LocalUriHandler] and never inside the app, so the address bar the client
 * checks is the supplier's.
 *
 * Renders nothing when [payUrl] has no readable https host (see [paySiteName]): a button
 * to a place we cannot name is not one to offer. Callers decide payability first
 * (`isPayable`), so a paid or waived milestone never reaches here.
 *
 * "I've paid" only posts a note in the trip thread through `trip-message`; the advisor marks
 * the milestone paid once it is checked with the supplier (§3.6.5).
 */
@Composable
fun PayLinkBlock(
    label: String,
    payUrl: String,
    ivePaid: IvePaidState,
    onIvePaid: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val site = paySiteName(payUrl) ?: return
    val scheme = MaterialTheme.colorScheme
    val uriHandler = LocalUriHandler.current
    Column(modifier.fillMaxWidth()) {
        Button(
            // The stored URL as written, not a re-serialised one: the site line already
            // shows its host in punycode, and the browser does its own IDN handling.
            onClick = { runCatching { uriHandler.openUri(payUrl) } },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(payActionLabel(label))
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoryTailGlyph(StoryTailMark.LOCK, 12.dp, scheme.onSurfaceVariant)
            Spacer(Modifier.width(6.dp))
            Text(
                site,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = scheme.onSurface,
            )
        }
        Spacer(Modifier.height(2.dp))
        Text(
            PayLinkMessages.PAY_DIRECT,
            style = MaterialTheme.typography.bodySmall,
            color = scheme.onSurfaceVariant,
        )
        when (ivePaid) {
            IvePaidState.SENT -> {
                Spacer(Modifier.height(8.dp))
                Text(
                    PayLinkMessages.I_HAVE_PAID_THANKS,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurface,
                )
            }

            IvePaidState.IDLE, IvePaidState.SENDING, IvePaidState.FAILED -> {
                TextButton(
                    onClick = onIvePaid,
                    enabled = ivePaid != IvePaidState.SENDING,
                    contentPadding = PaddingValues(horizontal = 0.dp, vertical = 4.dp),
                ) {
                    Text(PayLinkMessages.I_HAVE_PAID)
                }
                if (ivePaid == IvePaidState.FAILED) {
                    Text(
                        PayLinkMessages.I_HAVE_PAID_FAILED,
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.error,
                    )
                }
            }
        }
    }
}
