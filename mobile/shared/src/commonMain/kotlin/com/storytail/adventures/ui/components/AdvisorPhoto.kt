package com.storytail.adventures.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.readRawBytes
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.jetbrains.compose.resources.decodeToImageBitmap

/**
 * §3.12.1's photo, the advisor's face: drawn in the More tab, the profile screen and the
 * client's "Your advisor" card (Q11). Initials on the brand colour when there is no photo, while
 * it loads, and when it fails: a broken image is never shown.
 *
 * NO IMAGE LIBRARY. The app had no remote image anywhere before this, and a new SDK needs a
 * security review (CLAUDE.md). The photo is one small public JPEG, so Ktor (already the
 * transport under supabase-kt) fetches the bytes and Compose's own decoder draws them.
 *
 * Cached for the process by URL (see [PhotoCache]). Safe because a new photo always gets a new key in the bucket
 * (`<agent>/<v7>.jpg`), so a cached URL can never show an old face.
 */
@Composable
fun AdvisorPhoto(
    url: String?,
    initials: String,
    size: Dp,
    background: Color,
    modifier: Modifier = Modifier,
    /** Null when a name beside it already says who this is. */
    contentDescription: String? = null,
) {
    var bitmap by remember(url) { mutableStateOf(url?.let(PhotoCache::get)) }
    LaunchedEffect(url) {
        if (url != null && bitmap == null) bitmap = PhotoCache.load(url)
    }

    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(background, CircleShape)
            .clearAndSetSemantics { contentDescription?.let { this.contentDescription = it } },
        contentAlignment = Alignment.Center,
    ) {
        val image = bitmap
        if (image != null) {
            Image(image, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size))
        } else {
            Text(
                initials,
                color = Color.White,
                fontSize = (size.value * 0.36f).sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

/**
 * One fetch per URL however many bubbles ask at once (they share the [Deferred]), a lock around
 * the map, and a failure remembered for the process so a broken photo is not re-fetched for
 * every bubble that scrolls in. Decoding runs off the main thread.
 */
private object PhotoCache {
    private val client by lazy { HttpClient() }
    private val lock = Mutex()
    private val loads = mutableMapOf<String, Deferred<ImageBitmap?>>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @OptIn(ExperimentalCoroutinesApi::class)
    fun get(url: String): ImageBitmap? =
        loads[url]?.takeIf { it.isCompleted && !it.isCancelled }?.getCompleted()

    suspend fun load(url: String): ImageBitmap? {
        val pending = lock.withLock { loads.getOrPut(url) { scope.async { fetch(url) } } }
        return pending.await()
    }

    private suspend fun fetch(url: String): ImageBitmap? = try {
        val response = client.get(url)
        if (!response.status.isSuccess()) {
            null
        } else {
            val bytes = response.readRawBytes()
            // A photo is 400×400 and well under 1 MB; anything far larger is not ours.
            if (bytes.size > MAX_BYTES) null else bytes.decodeToImageBitmap()
        }
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (_: Throwable) {
        null
    }

    private const val MAX_BYTES = 2 * 1024 * 1024
}

/**
 * Choosing a profile photo (§3.12.1). Common code cannot reach the platform's photo picker, so
 * the platform provides this through [LocalAvatarPicker]: androidApp's `AndroidAvatarPicker`
 * on Android, [NoAvatarPicker] everywhere else (iOS until Xcode, previews and tests), which
 * offers nothing.
 *
 * The picker does the browser's work (Q8): the photo picked is checked (JPG, PNG or WebP, up to
 * 5 MB), centre-cropped square, scaled to 400×400 over white and handed back as JPEG base64,
 * ready for `agent-settings` op `set_avatar`. The function still sniffs the bytes itself.
 */
interface AvatarPicker {
    val available: Boolean

    suspend fun pick(): AvatarPick
}

sealed interface AvatarPick {
    data class Picked(val jpegBase64: String) : AvatarPick
    data object Cancelled : AvatarPick
    data object TooBig : AvatarPick
    data object WrongType : AvatarPick
    data object Unreadable : AvatarPick
}

object NoAvatarPicker : AvatarPicker {
    override val available: Boolean = false
    override suspend fun pick(): AvatarPick = AvatarPick.Cancelled
}

val LocalAvatarPicker = staticCompositionLocalOf<AvatarPicker> { NoAvatarPicker }
