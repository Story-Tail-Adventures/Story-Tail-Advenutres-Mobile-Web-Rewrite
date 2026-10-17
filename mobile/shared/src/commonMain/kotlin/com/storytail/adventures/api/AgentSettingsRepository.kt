package com.storytail.adventures.api

import com.storytail.adventures.domain.agent.AgentAvailabilitySettings
import com.storytail.adventures.domain.agent.AgentNotificationSettings
import com.storytail.adventures.domain.agent.AgentProfileSettings
import com.storytail.adventures.domain.agent.AgentSettings
import com.storytail.adventures.domain.agent.DEFAULT_WEEKLY_SCHEDULE
import com.storytail.adventures.domain.agent.DayHours
import com.storytail.adventures.domain.agent.SocialNetwork
import com.storytail.adventures.domain.agent.TimeOffBlock
import com.storytail.adventures.domain.agent.WeeklySchedule
import com.storytail.adventures.domain.agent.Weekday
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * §3.12 Agent Settings on the phone (PR 4). Its own repository, on the rule the others follow:
 * one per section that shares no read with an existing file.
 *
 * THE SAME DOORS THE WEB USES. One read, `agent_settings_self()` (SECURITY DEFINER over
 * `current_agent_id()`, one jsonb, the shape `web/lib/agent/settingsView.ts` reads), and one
 * write, the `agent-settings` Edge Function with the ops `web/app/(agent)/agent/settings/
 * actions.ts` sends. The function audits every write in the same SQL transaction (CLAUDE.md
 * rule 3); nothing here writes a table.
 *
 * Not in contracts/openapi.yaml: the web calls `agent-settings` untyped too, so these payloads
 * are built by hand, field for field from actions.ts.
 *
 * `functions.invoke` THROWS ON A NON-2xx (CLAUDE.md, "Local development gotchas"): the
 * function's sentence is read off `RestException.error`, never `message`.
 */
interface AgentSettingsRepository {
    suspend fun load(): AgentSettingsRead

    suspend fun saveProfile(profile: AgentProfileSettings): SettingsSave

    /** [jpegBase64]: a 400×400 square the phone already made. */
    suspend fun setAvatar(jpegBase64: String): SettingsSave

    suspend fun removeAvatar(): SettingsSave

    suspend fun saveAvailability(timeZone: String, schedule: WeeklySchedule, responseTimeHours: Int): SettingsSave

    /** [isNew]: [block]'s id was minted on this phone just now (a fresh UUIDv7). */
    suspend fun saveTimeOff(block: TimeOffBlock, isNew: Boolean): SettingsSave

    /** Deletes an upcoming block, or ends a running one early ("I'm back"). */
    suspend fun endTimeOff(timeOffId: String): SettingsSave

    suspend fun saveNotifications(settings: AgentNotificationSettings): SettingsSave
}

sealed interface AgentSettingsRead {
    data class Ok(val settings: AgentSettings) : AgentSettingsRead
    data object Forbidden : AgentSettingsRead
    data object Failed : AgentSettingsRead
}

sealed interface SettingsSave {
    /** [outcome] as the function said it ("updated", "unchanged", "created", ...). */
    data class Saved(val outcome: String, val avatarPath: String? = null) : SettingsSave {
        val unchanged: Boolean get() = outcome == "unchanged"
    }

    /** [detail]: the 4xx sentence the function wrote, or null for anything else. */
    data class Failed(val detail: String?) : SettingsSave
}

class UnconfiguredAgentSettingsRepository : AgentSettingsRepository {
    override suspend fun load(): AgentSettingsRead = AgentSettingsRead.Failed
    override suspend fun saveProfile(profile: AgentProfileSettings): SettingsSave = SettingsSave.Failed(null)
    override suspend fun setAvatar(jpegBase64: String): SettingsSave = SettingsSave.Failed(null)
    override suspend fun removeAvatar(): SettingsSave = SettingsSave.Failed(null)
    override suspend fun saveAvailability(timeZone: String, schedule: WeeklySchedule, responseTimeHours: Int): SettingsSave =
        SettingsSave.Failed(null)
    override suspend fun saveTimeOff(block: TimeOffBlock, isNew: Boolean): SettingsSave = SettingsSave.Failed(null)
    override suspend fun endTimeOff(timeOffId: String): SettingsSave = SettingsSave.Failed(null)
    override suspend fun saveNotifications(settings: AgentNotificationSettings): SettingsSave = SettingsSave.Failed(null)
}

