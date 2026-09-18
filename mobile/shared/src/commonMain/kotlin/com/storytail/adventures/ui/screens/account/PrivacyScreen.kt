package com.storytail.adventures.ui.screens.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.LegalSlug
import com.storytail.adventures.domain.account.PrivacyMessages
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.TonalCard
import com.storytail.adventures.ui.theme.PillShape

/**
 * Screen 2.5.9 Privacy & Data Export — docs/Screen-Inventory.md §2.5.9, §4.4 Pattern A, and
 * design/source-prototype/screens/client-account-mobile.jsx `M259_Privacy`. P1.
 *
 * READ-ONLY today. Everything shown is static or already-published content; the one action is
 * disabled with a reason.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.9:
 *  · The Analytics / Marketing tracking toggles are GONE, replaced by a statement. There is
 *    no analytics script, tag manager or advertising pixel anywhere in the app, and the
 *    published cookie policy already tells people in writing that we run none. Switches over
 *    nothing are a control that lies, and they contradicted a shipped legal page. They come
 *    back the day a tracker does.
 *  · The export does NOT claim to include the document-access trail. Every signature from
 *    `trip-document-url` writes an `audit_event`, but that is the agency's table and §2.2
 *    deliberately gave clients no policy on it — naming it here would promise data the client
 *    has no path to.
 *  · "Request an export" is DISABLED: there is no `data_export_request` entity to write to
 *    and no Edge Function that creates one. Reading a status out of `audit_event` is the side
 *    door §2.2 refused. The entity has to land first.
 *
 * The tracking claim must stay consistent with the cookie policy this screen links to. If a
 * tracker is ever added, BOTH change in the same commit — a privacy claim that drifts from a
 * legal page is worse than no claim.
 */
@Composable
fun PrivacyScreen(
    onBack: () -> Unit,
    onOpenLegal: (LegalSlug) -> Unit,
    onOpenClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme

    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = PrivacyMessages.TITLE, onBack = onBack) },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                PrivacyMessages.SUBTITLE,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurfaceVariant,
            )

            TonalCard(background = scheme.surfaceContainer) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StoryTailGlyph(StoryTailMark.DOWNLOAD, 18.dp, scheme.onSurface)
                    Text(
                        PrivacyMessages.EXPORT_TITLE,
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onSurface,
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    PrivacyMessages.EXPORT_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = {},
                    enabled = false,
                    shape = PillShape,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) { Text(PrivacyMessages.EXPORT_CTA) }
                Spacer(Modifier.height(6.dp))
                Text(
                    PrivacyMessages.EXPORT_DEFERRED,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(4.dp))
            Text(
                PrivacyMessages.TRACKING_HEADING,
                style = MaterialTheme.typography.labelSmall,
                color = scheme.onSurfaceVariant,
            )
            TonalCard(background = scheme.surfaceContainer) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StoryTailGlyph(StoryTailMark.SHIELD, 18.dp, scheme.onSurfaceVariant)
                    Column {
                        Text(
                            PrivacyMessages.TRACKING_BODY,
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onSurfaceVariant,
                        )
                        // A separate control rather than an inline link: Compose has no
                        // anchor inside a Text without an AnnotatedString and a tap-target
                        // measurement, and a 12sp link is under §4.2's floor anyway.
                        TextButton(onClick = { onOpenLegal(LegalSlug.COOKIES) }) {
                            Text(PrivacyMessages.COOKIES_LINK)
                        }
                    }
                }
            }

            Spacer(Modifier.height(4.dp))
            TonalCard(background = scheme.errorContainer) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StoryTailGlyph(StoryTailMark.WARNING, 18.dp, scheme.onErrorContainer)
                    Text(
                        PrivacyMessages.CLOSE_TITLE,
                        style = MaterialTheme.typography.titleSmall,
                        color = scheme.onErrorContainer,
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    PrivacyMessages.CLOSE_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onErrorContainer,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onOpenClose,
                    shape = PillShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = scheme.onErrorContainer,
                        contentColor = scheme.errorContainer,
                    ),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) { Text(PrivacyMessages.CLOSE_CTA) }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
