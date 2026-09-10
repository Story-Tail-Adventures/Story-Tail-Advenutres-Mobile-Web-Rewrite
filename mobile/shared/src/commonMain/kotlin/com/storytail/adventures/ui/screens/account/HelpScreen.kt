package com.storytail.adventures.ui.screens.account

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.storytail.adventures.content.public.FaqItem
import com.storytail.adventures.content.public.LegalSlug
import com.storytail.adventures.content.public.PublicCatalog
import com.storytail.adventures.domain.account.HELP_LEGAL
import com.storytail.adventures.domain.account.HelpMessages
import com.storytail.adventures.ui.components.StoryTailGlyph
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.AvatarTone
import com.storytail.adventures.ui.components.client.ClientScaffold
import com.storytail.adventures.ui.components.client.InitialsAvatar
import com.storytail.adventures.ui.components.client.TonalCard
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailRadius

/**
 * Screen 2.5.11 Help & Support — docs/Screen-Inventory.md §2.5.11, §4.4 Pattern I + B, and
 * design/source-prototype/screens/client-account-mobile.jsx `M2511_Help`. P1.
 *
 * REAL TODAY, because it mutates nothing and every source is a typed content module already
 * in the app — there is no CMS and this screen must not introduce a second store.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.11:
 *  · "Email platform support" is GONE. No `support@` address exists anywhere in the repo, and
 *    a second tier that routes somewhere other than Gyasi would promise a queue nobody
 *    staffs. Story-Tail is one advisor.
 *  · The card-authorization questions are held until §2.4 ships. An FAQ that explains an
 *    unreachable screen is worse than no FAQ.
 *  · "Message Gyasi" is a MAILTO, not a thread. §2.6.3 cannot send yet, and a CTA that looks
 *    like a way to reach him and is not one is worse than a plain email link. It repoints the
 *    day §2.6 lands — the same rule 2.1.14 already applies to its third action.
 *  · Reply-window wording is the settled "Usually replies the same day". The public surface's
 *    "< 2h" is an unverified claim fenced behind PUBLIC_CLAIMS_MODE=strict and must not
 *    spread to an authenticated screen.
 *
 * The advisor avatar is INITIALS, for the same reason 2.5.1's is: no licensed photograph of
 * Gyasi exists in the repo.
 */
@Composable
fun HelpScreen(
    onBack: () -> Unit,
    onMessageGyasi: () -> Unit,
    onOpenLegal: (LegalSlug) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val faqs = remember { helpFaqs() }

    ClientScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = HelpMessages.TITLE, onBack = onBack) },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                HelpMessages.SUBTITLE,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurfaceVariant,
            )

            TonalCard(background = scheme.primaryContainer) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    InitialsAvatar(
                        initials = HelpMessages.ADVISOR_INITIALS,
                        size = 44.dp,
                        tone = AvatarTone.SURFACE,
                    )
                    Column {
                        Text(
                            HelpMessages.ADVISOR_NAME,
                            style = MaterialTheme.typography.titleSmall,
                            color = scheme.onPrimaryContainer,
                        )
                        Text(
                            HelpMessages.REPLY_WINDOW,
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onPrimaryContainer,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    HelpMessages.ADVISOR_BODY,
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onPrimaryContainer,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onMessageGyasi,
                    shape = PillShape,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) {
                    StoryTailGlyph(StoryTailMark.MESSAGE, 15.dp, scheme.onPrimary)
                    Spacer(Modifier.width(8.dp))
                    Text(HelpMessages.MESSAGE_CTA)
                }
            }

            Spacer(Modifier.height(4.dp))
            Text(
                HelpMessages.FAQ_HEADING,
                style = MaterialTheme.typography.labelSmall,
                color = scheme.onSurfaceVariant,
            )
            faqs.forEach { item -> FaqRow(item) }

            Spacer(Modifier.height(6.dp))
            Text(
                HelpMessages.LEGAL_HEADING,
                style = MaterialTheme.typography.labelSmall,
                color = scheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                HELP_LEGAL.forEach { (slug, label) ->
                    TextButton(onClick = { onOpenLegal(slug) }) { Text(label) }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

/**
 * Questions the two published FAQ sets both answer in different words.
 *
 * A NORMALISED QUESTION STRING IS NOT ENOUGH, and the web twin shipped believing it was. The
 * two modules ask "Do you charge a planning fee?" and "Do I pay a planning fee?" — the same
 * question, different sentences, so hashing the text keeps both and the most important answer
 * on the screen appears twice in a row. Paraphrase is what a union of two curated sets
 * actually produces; identical strings are the rare case.
 *
 * Each entry matches a TOPIC. The first item matching one wins and every later match is
 * dropped, so the order of the union decides which phrasing survives — GYASI_FAQ comes first
 * because its first-person voice is the right one under a heading about talking to Gyasi.
 *
 * Keep this list short. It is a curation decision, not a search index.
 */
private val SAME_TOPIC = listOf(Regex("planning fee", RegexOption.IGNORE_CASE))

/**
 * Cards and authorization, which §2.4 has not built. Matched against the QUESTION AND THE
 * ANSWER: two entries mention card authorization only in the answer.
 */
private val UNREACHABLE = Regex("""\bcards?\b|authoriz""", RegexOption.IGNORE_CASE)

/**
 * Screen 2.5.11's question list. The TypeScript twin is `helpFaqs()` in
 * `web/lib/account/help-faqs.ts`, and the two must produce the same list.
 */
internal fun helpFaqs(): List<FaqItem> {
    val seen = mutableSetOf<String>()
    return (PublicCatalog.GYASI_FAQ + PublicCatalog.HOW_IT_WORKS_FAQ).filter { item ->
        if (UNREACHABLE.containsMatchIn("${item.q} ${item.a}")) return@filter false
        seen.add(topicKey(item.q))
    }
}

/** A shared topic if the question has one, otherwise the question's own letters. */
private fun topicKey(question: String): String {
    val topic = SAME_TOPIC.firstOrNull { it.containsMatchIn(question) }
    return topic?.pattern ?: question.lowercase().filter { it in 'a'..'z' }
}

/** The artboard's accordion. Collapsed by default — nine open answers is a wall of text. */
@Composable
private fun FaqRow(item: FaqItem) {
    val scheme = MaterialTheme.colorScheme
    var open by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(StoryTailRadius.md))
            .background(scheme.surfaceContainer)
            .clickable { open = !open },
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                item.q,
                style = MaterialTheme.typography.titleSmall,
                color = scheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            StoryTailGlyph(
                if (open) StoryTailMark.CHEVRON_DOWN else StoryTailMark.CHEVRON_RIGHT,
                15.dp,
                scheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(visible = open) {
            Text(
                item.a,
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp),
            )
        }
    }
}