class SupabaseAgentSettingsRepository(private val client: SupabaseClient) : AgentSettingsRepository {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun load(): AgentSettingsRead = try {
        // A scalar jsonb comes back as the object itself (or `null` for a caller who is no
        // advisor), not as a one-row array.
        val body = client.postgrest.rpc("agent_settings_self").data
        val element = json.parseToJsonElement(body)
        val row = (if (element is kotlinx.serialization.json.JsonArray) element.firstOrNull() else element)
        if (row == null || row is JsonNull) AgentSettingsRead.Forbidden else AgentSettingsRead.Ok(parseAgentSettings(row.jsonObject))
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        if (rest.statusCode in 401..403) AgentSettingsRead.Forbidden else AgentSettingsRead.Failed
    } catch (_: Exception) {
        AgentSettingsRead.Failed
    }

    override suspend fun saveProfile(profile: AgentProfileSettings) = call(
        buildJsonObject {
            put("op", "update_profile")
            put("displayName", profile.displayName)
            put("pronouns", profile.pronouns)
            put("phone", profile.phone)
            put("bio", profile.bio)
            // Every network, blank ones too: the function drops an empty link, which is how a
            // link is removed. The web form sends them the same way.
            putJsonObject("socialLinks") {
                for (n in SocialNetwork.entries) put(n.key, profile.socialLinks[n].orEmpty())
            }
        },
    )

    override suspend fun setAvatar(jpegBase64: String) = call(
        buildJsonObject {
            put("op", "set_avatar")
            put("image", jpegBase64)
        },
    )

    override suspend fun removeAvatar() = call(buildJsonObject { put("op", "remove_avatar") })

    override suspend fun saveAvailability(timeZone: String, schedule: WeeklySchedule, responseTimeHours: Int) = call(
        buildJsonObject {
            put("op", "update_availability")
            put("timeZone", timeZone)
            put("weeklySchedule", scheduleJson(schedule))
            put("responseTimeHours", responseTimeHours)
        },
    )

    override suspend fun saveTimeOff(block: TimeOffBlock, isNew: Boolean) = call(
        buildJsonObject {
            put("op", "save_time_off")
            put("timeOffId", block.id)
            put("isNew", isNew)
            put("startsOn", block.startsOn)
            put("endsOn", block.endsOn)
            put("label", block.label)
            put("autoReplyEnabled", block.autoReplyEnabled)
            put("autoReplyText", block.autoReplyText)
        },
    )

    override suspend fun endTimeOff(timeOffId: String) = call(
        buildJsonObject {
            put("op", "end_time_off")
            put("timeOffId", timeOffId)
        },
    )

    override suspend fun saveNotifications(settings: AgentNotificationSettings) = call(
        buildJsonObject {
            put("op", "update_notifications")
            put("clientMessagesPush", settings.clientMessagesPush)
            put("clientMessagesEmail", settings.clientMessagesEmail)
            put("quoteRequestsPush", settings.quoteRequestsPush)
            put("quoteRequestsEmail", settings.quoteRequestsEmail)
        },
    )

