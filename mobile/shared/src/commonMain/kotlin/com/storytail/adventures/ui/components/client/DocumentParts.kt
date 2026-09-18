package com.storytail.adventures.ui.components.client

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storytail.adventures.api.TripDocumentView
import com.storytail.adventures.domain.trip.DocumentBadge
import com.storytail.adventures.domain.trip.documentBadge
import com.storytail.adventures.domain.trip.formatFileSize
import com.storytail.adventures.domain.trip.uploadedByLabel
import com.storytail.adventures.ui.theme.StoryTailBrand

/**
 * One document, in a list.
 *
 * Lifted out of §2.2.6's `DocumentsScreen` when §2.5.4 arrived — the account-wide library is
 * the same row over a list with the trip filter removed, and the web side does the same
 * thing by importing `DocumentRow` from the trip folder rather than copying it.
 *
 * WHAT MUST NOT EXIST TWICE is the [signing] state. Opening a file is a network round trip
 * plus an `audit_event` write, so without a pending state the row looks inert on a slow
 * connection, gets tapped twice, signs twice, and puts two access records on somebody's
 * document trail. A second copy of this row is a second chance to forget that.
 */
@Composable
fun DocumentRow(
    document: TripDocumentView,
    signing: Boolean,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .clickable(enabled = !signing, onClick = onOpen)
            // The 46dp badge already clears §4.2's 44pt minimum; the vertical padding keeps
            // a one-line filename from shrinking the row below it.
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DocumentTile(documentBadge(document.mimeType))
        Spacer(Modifier.width(12.dp))

        Column(Modifier.weight(1f)) {
            Text(
                text = document.filename,
                style = MaterialTheme.typography.titleSmall,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "${formatFileSize(document.sizeBytes)} · ${uploadedByLabel(document.mine)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        if (signing) {
            Spacer(Modifier.width(8.dp))
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

/** The artboards' 38×46 badge: burgundy for a PDF, orange for an image. */
@Composable
fun DocumentTile(badge: DocumentBadge, modifier: Modifier = Modifier) {
    Box(
        modifier
            .width(38.dp)
            .height(46.dp)
            .background(
                if (badge == DocumentBadge.PDF) StoryTailBrand.Burgundy else StoryTailBrand.Orange,
                RoundedCornerShape(4.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = badge.name,
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold,
            style = MaterialTheme.typography.labelSmall,
        )
    }
}
