package com.storytail.adventures.android

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.storytail.adventures.domain.agent.AVATAR_SIZE_PX
import com.storytail.adventures.domain.agent.MAX_AVATAR_SOURCE_BYTES
import com.storytail.adventures.ui.components.AvatarPick
import com.storytail.adventures.ui.components.AvatarPicker
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/**
 * §3.12.1's photo on Android: the system photo picker (no storage permission), then the
 * browser's steps (`web/lib/agent/avatarImage.ts`): JPG, PNG or WebP up to 5 MB, centre-cropped
 * square, 400×400 over white, JPEG at 88%, base64.
 *
 * Registered in [MainActivity.onCreate] before `setContent`: an activity-result launcher must
 * exist before the activity starts. One pick at a time; a second tap while the picker is open
 * waits on the same answer.
 */
class AndroidAvatarPicker(private val activity: ComponentActivity) : AvatarPicker {
    private var pending: CompletableDeferred<Uri?>? = null

    private val launcher = activity.registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        pending?.complete(uri)
        pending = null
    }

    override val available: Boolean = true

    override suspend fun pick(): AvatarPick {
        val waiting = pending ?: CompletableDeferred<Uri?>().also {
            pending = it
            launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }
        val uri = waiting.await() ?: return AvatarPick.Cancelled
        return withContext(Dispatchers.IO) { prepare(uri) }
    }

    private fun prepare(uri: Uri): AvatarPick {
        val resolver = activity.contentResolver
        val type = resolver.getType(uri)
        if (type !in ACCEPTED) return AvatarPick.WrongType
        return try {
            val size = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
            if (size > MAX_AVATAR_SOURCE_BYTES) return AvatarPick.TooBig
            val source = decode(uri) ?: return AvatarPick.Unreadable
            val side = minOf(source.width, source.height)
            val crop = Rect((source.width - side) / 2, (source.height - side) / 2, 0, 0).apply {
                right = left + side
                bottom = top + side
            }
            val out = Bitmap.createBitmap(AVATAR_SIZE_PX, AVATAR_SIZE_PX, Bitmap.Config.ARGB_8888)
            Canvas(out).apply {
                // A transparent PNG would turn black as a JPEG; paint white under it first.
                drawColor(Color.WHITE)
                drawBitmap(source, crop, Rect(0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX), Paint(Paint.FILTER_BITMAP_FLAG))
            }
            source.recycle()
            val bytes = ByteArrayOutputStream().use { stream ->
                out.compress(Bitmap.CompressFormat.JPEG, 88, stream)
                stream.toByteArray()
            }
            out.recycle()
            AvatarPick.Picked(Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (_: Exception) {
            AvatarPick.Unreadable
        } catch (_: OutOfMemoryError) {
            AvatarPick.Unreadable
        }
    }

    /**
     * Downsampled while decoding so a 50-megapixel photo never lands in memory whole. ImageDecoder
     * (API 28+) also turns the photo the way the camera held it; on older phones BitmapFactory does
     * not read that tag, so a sideways photo can stay sideways there.
     */
    private fun decode(uri: Uri): Bitmap? {
        val resolver = activity.contentResolver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                val side = minOf(info.size.width, info.size.height)
                val factor = (side / (AVATAR_SIZE_PX * 2)).coerceAtLeast(1)
                decoder.setTargetSize(info.size.width / factor, info.size.height / factor)
            }
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= AVATAR_SIZE_PX) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        return resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
    }

    private companion object {
        val ACCEPTED = setOf("image/jpeg", "image/png", "image/webp")
    }
}
