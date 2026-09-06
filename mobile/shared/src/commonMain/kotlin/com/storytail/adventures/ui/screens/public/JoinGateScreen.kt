// Screen 2.0.6 Sign-up Gate / Quote Request Prompt — see docs/Screen-Inventory.md §2.0.6
// and §4.4 ("Pattern J. Mobile uses full-height bottom sheet"), plus
// design/source-prototype/screens/client-public-mobile.jsx (M206_SignUpGate). P2.
//
// The artboard inlines a whole registration form — name, email, password, social buttons.
// This screen does not, and that is its one deliberate deviation: the app already has 2.1.2
// Register, carrying the password strength meter, the terms checkbox, autofill content
// types and the confirm-email outcome. A second sign-up form here would be a second copy of
// all of that to keep in step. So the gate keeps the half it exists for — saying WHY an
// account is suddenly needed — and hands the typing to the screen built for it, with
// AppRoute.PublicJoin's intent and trip carried through.
package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicTapTarget
import com.storytail.adventures.ui.components.public.SectionLabel
import com.storytail.adventures.ui.theme.LocalStoryTailExtended
import com.storytail.adventures.ui.theme.PillShape

/**
 * The moment a browsing visitor is asked for an account.
 *
 * [intent] is the allowlisted reason they arrived — "quote", "save", "message" or "tour",
 * matching web/lib/public/links.ts. Anything else falls through to the neutral headline, so
 * a value nobody planned for cannot change what this screen says.
 *
 * [tripName] is the CATALOG name the caller resolved from `PublicJoin.tripSlug`, never a
 * raw parameter. It is printed in the headline, and printing something a visitor typed
 * would be putting their words in Gyasi's mouth.
 *
 * [onContinueAsGuest] is the Phase 1 prefilled-email path (Screen Inventory 2.0.5's phase
 * note — the Lead entity is P2). It creates nothing, which is why the line under it says so
 * rather than letting "continue" imply a saved trip is waiting.
 */
@Composable
fun JoinGateScreen(
    intent: String,
    tripName: String?,
    onCreateAccount: () -> Unit,
    onSignIn: () -> Unit,
    onContinueAsGuest: () -> Unit,
    onDismiss: () -> Unit,
) {
    val extended = LocalStoryTailExtended.current
    // The artboard's burgundy glow behind the headline. Read from the scheme rather than
    // the brand token because the dark scheme moves primary to ocean blue on purpose, and a
    // hardcoded burgundy wash sits muddy on the navy surface. Nothing is drawn on top of
    // it, so unlike a hero scrim it has no reason to be scheme-independent.
    val glow = MaterialTheme.colorScheme.primary

    Surface(color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                // Ahead of the inset padding, so the glow fills the sheet edge to edge.
                .drawBehind {
                    drawRect(
                        Brush.radialGradient(
                            colors = listOf(glow.copy(alpha = 0.16f), Color.Transparent),
                            center = Offset(size.width / 2f, size.height * 0.25f),
                            radius = size.width * 0.9f,
                        ),
                    )
                }
                // Taking both insets here also CONSUMES them, so PlaceholderBanner's own
                // statusBarsPadding resolves to zero instead of stacking a second gap.
                .statusBarsPadding()
                .navigationBarsPadding(),
        ) {
            PlaceholderBanner()

            // Pattern J puts the dismiss top-left. No wordmark and no menu: this is an
            // interrupt over whatever they were reading, and offering the five public
            // destinations here would invite them to wander off rather than decide.
            Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 2.dp)) {
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.heightIn(min = PublicTapTarget).width(PublicTapTarget),
                ) {
                    // A glyph rather than an icon — no icon set is bundled yet, the same
                    // reason PublicTopBar draws its own. "✕" is not a label, so the
                    // description replaces it rather than being read after it.
                    Text(
                        text = "✕",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clearAndSetSemantics {
                            contentDescription = "Close and keep browsing"
                        },
                    )
                }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 18.dp)
                    .padding(bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SectionLabel("ALMOST THERE")
                Text(
                    text = gateTitle(intent, tripName),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = "Takes about 60 seconds. You'll get a real proposal back — " +
                        "not a generic search dump.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    GateBullets.forEach { bullet ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            // Decorative: the sentence beside it already says everything,
                            // and three announced check marks are three interruptions.
                            Text(
                                text = "✓",
                                style = MaterialTheme.typography.bodyMedium,
                                color = extended.success,
                                modifier = Modifier.clearAndSetSemantics {},
                            )
                            Text(
                                text = bullet,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
            }

            // Pinned outside the scroll — Pattern J's "persistent bottom button" — but drawn
            // on the sheet's own background rather than a tinted bar. M206 has no bar, and
            // one would make an interrupt read like a content page with a CTA docked to it.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp)
                    .padding(top = 6.dp, bottom = 10.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                // "Create an account", not the web twin's "Create account & send my
                // request": this tap opens the registration form, and naming an outcome it
                // does not produce is a small lie at the highest-trust moment on the screen.
                Button(
                    onClick = onCreateAccount,
                    shape = PillShape,
                    modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
                ) {
                    Text("Create an account")
                }
                TextButton(
                    onClick = onSignIn,
                    modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
                ) {
                    Text("Already have an account? Sign in")
                }
                // Quieter than the other two on purpose: it is a real way out, not the way
                // the screen is pushing.
                TextButton(
                    onClick = onContinueAsGuest,
                    modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
                ) {
                    Text(
                        text = "Continue as guest",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = "Opens an email to Gyasi. Nothing is saved on your end until " +
                        "you have an account.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** Verbatim from the web gate (web/app/(public)/(plain)/join/state.ts), so the two agree. */
private val GateBullets = listOf(
    "Save searches & favorites",
    "View Gyasi's curated proposals",
    "Authorize cards securely · paid to suppliers, not us",
)

/**
 * The headline, by why they got here.
 *
 * Naming the trip is the whole point of a contextual gate: "keep Sandals Grande St. Lucian
 * for later" is a reason, where "save this for later" is a form appearing unannounced. The
 * web twin drops the name in the save case; this keeps it, because the caller resolved it
 * from the catalog and a catalog name is safe to print.
 */
private fun gateTitle(intent: String, tripName: String?): String = when (intent) {
    "quote" ->
        if (tripName != null) "Create an account to send Gyasi your trip details for $tripName."
        else "Create an account to send Gyasi your trip details."
    "save" ->
        if (tripName != null) "Create an account to keep $tripName for later."
        else "Create an account to save this for later."
    "message" -> "Almost there — tell Gyasi what you're dreaming about."
    else -> "Create an account to start planning with Gyasi."
}
