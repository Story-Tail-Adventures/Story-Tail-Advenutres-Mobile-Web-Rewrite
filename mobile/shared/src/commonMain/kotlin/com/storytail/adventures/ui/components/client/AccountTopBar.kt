package com.storytail.adventures.ui.components.client

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.theme.PillShape

/**
 * The chrome the §2.5 sub-screens wear — `MAccountTopBar` in
 * `design/source-prototype/screens/client-account-mobile.jsx`.
 *
 * Every §2.5 screen except the tab root is PUSHED, so it gets a back affordance and no tab
 * bar; 2.5.1 is the Account tab's root and gets the reverse. That split is the artboards':
 * `M251_AccountOverview` passes `MClientTabs` as its footer and every other frame passes a
 * save bar or nothing.
 *
 * The back control is a 40dp box inside a 56dp bar, which is under the 48dp floor §4.2 asks
 * for, so the touch target is widened to 48 rather than the glyph — the bar's own height is
 * the artboard's and moving it would push every screen's content down 8dp.
 */
@Composable
fun AccountTopBar(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    /**
     * What the back control is announced as.
     *
     * A drawn glyph carries NO text, so without this a screen reader reads the control as an
     * unnamed button — the artboard's own `aria-label="Back"` is the same acknowledgement.
     * Screens whose back goes somewhere non-obvious name it: 2.5.10 is reached from 2.5.9
     * rather than from the hub, so "Privacy & data" tells the reader where they are going.
     */
    backLabel: String = "Back",
    trailing: (@Composable () -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme

    Column(modifier.fillMaxWidth().background(scheme.background)) {
        Row(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(start = 6.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier
                    .size(48.dp)
                    .clickable(
                        role = Role.Button,
                        onClickLabel = backLabel,
                        onClick = onBack,
                    )
                    .semantics { contentDescription = backLabel },
                contentAlignment = Alignment.Center,
            ) {
                StoryTailGlyph(StoryTailMark.ARROW_LEFT, 19.dp, scheme.onSurface)
            }
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            trailing?.invoke()
        }
        HorizontalDivider(color = scheme.outlineVariant)
    }
}

/**
 * The tone an [InitialsAvatar] wears.
 *
 * Spelled out rather than templated over role names. The artboard tried
 * `var(--md-${tone}-container)` and `surface` produced `--md-surface-container`, which does
 * not exist — CSS drops an undefined custom property silently, so the tab root's avatar
 * rendered with no fill at all against a gradient that hid it. Only the M3 accent roles have
 * a container pair. Kotlin would not have compiled the same mistake, but the enum is what
 * keeps the two sides describing the same four tones.
 */
enum class AvatarTone { SURFACE, PRIMARY, SECONDARY, TERTIARY }

/**
 * Initials in a circle — never a photograph.
 *
 * `web/lib/images.ts` has no avatar entries, so every `staImg('avatar*')` in the artboards
 * is a stock portrait of a stranger; departure 7 records it. The initials themselves come
 * from `domain/auth/initialsFor`, which filters the `New Traveler` placeholders per field.
 */
@Composable
fun InitialsAvatar(
    initials: String,
    modifier: Modifier = Modifier,
    size: Dp = 64.dp,
    tone: AvatarTone = AvatarTone.PRIMARY,
) {
    val scheme = MaterialTheme.colorScheme
    val background: Color
    val foreground: Color
    when (tone) {
        AvatarTone.SURFACE -> {
            background = scheme.surface
            foreground = scheme.onSurface
        }
        AvatarTone.PRIMARY -> {
            background = scheme.primaryContainer
            foreground = scheme.onPrimaryContainer
        }
        AvatarTone.SECONDARY -> {
            background = scheme.secondaryContainer
            foreground = scheme.onSecondaryContainer
        }
        AvatarTone.TERTIARY -> {
            background = scheme.tertiaryContainer
            foreground = scheme.onTertiaryContainer
        }
    }

    Box(
        modifier
            .size(size)
            .background(background, CircleShape)
            // Decorative: the name it abbreviates is always beside it, so announcing "J H"
            // as well is one reading of the same fact.
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials,
            color = foreground,
            fontSize = (size.value * 0.36f).sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

/**
 * `MSaveBar`: Cancel and Save, below the scroll rather than over it.
 *
 * THE SAME STRUCTURAL RULE as [ClientScaffold]'s bottom bar, for the same reason — a bar
 * that floats over a form covers the last field on a short phone, which is how the web
 * side's sticky CTA came to sit on top of six legal links. Pass this as the scaffold's
 * footer, never inside its content.
 *
 * The label changes while a save is in flight rather than freezing under a spinner, which
 * is [AuthPrimaryButton]'s rule; a spinner beside the original label says nothing changed.
 */
@Composable
fun AccountSaveBar(
    onSave: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    saveLabel: String = "Save",
    savingLabel: String = "Saving…",
    cancelLabel: String = "Cancel",
    enabled: Boolean = true,
    saving: Boolean = false,
) {
    // BOTH INSETS, and neither is optional.
    //
    // `imePadding` because the bar is the Column's last fixed child, so growing it shrinks
    // the weighted scroll above and the buttons stay above the keyboard.
    //
    // `navigationBarsPadding` because NOTHING ELSE APPLIES IT on these screens. ClientScaffold
    // deliberately leaves the navigation-bar inset to ClientBottomNav — so the bar's own
    // background extends into the gesture area rather than leaving a strip of page showing
    // beneath it — and a pushed §2.5 screen passes `activeTab = null`, so that bar never
    // renders and the inset never gets applied. Without this, Save and Cancel sit under the
    // home pill on a gesture-navigation device. §2.2's composer carries both for exactly this
    // reason and says so; this had only the first.
    //
    // Putting either on ClientScaffold instead would change every shipped §2.2 screen.
    Column(modifier.fillMaxWidth().imePadding().navigationBarsPadding()) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Surface(color = MaterialTheme.colorScheme.surfaceContainerLow) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 8.dp, end = 16.dp, top = 10.dp, bottom = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                TextButton(onClick = onCancel, enabled = !saving) { Text(cancelLabel) }
                Button(
                    onClick = onSave,
                    enabled = enabled && !saving,
                    shape = PillShape,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) {
                    if (saving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                        Text(savingLabel, modifier = Modifier.padding(start = 10.dp))
                    } else {
                        Text(saveLabel)
                    }
                }
            }
        }
    }
}
