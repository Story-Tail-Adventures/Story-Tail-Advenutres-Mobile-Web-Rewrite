package com.storytail.adventures.ui.components.public

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.LegalSlug
import com.storytail.adventures.content.public.Topic
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.theme.PillShape

/**
 * The five public destinations, plus the two ways in.
 *
 * The artboards put these behind the top bar's control rather than in a row, because
 * "Explore · Caribbean · Cruises · Honeymoons · About Gyasi" plus two buttons does not fit
 * a phone. A ModalBottomSheet rather than a drawer: it is the platform's own sheet, so the
 * scrim, the drag handle, the back gesture and the focus handling come for free — the same
 * reason the web menu is a native `<dialog>` rather than a styled div.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PublicMenuSheet(
    onDismiss: () -> Unit,
    onNavigate: (AppRoute) -> Unit,
    onSignIn: () -> Unit,
    onCreateAccount: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 18.dp)
                .padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            PUBLIC_DESTINATIONS.forEach { (label, route) ->
                MenuRow(label) { onNavigate(route) }
            }

            HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.padding(vertical = 10.dp),
            )

            Button(
                onClick = onCreateAccount,
                shape = PillShape,
                modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
            ) {
                Text("Create an account")
            }
            OutlinedButton(
                onClick = onSignIn,
                shape = PillShape,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = PublicTapTarget)
                    .padding(top = 8.dp),
            ) {
                Text("Sign in")
            }

            HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.padding(vertical = 10.dp),
            )

            // The legal pages. On a phone this menu is their only route, which is the same
            // mistake the web footer had to be rescued from in this section.
            LegalSlug.entries.forEach { slug ->
                MenuRow(
                    label = slug.name.lowercase().replaceFirstChar { it.uppercase() },
                    small = true,
                ) { onNavigate(AppRoute.PublicLegal(slug)) }
            }
        }
    }
}

@Composable
private fun MenuRow(label: String, small: Boolean = false, onClick: () -> Unit) {
    Text(
        text = label,
        style = if (small) {
            MaterialTheme.typography.bodySmall
        } else {
            MaterialTheme.typography.titleMedium
        },
        color = if (small) {
            MaterialTheme.colorScheme.onSurfaceVariant
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        fontWeight = if (small) FontWeight.Normal else FontWeight.SemiBold,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = PublicTapTarget)
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
    )
}

/** Screen Inventory §2.0's "public top bar navigation", in that order. */
val PUBLIC_DESTINATIONS: List<Pair<String, AppRoute>> = listOf(
    "Explore" to AppRoute.PublicExplore,
    "Caribbean" to AppRoute.PublicTopic(Topic.CARIBBEAN),
    "Cruises" to AppRoute.PublicTopic(Topic.CRUISES),
    "Honeymoons" to AppRoute.PublicTopic(Topic.HONEYMOONS),
    "About Gyasi" to AppRoute.PublicAbout,
    "How it works" to AppRoute.PublicHowItWorks,
)