    private suspend fun call(body: JsonObject): SettingsSave = try {
        val response = client.functions.invoke("agent-settings", body)
        // A 2xx is a save, whatever its body says: an unreadable answer must not tell the advisor
        // "that didn't save" about a write the function already audited.
        val answer = runCatching { json.decodeFromString(SaveDto.serializer(), response.bodyAsText()) }.getOrNull()
        SettingsSave.Saved(answer?.outcome ?: "updated", answer?.avatarPath)
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (rest: RestException) {
        // NEVER log the body: it holds the advisor's own details, and a photo.
        SettingsSave.Failed(problemDetail(rest))
    } catch (_: Exception) {
        SettingsSave.Failed(null)
    }

    /** 4xx only: those are sentences we wrote. Read from `error`, never `message`. */
    private fun problemDetail(rest: RestException): String? {
        if (rest.statusCode !in 400..499) return null
        return runCatching { json.decodeFromString(ProblemDetailDto.serializer(), rest.error).detail }.getOrNull()
    }
}

@Serializable
private data class SaveDto(val outcome: String? = null, val avatarPath: String? = null)

@Serializable
private data class ProblemDetailDto(val detail: String? = null)

internal fun scheduleJson(schedule: WeeklySchedule): JsonObject = buildJsonObject {
    for (day in Weekday.entries) {
        val hours = schedule[day]
        if (hours == null) {
            put(day.key, JsonNull)
        } else {
            putJsonObject(day.key) {
                put("start", hours.start)
                put("end", hours.end)
            }
        }
    }
}

private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

private fun JsonElement?.obj(): JsonObject? = this as? JsonObject

/**
 * `agent_settings_self()`'s jsonb, read leniently: a field missing (an older stack) takes the
 * §3.12 default, as `toSettingsView` does on the web. A schedule that does not parse as seven
 * days of half-hour ranges falls back to the default rather than half-loading.
 */
internal fun parseAgentSettings(row: JsonObject): AgentSettings {
    val p = row["profile"].obj()
    val a = row["availability"].obj()
    val n = row["notifications"].obj()
    val links = p?.get("socialLinks").obj()
    return AgentSettings(
        profile = AgentProfileSettings(
            displayName = p?.get("displayName").str().orEmpty(),
            pronouns = p?.get("pronouns").str().orEmpty(),
            email = p?.get("email").str().orEmpty(),
            phone = p?.get("phone").str().orEmpty(),
            bio = p?.get("bio").str().orEmpty(),
            avatarPath = p?.get("avatarUrl").str(),
            socialLinks = SocialNetwork.entries
                .mapNotNull { net -> links?.get(net.key).str()?.takeIf { it.isNotBlank() }?.let { net to it } }
                .toMap(),
        ),
        availability = AgentAvailabilitySettings(
            timeZone = a?.get("timeZone").str() ?: "America/Chicago",
            weeklySchedule = parseSchedule(a?.get("weeklySchedule")) ?: DEFAULT_WEEKLY_SCHEDULE,
            responseTimeHours = (a?.get("responseTimeHours") as? JsonPrimitive)?.intOrNull ?: 24,
            today = row["today"].str().orEmpty(),
            timeOff = (row["timeOff"] as? kotlinx.serialization.json.JsonArray).orEmpty().mapNotNull { el ->
                val t = el.obj() ?: return@mapNotNull null
                val id = t["id"].str() ?: return@mapNotNull null
                TimeOffBlock(
                    id = id,
                    startsOn = t["startsOn"].str() ?: return@mapNotNull null,
                    endsOn = t["endsOn"].str() ?: return@mapNotNull null,
                    label = t["label"].str().orEmpty(),
                    autoReplyEnabled = (t["autoReplyEnabled"] as? JsonPrimitive)?.booleanOrNull == true,
                    autoReplyText = t["autoReplyText"].str().orEmpty(),
                )
            },
        ),
        notifications = AgentNotificationSettings(
            clientMessagesPush = n?.get("clientMessages").obj()?.get("push").bool() ?: true,
            clientMessagesEmail = n?.get("clientMessages").obj()?.get("email").bool() ?: false,
            quoteRequestsPush = n?.get("quoteRequests").obj()?.get("push").bool() ?: true,
            quoteRequestsEmail = n?.get("quoteRequests").obj()?.get("email").bool() ?: true,
        ),
    )
}

private fun JsonElement?.bool(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull

private val START = Regex("^([01][0-9]|2[0-3]):(00|30)$")
private val END = Regex("^(([01][0-9]|2[0-3]):(00|30)|24:00)$")

private fun parseSchedule(value: JsonElement?): WeeklySchedule? {
    val o = value.obj() ?: return null
    if (o.keys != Weekday.entries.map { it.key }.toSet()) return null
    val out = mutableMapOf<Weekday, DayHours?>()
    for (day in Weekday.entries) {
        val d = o[day.key]
        if (d == null || d is JsonNull) {
            out[day] = null
            continue
        }
        val h = d.obj() ?: return null
        val start = h["start"].str() ?: return null
        val end = h["end"].str() ?: return null
        if (!START.matches(start) || !END.matches(end) || start >= end) return null
        out[day] = DayHours(start, end)
    }
    return out
}
