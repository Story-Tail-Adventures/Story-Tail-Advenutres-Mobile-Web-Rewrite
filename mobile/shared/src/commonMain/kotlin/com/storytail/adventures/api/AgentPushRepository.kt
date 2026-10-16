package com.storytail.adventures.api

import com.storytail.contracts.PushRegisterRequest
import com.storytail.contracts.PushRegisterRequestOp
import com.storytail.contracts.PushRegisterRequestPlatform
import com.storytail.contracts.PushUnregisterRequest
import com.storytail.contracts.PushUnregisterRequestOp
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.functions.functions
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * §3.10 Stage 3b: this phone's notifications on and off, through `push-device` (the same
 * function the web's "Turn on" calls). Never returns a device address.
 */
interface AgentPushRepository {
    /**
     * Waits for the stored session to load. A notification can wake the app from nothing, and a
     * call made before the session is back would go out signed in as nobody.
     */
    suspend fun signedIn(): Boolean

    suspend fun register(deviceId: String, fcmToken: String, label: String?): Boolean

    suspend fun unregister(fcmToken: String): Boolean
}

class UnconfiguredAgentPushRepository : AgentPushRepository {
    override suspend fun signedIn(): Boolean = false
    override suspend fun register(deviceId: String, fcmToken: String, label: String?): Boolean = false
    override suspend fun unregister(fcmToken: String): Boolean = false
}

class SupabaseAgentPushRepository(private val client: SupabaseClient) : AgentPushRepository {
    private val json = Json { explicitNulls = false }

    override suspend fun signedIn(): Boolean = try {
        client.auth.awaitInitialization()
        client.auth.currentSessionOrNull() != null
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        false
    }

    override suspend fun register(deviceId: String, fcmToken: String, label: String?): Boolean = call(
        json.encodeToJsonElement(
            PushRegisterRequest.serializer(),
            PushRegisterRequest(
                op = PushRegisterRequestOp.REGISTER,
                platform = PushRegisterRequestPlatform.ANDROID,
                deviceId = deviceId,
                fcmToken = fcmToken,
                label = label,
            ),
        ).jsonObject,
    )

    override suspend fun unregister(fcmToken: String): Boolean = call(
        json.encodeToJsonElement(
            PushUnregisterRequest.serializer(),
            PushUnregisterRequest(op = PushUnregisterRequestOp.UNREGISTER, fcmToken = fcmToken),
        ).jsonObject,
    )

    // `invoke` THROWS on a non-2xx (CLAUDE.md, "Local development gotchas"), so a refusal arrives
    // as a RestException, not as a response to inspect. Either way the answer here is a yes/no:
    // turning notifications on either worked or the card says it did not.
    private suspend fun call(body: JsonObject): Boolean = try {
        client.functions.invoke("push-device", body)
        true
    } catch (e: CancellationException) {
        throw e
    } catch (_: RestException) {
        false
    } catch (_: Exception) {
        false
    }
}
