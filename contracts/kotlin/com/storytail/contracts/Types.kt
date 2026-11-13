// GENERATED FILE — DO NOT EDIT.
//
// Source: contracts/openapi.yaml
// Regenerate: npm run generate -w contracts
//
// Hand-editing this file is the one thing that breaks the contract, because the CI job
// "Contracts codegen is current" regenerates it and diffs — an edit here shows up as a
// failing build on somebody else's PR. Change openapi.yaml instead.

package com.storytail.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
enum class EmailUnsubscribeResponseStatus {
    @SerialName("on")
    ON,
    @SerialName("off")
    OFF,
    @SerialName("invalid")
    INVALID,
}

@Serializable
enum class CruiseSyncRunResponseStatus {
    @SerialName("ok")
    OK,
    @SerialName("partial")
    PARTIAL,
    @SerialName("skipped")
    SKIPPED,
    @SerialName("failed")
    FAILED,
}

@Serializable
enum class CruiseSyncRequestTrigger {
    @SerialName("cron")
    CRON,
    @SerialName("manual")
    MANUAL,
}

@Serializable
enum class AccountAdminMergeResponseOutcome {
    @SerialName("merged")
    MERGED,
    @SerialName("refused")
    REFUSED,
    @SerialName("stale")
    STALE,
}

@Serializable
enum class AccountAdminMergeRequestOp {
    @SerialName("merge")
    MERGE,
}

@Serializable
enum class AccountAdminFlagResponseOutcome {
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
}

@Serializable
enum class AccountAdminFlagRequestOp {
    @SerialName("flag")
    FLAG,
    @SerialName("unflag")
    UNFLAG,
}

@Serializable
enum class AccountAdminSignOutResponseOutcome {
    @SerialName("changed")
    CHANGED,
}

@Serializable
enum class AccountAdminSignOutRequestOp {
    @SerialName("sign_out_everywhere")
    SIGN_OUT_EVERYWHERE,
}

@Serializable
enum class AccountAdminLockResponseOutcome {
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
    @SerialName("refused")
    REFUSED,
}

@Serializable
enum class AccountAdminLockRequestOp {
    @SerialName("lock")
    LOCK,
    @SerialName("unlock")
    UNLOCK,
}

@Serializable
enum class AccountAdminVerifyEmailResponseOutcome {
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
    @SerialName("refused")
    REFUSED,
    @SerialName("duplicate")
    DUPLICATE,
}

@Serializable
enum class AccountAdminVerifyEmailRequestOp {
    @SerialName("verify_email")
    VERIFY_EMAIL,
}

@Serializable
enum class AccountAdminEmailResponseKind {
    @SerialName("reset")
    RESET,
    @SerialName("magic_link")
    MAGIC_LINK,
    @SerialName("invite")
    INVITE,
}

@Serializable
enum class AccountAdminEmailResponseOutcome {
    @SerialName("sent")
    SENT,
    @SerialName("refused")
    REFUSED,
    @SerialName("capped")
    CAPPED,
    @SerialName("failed")
    FAILED,
}

@Serializable
enum class AccountAdminEmailRequestOp {
    @SerialName("reset")
    RESET,
    @SerialName("magic_link")
    MAGIC_LINK,
    @SerialName("invite")
    INVITE,
}

@Serializable
enum class AgentReportFileOutcome {
    @SerialName("exported")
    EXPORTED,
}

@Serializable
enum class AgentReportCenterRequestType {
    @SerialName("ledger")
    LEDGER,
    @SerialName("trips")
    TRIPS,
    @SerialName("milestones")
    MILESTONES,
    @SerialName("clients")
    CLIENTS,
}

@Serializable
enum class AgentReportCenterRequestOp {
    @SerialName("center")
    CENTER,
}

@Serializable
enum class AgentReportExportRequestBasis {
    @SerialName("booked")
    BOOKED,
    @SerialName("received")
    RECEIVED,
}

@Serializable
enum class AgentReportExportRequestPeriod {
    @SerialName("ytd")
    YTD,
    @SerialName("12mo")
    _12MO,
    @SerialName("qtd")
    QTD,
}

@Serializable
enum class AgentReportExportRequestReport {
    @SerialName("revenue")
    REVENUE,
    @SerialName("suppliers")
    SUPPLIERS,
    @SerialName("destinations")
    DESTINATIONS,
    @SerialName("clients")
    CLIENTS,
    @SerialName("funnel")
    FUNNEL,
    @SerialName("pipeline")
    PIPELINE,
}

@Serializable
enum class AgentReportExportRequestOp {
    @SerialName("export")
    EXPORT,
}

@Serializable
enum class CommissionImportReconcileResponseOutcome {
    @SerialName("reconciled")
    RECONCILED,
    @SerialName("needs_decisions")
    NEEDS_DECISIONS,
    @SerialName("not_open")
    NOT_OPEN,
}

@Serializable
enum class CommissionImportResponseOutcome {
    @SerialName("mapped")
    MAPPED,
    @SerialName("resolved")
    RESOLVED,
    @SerialName("discarded")
    DISCARDED,
    @SerialName("not_open")
    NOT_OPEN,
    @SerialName("not_allowed")
    NOT_ALLOWED,
    @SerialName("line_unavailable")
    LINE_UNAVAILABLE,
    @SerialName("trip_not_found")
    TRIP_NOT_FOUND,
    @SerialName("supplier_not_found")
    SUPPLIER_NOT_FOUND,
}

@Serializable
enum class CommissionImportUploadResponseOutcome {
    @SerialName("uploaded")
    UPLOADED,
    @SerialName("duplicate_file")
    DUPLICATE_FILE,
}

@Serializable
enum class CommissionImportStatementRequestOp {
    @SerialName("reconcile")
    RECONCILE,
    @SerialName("discard")
    DISCARD,
}

@Serializable
enum class CommissionImportResolveRequestAction {
    @SerialName("confirm")
    CONFIRM,
    @SerialName("match")
    MATCH,
    @SerialName("create")
    CREATE,
    @SerialName("ignore")
    IGNORE,
}

@Serializable
enum class CommissionImportResolveRequestOp {
    @SerialName("resolve")
    RESOLVE,
}

@Serializable
enum class CommissionImportMapRequestOp {
    @SerialName("map")
    MAP,
}

@Serializable
enum class CommissionImportUploadRequestOp {
    @SerialName("upload")
    UPLOAD,
}

@Serializable
enum class AgentCommissionWeightsResponseOutcome {
    @SerialName("saved")
    SAVED,
    @SerialName("noop")
    NOOP,
}

@Serializable
enum class AgentCommissionExportResponseOutcome {
    @SerialName("exported")
    EXPORTED,
}

@Serializable
enum class AgentCommissionPaymentResponseOutcome {
    @SerialName("recorded")
    RECORDED,
    @SerialName("noop")
    NOOP,
    @SerialName("bad_date")
    BAD_DATE,
}

@Serializable
enum class AgentCommissionLineResponseOutcome {
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
    @SerialName("supplier_not_found")
    SUPPLIER_NOT_FOUND,
    @SerialName("duplicate_reference")
    DUPLICATE_REFERENCE,
    @SerialName("payment_would_clear")
    PAYMENT_WOULD_CLEAR,
    @SerialName("removed")
    REMOVED,
    @SerialName("not_removable")
    NOT_REMOVABLE,
}

@Serializable
enum class AgentCommissionCreateResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("duplicate_reference")
    DUPLICATE_REFERENCE,
    @SerialName("supplier_not_found")
    SUPPLIER_NOT_FOUND,
}

@Serializable
enum class AgentCommissionWeightsRequestOp {
    @SerialName("weights")
    WEIGHTS,
}

@Serializable
enum class AgentCommissionExportRequestOp {
    @SerialName("export")
    EXPORT,
}

@Serializable
enum class AgentCommissionRemoveRequestOp {
    @SerialName("remove")
    REMOVE,
}

@Serializable
enum class AgentCommissionPaymentRequestStatus {
    @SerialName("received")
    RECEIVED,
    @SerialName("disputed")
    DISPUTED,
}

@Serializable
enum class AgentCommissionPaymentRequestOp {
    @SerialName("payment")
    PAYMENT,
}

@Serializable
enum class AgentCommissionLineFieldsPaymentTerms {
    @SerialName("at_booking")
    AT_BOOKING,
    @SerialName("after_travel")
    AFTER_TRAVEL,
}

@Serializable
enum class AgentSettingsResponseOutcome {
    @SerialName("updated")
    UPDATED,
    @SerialName("unchanged")
    UNCHANGED,
    @SerialName("created")
    CREATED,
    @SerialName("deleted")
    DELETED,
    @SerialName("ended")
    ENDED,
}

@Serializable
enum class AgentSettingsSignatureRequestOp {
    @SerialName("update_signature")
    UPDATE_SIGNATURE,
}

@Serializable
enum class AgentSettingsNotificationsRequestOp {
    @SerialName("update_notifications")
    UPDATE_NOTIFICATIONS,
}

@Serializable
enum class AgentSettingsEndTimeOffRequestOp {
    @SerialName("end_time_off")
    END_TIME_OFF,
}

@Serializable
enum class AgentSettingsSaveTimeOffRequestOp {
    @SerialName("save_time_off")
    SAVE_TIME_OFF,
}

@Serializable
enum class AgentSettingsAvailabilityRequestTimeZone {
    @SerialName("America/St_Johns")
    AMERICA_ST_JOHNS,
    @SerialName("America/Halifax")
    AMERICA_HALIFAX,
    @SerialName("America/Puerto_Rico")
    AMERICA_PUERTO_RICO,
    @SerialName("America/New_York")
    AMERICA_NEW_YORK,
    @SerialName("America/Toronto")
    AMERICA_TORONTO,
    @SerialName("America/Cancun")
    AMERICA_CANCUN,
    @SerialName("America/Chicago")
    AMERICA_CHICAGO,
    @SerialName("America/Winnipeg")
    AMERICA_WINNIPEG,
    @SerialName("America/Mexico_City")
    AMERICA_MEXICO_CITY,
    @SerialName("America/Regina")
    AMERICA_REGINA,
    @SerialName("America/Denver")
    AMERICA_DENVER,
    @SerialName("America/Edmonton")
    AMERICA_EDMONTON,
    @SerialName("America/Phoenix")
    AMERICA_PHOENIX,
    @SerialName("America/Los_Angeles")
    AMERICA_LOS_ANGELES,
    @SerialName("America/Vancouver")
    AMERICA_VANCOUVER,
    @SerialName("America/Tijuana")
    AMERICA_TIJUANA,
    @SerialName("America/Anchorage")
    AMERICA_ANCHORAGE,
    @SerialName("Pacific/Honolulu")
    PACIFIC_HONOLULU,
}

@Serializable
enum class AgentSettingsAvailabilityRequestOp {
    @SerialName("update_availability")
    UPDATE_AVAILABILITY,
}

@Serializable
enum class AgentSettingsRemoveAvatarRequestOp {
    @SerialName("remove_avatar")
    REMOVE_AVATAR,
}

@Serializable
enum class AgentSettingsAvatarRequestOp {
    @SerialName("set_avatar")
    SET_AVATAR,
}

@Serializable
enum class AgentSettingsProfileRequestOp {
    @SerialName("update_profile")
    UPDATE_PROFILE,
}

@Serializable
enum class AgentMessageTemplateResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("exists")
    EXISTS,
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
}

@Serializable
enum class AgentMessageTemplateArchiveRequestOp {
    @SerialName("archive")
    ARCHIVE,
}

@Serializable
enum class AgentMessageTemplateDuplicateRequestOp {
    @SerialName("duplicate")
    DUPLICATE,
}

@Serializable
enum class AgentMessageTemplateWriteRequestCategory {
    @SerialName("lead_response")
    LEAD_RESPONSE,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booking_confirmation")
    BOOKING_CONFIRMATION,
    @SerialName("pre_trip")
    PRE_TRIP,
    @SerialName("post_trip")
    POST_TRIP,
    @SerialName("payment_reminder")
    PAYMENT_REMINDER,
    @SerialName("other")
    OTHER,
}

@Serializable
enum class AgentMessageTemplateWriteRequestOp {
    @SerialName("create")
    CREATE,
    @SerialName("update")
    UPDATE,
}

@Serializable
enum class AgentTemplateApplyResponseOutcome {
    @SerialName("applied")
    APPLIED,
    @SerialName("already_applied")
    ALREADY_APPLIED,
}

@Serializable
enum class AgentTemplateOutcomeResponseOutcome {
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
    @SerialName("archived")
    ARCHIVED,
}

@Serializable
enum class AgentTemplateApplyRequestOp {
    @SerialName("apply")
    APPLY,
}

@Serializable
enum class AgentTemplateArchiveRequestOp {
    @SerialName("archive")
    ARCHIVE,
}

@Serializable
enum class AgentTemplateUpdateRequestOp {
    @SerialName("update")
    UPDATE,
}

@Serializable
enum class AgentTemplateSaveRequestOp {
    @SerialName("save")
    SAVE,
}

@Serializable
enum class AgentClientNoteResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("changed")
    CHANGED,
    @SerialName("archived")
    ARCHIVED,
}

@Serializable
enum class AgentClientNoteRequestOp {
    @SerialName("create")
    CREATE,
    @SerialName("update")
    UPDATE,
    @SerialName("archive")
    ARCHIVE,
}

@Serializable
enum class AgentClientBulkTagResponseOutcome {
    @SerialName("tagged")
    TAGGED,
}

@Serializable
enum class AgentClientArchiveResponseOutcome {
    @SerialName("archived")
    ARCHIVED,
    @SerialName("restored")
    RESTORED,
    @SerialName("noop")
    NOOP,
}

@Serializable
enum class AgentClientUpdateResponseOutcome {
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
    @SerialName("duplicate_email")
    DUPLICATE_EMAIL,
}

@Serializable
enum class AgentClientCreateResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("duplicate_email")
    DUPLICATE_EMAIL,
}

@Serializable
enum class AgentClientBulkTagRequestOp {
    @SerialName("bulk_tag")
    BULK_TAG,
}

@Serializable
enum class AgentClientArchiveRequestOp {
    @SerialName("archive")
    ARCHIVE,
}

@Serializable
enum class AgentClientUpdateRequestOp {
    @SerialName("update")
    UPDATE,
}

@Serializable
enum class AgentClientCreateRequestOp {
    @SerialName("create")
    CREATE,
}

@Serializable
enum class AgentItineraryReorderResponseOutcome {
    @SerialName("reordered")
    REORDERED,
}

@Serializable
enum class AgentItineraryReorderRequestOp {
    @SerialName("reorder")
    REORDER,
}

@Serializable
enum class AgentItineraryActivityResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("updated")
    UPDATED,
    @SerialName("noop")
    NOOP,
    @SerialName("deleted")
    DELETED,
}

@Serializable
enum class AgentItineraryActivityDeleteRequestOp {
    @SerialName("activity_delete")
    ACTIVITY_DELETE,
}

@Serializable
enum class AgentItineraryActivityRequestBlock {
    @SerialName("morning")
    MORNING,
    @SerialName("afternoon")
    AFTERNOON,
    @SerialName("evening")
    EVENING,
    @SerialName("all_day")
    ALL_DAY,
}

@Serializable
enum class AgentItineraryActivityRequestOp {
    @SerialName("activity_upsert")
    ACTIVITY_UPSERT,
}

@Serializable
enum class AgentItineraryDayResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("updated")
    UPDATED,
    @SerialName("noop")
    NOOP,
}

@Serializable
enum class AgentItineraryDayRequestOp {
    @SerialName("day_upsert")
    DAY_UPSERT,
}

@Serializable
enum class AgentItineraryGenerateResponseOutcome {
    @SerialName("generated")
    GENERATED,
    @SerialName("noop")
    NOOP,
    @SerialName("no_dates")
    NO_DATES,
}

@Serializable
enum class AgentItineraryGenerateRequestOp {
    @SerialName("generate")
    GENERATE,
}

@Serializable
enum class AgentTripPayLinkResponseOutcome {
    @SerialName("set")
    SET,
    @SerialName("changed")
    CHANGED,
    @SerialName("removed")
    REMOVED,
    @SerialName("noop")
    NOOP,
}

@Serializable
enum class AgentTripPayLinkRequestOp {
    @SerialName("payment_link")
    PAYMENT_LINK,
}

@Serializable
enum class AgentTripMilestonePaidResponseOutcome {
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
}

@Serializable
enum class AgentTripMilestonePaidRequestStatus {
    @SerialName("scheduled")
    SCHEDULED,
    @SerialName("paid")
    PAID,
    @SerialName("waived")
    WAIVED,
    @SerialName("overdue")
    OVERDUE,
}

@Serializable
enum class AgentTripMilestonePaidRequestOp {
    @SerialName("payment_paid")
    PAYMENT_PAID,
}

@Serializable
enum class AgentTripMilestoneResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("updated")
    UPDATED,
    @SerialName("noop")
    NOOP,
    @SerialName("deleted")
    DELETED,
}

@Serializable
enum class AgentTripMilestoneDeleteRequestOp {
    @SerialName("payment_delete")
    PAYMENT_DELETE,
}

@Serializable
enum class AgentTripMilestoneRequestKind {
    @SerialName("deposit")
    DEPOSIT,
    @SerialName("interim")
    INTERIM,
    @SerialName("final")
    FINAL,
}

@Serializable
enum class AgentTripMilestoneRequestOp {
    @SerialName("payment_upsert")
    PAYMENT_UPSERT,
}

@Serializable
enum class AgentTripReorderResponseOutcome {
    @SerialName("reordered")
    REORDERED,
}

@Serializable
enum class AgentTripComponentReorderRequestOp {
    @SerialName("component_reorder")
    COMPONENT_REORDER,
}

@Serializable
enum class AgentTripComponentResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("updated")
    UPDATED,
    @SerialName("noop")
    NOOP,
    @SerialName("archived")
    ARCHIVED,
}

@Serializable
enum class AgentTripComponentArchiveRequestOp {
    @SerialName("component_archive")
    COMPONENT_ARCHIVE,
}

@Serializable
enum class AgentTripComponentRequestKind {
    @SerialName("flight")
    FLIGHT,
    @SerialName("hotel")
    HOTEL,
    @SerialName("cruise")
    CRUISE,
    @SerialName("transfer")
    TRANSFER,
    @SerialName("excursion")
    EXCURSION,
    @SerialName("insurance")
    INSURANCE,
    @SerialName("custom")
    CUSTOM,
}

@Serializable
enum class AgentTripComponentRequestOp {
    @SerialName("component_upsert")
    COMPONENT_UPSERT,
}

@Serializable
enum class AgentTripCreateResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("no_client")
    NO_CLIENT,
}

@Serializable
enum class AgentTripCreateRequestTripType {
    @SerialName("cruise")
    CRUISE,
    @SerialName("all_inclusive")
    ALL_INCLUSIVE,
    @SerialName("multi_destination")
    MULTI_DESTINATION,
    @SerialName("group")
    GROUP,
    @SerialName("custom")
    CUSTOM,
}

@Serializable
enum class AgentTripCreateRequestOp {
    @SerialName("create")
    CREATE,
}

@Serializable
enum class QuoteRequestRequestSource {
    @SerialName("curated")
    CURATED,
    @SerialName("serpapi_google_hotels")
    SERPAPI_GOOGLE_HOTELS,
    @SerialName("track_cruises")
    TRACK_CRUISES,
}

@Serializable
enum class QuoteRequestRequestTripType {
    @SerialName("cruise")
    CRUISE,
    @SerialName("all_inclusive")
    ALL_INCLUSIVE,
    @SerialName("multi_destination")
    MULTI_DESTINATION,
    @SerialName("group")
    GROUP,
    @SerialName("custom")
    CUSTOM,
}

@Serializable
enum class QuoteRequestRequestKind {
    @SerialName("hotel")
    HOTEL,
    @SerialName("cruise")
    CRUISE,
    @SerialName("excursion")
    EXCURSION,
    @SerialName("custom")
    CUSTOM,
}

@Serializable
enum class AgentLeadWriteResponseStatus {
    @SerialName("new")
    NEW,
    @SerialName("contacted")
    CONTACTED,
    @SerialName("closed")
    CLOSED,
    @SerialName("converted")
    CONVERTED,
}

@Serializable
enum class AgentLeadWriteResponseOutcome {
    @SerialName("changed")
    CHANGED,
    @SerialName("noop")
    NOOP,
    @SerialName("deleted")
    DELETED,
}

@Serializable
enum class AgentLeadCreateResponseOutcome {
    @SerialName("created")
    CREATED,
    @SerialName("added")
    ADDED,
    @SerialName("client_exists")
    CLIENT_EXISTS,
}

@Serializable
enum class AgentLeadRequestReason {
    @SerialName("not_a_fit")
    NOT_A_FIT,
    @SerialName("no_reply")
    NO_REPLY,
    @SerialName("went_elsewhere")
    WENT_ELSEWHERE,
    @SerialName("other")
    OTHER,
}

@Serializable
enum class AgentLeadRequestSource {
    @SerialName("email")
    EMAIL,
    @SerialName("phone")
    PHONE,
    @SerialName("referral")
    REFERRAL,
    @SerialName("social")
    SOCIAL,
    @SerialName("other")
    OTHER,
}

@Serializable
enum class AgentLeadRequestOp {
    @SerialName("create")
    CREATE,
    @SerialName("mark_contacted")
    MARK_CONTACTED,
    @SerialName("close")
    CLOSE,
    @SerialName("reopen")
    REOPEN,
    @SerialName("convert")
    CONVERT,
    @SerialName("delete_spam")
    DELETE_SPAM,
}

@Serializable
enum class LeadMessageRequestAboutKind {
    @SerialName("trip")
    TRIP,
    @SerialName("topic")
    TOPIC,
}

@Serializable
enum class LeadMessageRequestPage {
    @SerialName("landing")
    LANDING,
    @SerialName("how-it-works")
    HOW_IT_WORKS,
    @SerialName("about")
    ABOUT,
    @SerialName("topic")
    TOPIC,
    @SerialName("results")
    RESULTS,
    @SerialName("detail")
    DETAIL,
    @SerialName("join")
    JOIN,
    @SerialName("app")
    APP,
}

@Serializable
enum class HotelSearchResponseDegraded {
    @SerialName("budget_exhausted")
    BUDGET_EXHAUSTED,
    @SerialName("provider_unavailable")
    PROVIDER_UNAVAILABLE,
}

@Serializable
enum class HotelSearchResponseSource {
    @SerialName("live")
    LIVE,
    @SerialName("cache")
    CACHE,
    @SerialName("stale")
    STALE,
}

@Serializable
enum class HotelRateBasis {
    @SerialName("night")
    NIGHT,
}

@Serializable
enum class OnboardingCompanionRequestAction {
    @SerialName("add")
    ADD,
    @SerialName("edit")
    EDIT,
    @SerialName("remove")
    REMOVE,
    @SerialName("none")
    NONE,
}

@Serializable
enum class OnboardingPreferencesRequestBudgetBand {
    @SerialName("budget")
    BUDGET,
    @SerialName("mid")
    MID,
    @SerialName("premium")
    PREMIUM,
    @SerialName("luxury")
    LUXURY,
}

@Serializable
enum class OnboardingPreferencesRequestAccessibility {
    @SerialName("none")
    NONE,
    @SerialName("mobility")
    MOBILITY,
    @SerialName("quiet_room")
    QUIET_ROOM,
    @SerialName("service_animal")
    SERVICE_ANIMAL,
}

@Serializable
enum class OnboardingPreferencesRequestDietary {
    @SerialName("none")
    NONE,
    @SerialName("vegetarian")
    VEGETARIAN,
    @SerialName("pescatarian")
    PESCATARIAN,
    @SerialName("gluten_free")
    GLUTEN_FREE,
    @SerialName("halal")
    HALAL,
}

@Serializable
enum class OnboardingPreferencesRequestTravelStyles {
    @SerialName("resort")
    RESORT,
    @SerialName("cruise")
    CRUISE,
    @SerialName("adventure")
    ADVENTURE,
    @SerialName("family")
    FAMILY,
    @SerialName("romantic")
    ROMANTIC,
    @SerialName("group")
    GROUP,
}

@Serializable
enum class OnboardingStepResponseStep {
    @SerialName("profile")
    PROFILE,
    @SerialName("preferences")
    PREFERENCES,
    @SerialName("companions")
    COMPANIONS,
    @SerialName("connect")
    CONNECT,
    @SerialName("complete")
    COMPLETE,
}

@Serializable
enum class OnboardingStepRequestStep {
    @SerialName("profile")
    PROFILE,
    @SerialName("preferences")
    PREFERENCES,
    @SerialName("companions")
    COMPANIONS,
    @SerialName("connect")
    CONNECT,
    @SerialName("complete")
    COMPLETE,
}

@Serializable
enum class AgentArchiveThreadsRequestOp {
    @SerialName("archive")
    ARCHIVE,
}

@Serializable
enum class AgentMarkThreadReadRequestOp {
    @SerialName("read")
    READ,
}

@Serializable
enum class PushDeviceResponseOutcome {
    @SerialName("registered")
    REGISTERED,
    @SerialName("unregistered")
    UNREGISTERED,
    @SerialName("not_found")
    NOT_FOUND,
}

@Serializable
enum class PushUnregisterRequestOp {
    @SerialName("unregister")
    UNREGISTER,
}

@Serializable
enum class PushRegisterRequestPlatform {
    @SerialName("web")
    WEB,
    @SerialName("android")
    ANDROID,
}

@Serializable
enum class PushRegisterRequestOp {
    @SerialName("register")
    REGISTER,
}

@Serializable
enum class AgentSendMessageRequestOp {
    @SerialName("send")
    SEND,
}

@Serializable
enum class AgentTripStatusBulkResponseStatus {
    @SerialName("inquiry")
    INQUIRY,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booked")
    BOOKED,
    @SerialName("in_progress")
    IN_PROGRESS,
    @SerialName("completed")
    COMPLETED,
}

@Serializable
enum class AgentTripStatusBulkResponseOutcome {
    @SerialName("moved")
    MOVED,
}

@Serializable
enum class AgentTripStatusBulkRequestStatus {
    @SerialName("inquiry")
    INQUIRY,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booked")
    BOOKED,
    @SerialName("in_progress")
    IN_PROGRESS,
    @SerialName("completed")
    COMPLETED,
}

@Serializable
enum class AgentTripStatusBulkRequestOp {
    @SerialName("bulk")
    BULK,
}

@Serializable
enum class AgentTripStatusResponsePreviousStatus {
    @SerialName("inquiry")
    INQUIRY,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booked")
    BOOKED,
    @SerialName("in_progress")
    IN_PROGRESS,
    @SerialName("completed")
    COMPLETED,
    @SerialName("cancelled")
    CANCELLED,
}

@Serializable
enum class AgentTripStatusResponseStatus {
    @SerialName("inquiry")
    INQUIRY,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booked")
    BOOKED,
    @SerialName("in_progress")
    IN_PROGRESS,
    @SerialName("completed")
    COMPLETED,
    @SerialName("cancelled")
    CANCELLED,
}

@Serializable
enum class AgentTripStatusRequestRefundStatus {
    @SerialName("none_expected")
    NONE_EXPECTED,
    @SerialName("pending")
    PENDING,
    @SerialName("partial")
    PARTIAL,
    @SerialName("full")
    FULL,
}

@Serializable
enum class AgentTripStatusRequestStatus {
    @SerialName("inquiry")
    INQUIRY,
    @SerialName("proposal")
    PROPOSAL,
    @SerialName("booked")
    BOOKED,
    @SerialName("in_progress")
    IN_PROGRESS,
    @SerialName("completed")
    COMPLETED,
    @SerialName("cancelled")
    CANCELLED,
}

@Serializable
enum class SaveTestimonialResponseStatus {
    @SerialName("draft")
    DRAFT,
    @SerialName("submitted")
    SUBMITTED,
}

@Serializable
enum class RequestTripDocumentUploadRequestKind {
    @SerialName("passport")
    PASSPORT,
    @SerialName("visa")
    VISA,
    @SerialName("insurance_cert")
    INSURANCE_CERT,
    @SerialName("photo")
    PHOTO,
}

/** An amount in minor units plus its currency. */
@Serializable
data class Money(
    // Integer minor units (cents), as a string to preserve precision.
    @SerialName("amount")
    val amount: String,
    // ISO-4217 alphabetic code.
    @SerialName("currency")
    val currency: String,
)

@Serializable
data class SendTripMessageRequest(
    // Client-generated UUID v7. The server validates that the embedded timestamp is
    // recent (Data-Model §21.6) — `assertRecentUuidV7` in `_shared/uuid.ts`. Supplying
    // the id client-side is what makes a retry idempotent.
    @SerialName("messageId")
    val messageId: String,
    // The trip whose thread this belongs to. Mutually exclusive with `conversationId`;
    // omit both to post into the traveler's general (trip-less) thread.
    @SerialName("tripId")
    val tripId: String? = null,
    // An existing thread, addressed directly. Screen 2.6.2 uses this because a general
    // thread has `trip_id IS NULL` and so has no trip to key on. Mutually exclusive
    // with `tripId`.
    @SerialName("conversationId")
    val conversationId: String? = null,
    @SerialName("body")
    val body: String,
    // Documents already registered via POST /trip-document.
    @SerialName("attachmentDocumentIds")
    val attachmentDocumentIds: List<String>? = null,
)

@Serializable
data class SendTripMessageResponse(
    @SerialName("messageId")
    val messageId: String,
    @SerialName("conversationId")
    val conversationId: String,
    @SerialName("createdAt")
    val createdAt: String,
)

@Serializable
data class RequestTripDocumentUploadRequest(
    // Client-generated UUID v7, validated as recent.
    @SerialName("documentId")
    val documentId: String,
    @SerialName("tripId")
    val tripId: String,
    @SerialName("filename")
    val filename: String,
    // Must be one of the bucket's allowed types.
    @SerialName("mimeType")
    val mimeType: String,
    // Integer byte count as a string, for the same precision reason as Money.
    @SerialName("sizeBytes")
    val sizeBytes: String,
    // The document kinds a client may contribute.
    @SerialName("kind")
    val kind: RequestTripDocumentUploadRequestKind,
)

@Serializable
data class RequestTripDocumentUploadResponse(
    @SerialName("documentId")
    val documentId: String,
    // Signed PUT target, as a path to join to the caller's own Supabase base URL — not an absolute URL. Storage signs against the origin the function sees from inside its container (`http://kong:8000` locally), which resolves nowhere in a browser or on a phone. The caller already holds the right origin, so it does the joining. The storage key itself is still never returned; the path carries the signature, not a readable key.
    @SerialName("uploadPath")
    val uploadPath: String,
    @SerialName("expiresAt")
    val expiresAt: String,
)

@Serializable
data class TripDocumentUrlResponse(
    @SerialName("documentId")
    val documentId: String,
    // Signed read target, as a path to join to the caller's own Supabase base URL. See RequestTripDocumentUploadResponse.uploadPath for why this is not absolute.
    @SerialName("path")
    val path: String,
    @SerialName("expiresAt")
    val expiresAt: String,
    @SerialName("filename")
    val filename: String,
    @SerialName("mimeType")
    val mimeType: String,
)

@Serializable
data class SaveTestimonialRequest(
    // Client-generated UUID v7, validated as recent.
    @SerialName("testimonialId")
    val testimonialId: String,
    // Omitted for a reflection not tied to one trip.
    @SerialName("tripId")
    val tripId: String? = null,
    @SerialName("body")
    val body: String,
    // How the client wants to be credited.
    @SerialName("attribution")
    val attribution: String? = null,
    // Optional. The prompt is a question, not a star widget.
    @SerialName("rating")
    val rating: Int? = null,
    // False saves a draft; true moves it to `submitted`. A client can reach no other
    // state — approval is an agent action.
    @SerialName("submit")
    val submit: Boolean? = null,
)

@Serializable
data class SaveTestimonialResponse(
    @SerialName("testimonialId")
    val testimonialId: String,
    @SerialName("status")
    val status: SaveTestimonialResponseStatus,
    @SerialName("submittedAt")
    val submittedAt: String? = null,
)

@Serializable
data class AgentTripStatusRequest(
    @SerialName("tripId")
    val tripId: String,
    @SerialName("status")
    val status: AgentTripStatusRequestStatus,
    // `trip.version` as the board was rendered from. A mismatch is a 409. Required: the board always has it, and omitting it would make every drop last-write-wins.
    @SerialName("expectedVersion")
    val expectedVersion: Int,
    // Required (non-blank) when `status` is `cancelled`; on any other status it must be text if sent, and is not written. Trimmed. Reaches `trip.cancellation_reason`, which Screen 2.2.10 shows the traveler.
    @SerialName("cancellationReason")
    val cancellationReason: String? = null,
    // Only with `cancelled` (otherwise a 400). Absent keeps the stored value.
    @SerialName("refundStatus")
    val refundStatus: AgentTripStatusRequestRefundStatus? = null,
    // Only with `cancelled` (otherwise a 400). Trimmed; blank keeps the stored value.
    @SerialName("refundDetail")
    val refundDetail: String? = null,
    // Only with `cancelled` (otherwise a 400). The open ledger lines the cancel dialog listed under "Mark these as Lost", each at the version it showed. Lines still Expected or Invoiced at that version are marked Lost, each with its own audit row in the same transaction; the rest are skipped.
    @SerialName("closeCommission")
    val closeCommission: List<JsonElement>? = null,
)

@Serializable
data class AgentTripStatusResponse(
    @SerialName("tripId")
    val tripId: String,
    @SerialName("status")
    val status: AgentTripStatusResponseStatus,
    // Absent whenever the stage did not move (a no-op, or a cancellation-detail correction), because nothing was left behind.
    @SerialName("previousStatus")
    val previousStatus: AgentTripStatusResponsePreviousStatus? = null,
    // The version after the write. Send this as the next `expectedVersion`.
    @SerialName("version")
    val version: Int,
    // False when the trip was already in this stage: no transition, so no `trip_status_history` row. It does NOT mean nothing was recorded: a corrected cancellation reason or refund detail writes the columns and an `audit_event` under `trip.cancellation_reason_changed`, and still reports false.
    @SerialName("changed")
    val changed: Boolean,
    // Present on every `cancelled` call and only those. True when this call wrote the reason (a transition into `cancelled`, or a same-stage correction); false when the stored reason already read that way.
    @SerialName("cancellationReasonUpdated")
    val cancellationReasonUpdated: Boolean? = null,
    // Present on every `cancelled` call. Lines this call marked Lost.
    @SerialName("commissionLinesClosed")
    val commissionLinesClosed: Int? = null,
    // Present on every `cancelled` call. Named lines left as they were: moved since the dialog opened (paid, edited, removed) or not on this trip.
    @SerialName("commissionLinesSkipped")
    val commissionLinesSkipped: Int? = null,
)

@Serializable
data class AgentTripStatusBulkRequest(
    @SerialName("op")
    val op: AgentTripStatusBulkRequestOp,
    // `cancelled` is refused: cancelling is one trip at a time.
    @SerialName("status")
    val status: AgentTripStatusBulkRequestStatus,
    @SerialName("trips")
    val trips: List<JsonElement>,
)

@Serializable
data class AgentTripStatusBulkResponse(
    @SerialName("outcome")
    val outcome: AgentTripStatusBulkResponseOutcome,
    @SerialName("status")
    val status: AgentTripStatusBulkResponseStatus,
    @SerialName("movedCount")
    val movedCount: Int,
    @SerialName("requestedCount")
    val requestedCount: Int,
)

@Serializable
data class AgentTripNotesRequest(
    @SerialName("tripId")
    val tripId: String,
    // Replaces `trip.notes` outright. An empty string clears it.
    @SerialName("notes")
    val notes: String,
    // `trip.version` as the tab was rendered from. A mismatch is a 409. Required for the same reason as `/agent-trip-status`'s field.
    @SerialName("expectedVersion")
    val expectedVersion: Int,
)

@Serializable
data class AgentTripNotesResponse(
    @SerialName("tripId")
    val tripId: String,
    // The version after the write. Send this as the next `expectedVersion`.
    @SerialName("version")
    val version: Int,
    // False when the submitted notes matched what was already stored.
    @SerialName("changed")
    val changed: Boolean,
)

@Serializable
data class AgentSendMessageRequest(
    @SerialName("op")
    val op: AgentSendMessageRequestOp,
    // Client-generated UUID v7, minted once per draft so a double send or a retry
    // lands once (the repeat is a 400, "already sent"). Validated as recent.
    @SerialName("messageId")
    val messageId: String,
    // An existing thread. Mutually exclusive with `clientId` / `tripId`.
    @SerialName("conversationId")
    val conversationId: String? = null,
    // Starts or finds this client's live thread. Mutually exclusive with `conversationId`.
    @SerialName("clientId")
    val clientId: String? = null,
    // With `clientId`, that trip's thread; without it, the general thread.
    @SerialName("tripId")
    val tripId: String? = null,
    @SerialName("body")
    val body: String,
    // REQUIRED. True writes a note only the advisor sees.
    @SerialName("internalNote")
    val internalNote: Boolean,
    // `created_at` of the newest message on screen, EXACTLY as PostgREST wrote it.
    // Writing in a thread reads it only up to here. Omitted on a new message.
    @SerialName("seenUpTo")
    val seenUpTo: String? = null,
)

@Serializable
data class AgentSendMessageResponse(
    @SerialName("messageId")
    val messageId: String,
    // The thread written to, which a new message may have just started.
    @SerialName("conversationId")
    val conversationId: String,
    @SerialName("createdAt")
    val createdAt: String,
)

@Serializable
data class PushRegisterRequest(
    @SerialName("op")
    val op: PushRegisterRequestOp,
    @SerialName("platform")
    val platform: PushRegisterRequestPlatform,
    // A fresh client-minted v7. An address already registered keeps its own id.
    @SerialName("deviceId")
    val deviceId: String,
    // `android` only, and required there: the Firebase registration token.
    @SerialName("fcmToken")
    val fcmToken: String? = null,
    // `web` only, and required there: `PushSubscription.toJSON()`.
    @SerialName("subscription")
    val subscription: JsonElement? = null,
    // "Chrome · macOS" or the phone model, for a later device list. Optional.
    @SerialName("label")
    val label: String? = null,
)

/** At least one of `fcmToken` (a phone) or `endpoint` (a browser); neither is a 400. */
@Serializable
data class PushUnregisterRequest(
    @SerialName("op")
    val op: PushUnregisterRequestOp,
    @SerialName("fcmToken")
    val fcmToken: String? = null,
    @SerialName("endpoint")
    val endpoint: String? = null,
)

@Serializable
data class PushDeviceResponse(
    @SerialName("outcome")
    val outcome: PushDeviceResponseOutcome,
    // `register` only: the device's row id.
    @SerialName("deviceId")
    val deviceId: String? = null,
)

@Serializable
data class AgentMarkThreadReadRequest(
    @SerialName("op")
    val op: AgentMarkThreadReadRequestOp,
    @SerialName("conversationId")
    val conversationId: String,
    // `created_at` of the newest message on screen, as PostgREST wrote it.
    @SerialName("seenUpTo")
    val seenUpTo: String,
)

@Serializable
data class AgentMarkThreadReadResponse(
    // False when nothing was unread, or the thread is not the caller's (one answer).
    @SerialName("changed")
    val changed: Boolean,
)

@Serializable
data class AgentArchiveThreadsRequest(
    @SerialName("op")
    val op: AgentArchiveThreadsRequestOp,
    @SerialName("conversationIds")
    val conversationIds: List<String>,
    // True archives from the advisor's inbox; false brings back.
    @SerialName("archived")
    val archived: Boolean,
)

@Serializable
data class AgentArchiveThreadsResponse(
    @SerialName("moved")
    val moved: Int,
    @SerialName("requested")
    val requested: Int,
)

@Serializable
data class OnboardingStepRequest(
    // The step to move the cursor to. Reaching `complete` is not the same as finishing — that is what `complete: true` is for.
    @SerialName("step")
    val step: OnboardingStepRequestStep? = null,
    // Marks onboarding finished by setting `onboarding_completed_at`. Mutually exclusive with `step` in practice: this is checked first.
    @SerialName("complete")
    val complete: Boolean? = null,
)

@Serializable
data class OnboardingStepResponse(
    @SerialName("ok")
    val ok: Boolean,
    // Echoed back when the request moved the cursor.
    @SerialName("step")
    val step: OnboardingStepResponseStep? = null,
    // True when the request finished onboarding.
    @SerialName("completed")
    val completed: Boolean? = null,
)

@Serializable
data class OnboardingOkResponse(
    @SerialName("ok")
    val ok: Boolean,
)

@Serializable
data class OnboardingIdResponse(
    @SerialName("ok")
    val ok: Boolean,
    // The row written. Null when the call wrote nothing — a companions request with `action: none`.
    @SerialName("id")
    val id: String? = null,
)

/** All or nothing. A name with no number looks like a safety net and is not one, so a half-filled contact is a 400 rather than a partial row. Null clears it. Stored as jsonb on `client.emergency_contact`; see Data-Model §6.1. */
@Serializable
data class OnboardingEmergencyContact(
    @SerialName("name")
    val name: String? = null,
    // Normalised to E.164, as everywhere else in the schema.
    @SerialName("phone")
    val phone: String? = null,
    @SerialName("relationship")
    val relationship: String? = null,
)

/** Six structured fields, not one line — `client.mailing_address_id` is a FK to `address` and there is no free-text address column anywhere. `line1`, `city` and `country` are required TOGETHER or the whole object must be absent or null; two of the three is a 400. */
@Serializable
data class OnboardingAddress(
    @SerialName("line1")
    val line1: String? = null,
    @SerialName("line2")
    val line2: String? = null,
    @SerialName("city")
    val city: String? = null,
    @SerialName("region")
    val region: String? = null,
    @SerialName("postalCode")
    val postalCode: String? = null,
    // ISO-3166-1 alpha-2, matching `address.country`'s char(2).
    @SerialName("country")
    val country: String? = null,
)

/** Expiry and issuing country only. See the endpoint description: sending `number` is a 400, not an ignored field. */
@Serializable
data class OnboardingPassport(
    // What drives the renewal reminder, and the reason this object exists.
    @SerialName("expiresOn")
    val expiresOn: String? = null,
    @SerialName("issuingCountry")
    val issuingCountry: String? = null,
)

@Serializable
data class OnboardingProfileRequest(
    @SerialName("phone")
    val phone: String? = null,
    @SerialName("dateOfBirth")
    val dateOfBirth: String? = null,
    @SerialName("emergencyContact")
    val emergencyContact: OnboardingEmergencyContact? = null,
    @SerialName("address")
    val address: OnboardingAddress? = null,
    @SerialName("passport")
    val passport: OnboardingPassport? = null,
    @SerialName("advance")
    val advance: Boolean? = null,
)

/** A wholly empty entry is skipped — it is the repeater's last blank line, not a mistake. A number without a program is a 400. */
@Serializable
data class OnboardingLoyaltyProgram(
    @SerialName("program")
    val program: String,
    // Alphanumeric and hyphens. Anything else is a paste accident, and this is a number somebody will read back to an airline.
    @SerialName("number")
    val number: String? = null,
)

/** Every list is validated against the vocabulary in Data-Model §6.2. Null clears a list; absent leaves it. */
@Serializable
data class OnboardingPreferencesRequest(
    // Free text — the wish list is the traveler's, not a menu.
    @SerialName("destinations")
    val destinations: List<String>? = null,
    @SerialName("travelStyles")
    val travelStyles: List<OnboardingPreferencesRequestTravelStyles>? = null,
    // `none` is exclusive — with anything else it is a 400.
    @SerialName("dietary")
    val dietary: List<OnboardingPreferencesRequestDietary>? = null,
    @SerialName("dietaryNotes")
    val dietaryNotes: String? = null,
    // `none` is exclusive, as with dietary.
    @SerialName("accessibility")
    val accessibility: List<OnboardingPreferencesRequestAccessibility>? = null,
    @SerialName("accessibilityNotes")
    val accessibilityNotes: String? = null,
    @SerialName("favoritePastTrips")
    val favoritePastTrips: String? = null,
    // Four bands, not a figure. See the endpoint description for why the prototype's dual-thumb slider did not survive.
    @SerialName("budgetBand")
    val budgetBand: OnboardingPreferencesRequestBudgetBand? = null,
    @SerialName("loyalty")
    val loyalty: List<OnboardingLoyaltyProgram>? = null,
    @SerialName("advance")
    val advance: Boolean? = null,
)

@Serializable
data class OnboardingCompanionRequest(
    // `none` writes nothing and exists so "Save & continue" on an already complete list can advance the cursor without inventing a row.
    @SerialName("action")
    val action: OnboardingCompanionRequestAction? = null,
    // Required for `edit` and `remove`.
    @SerialName("id")
    val id: String? = null,
    // Required together with lastName for `add` and `edit`.
    @SerialName("firstName")
    val firstName: String? = null,
    @SerialName("lastName")
    val lastName: String? = null,
    @SerialName("relationship")
    val relationship: String? = null,
    @SerialName("dateOfBirth")
    val dateOfBirth: String? = null,
    @SerialName("passportExpiry")
    val passportExpiry: String? = null,
    // Two-letter country code, stored upper case. (A passport NUMBER is refused.)
    @SerialName("passportCountry")
    val passportCountry: String? = null,
    @SerialName("advance")
    val advance: Boolean? = null,
)

@Serializable
data class OnboardingConnectRequest(
    // The agent's invite code. Omitted or null is "I don't have a code" — a first-class exit, not an error.
    @SerialName("code")
    val code: String? = null,
    @SerialName("advance")
    val advance: Boolean? = null,
)

@Serializable
data class OnboardingConnectResponse(
    @SerialName("ok")
    val ok: Boolean,
    // False when the traveler declined to enter a code.
    @SerialName("redeemed")
    val redeemed: Boolean,
)

/** RFC 7807 problem details. Every error response uses this shape. */
@Serializable
data class Problem(
    @SerialName("type")
    val type: String,
    @SerialName("title")
    val title: String,
    @SerialName("status")
    val status: Int,
    @SerialName("detail")
    val detail: String? = null,
    @SerialName("instance")
    val instance: String? = null,
)

@Serializable
data class HotelSearchRequest(
    // Free text, as typed. Normalised server-side before it becomes a cache key.
    @SerialName("destination")
    val destination: String,
    @SerialName("checkIn")
    val checkIn: String,
    // Must be after checkIn, and at most 30 nights later.
    @SerialName("checkOut")
    val checkOut: String,
    @SerialName("adults")
    val adults: Int? = null,
    @SerialName("childrenAges")
    val childrenAges: List<Int>? = null,
    // Google star classification, 2-5. Not the guest rating.
    @SerialName("hotelClass")
    val hotelClass: List<String>? = null,
    // Google amenity ids. Unknown values are dropped, never forwarded.
    @SerialName("amenities")
    val amenities: List<String>? = null,
    @SerialName("minPrice")
    val minPrice: Int? = null,
    @SerialName("maxPrice")
    val maxPrice: Int? = null,
    // SerpApi sort id — "3" lowest price, "8" highest rating, "13" most reviewed. Empty means the provider's own relevance.
    @SerialName("sortBy")
    val sortBy: String? = null,
)

/** ONE indicative nightly rate, deliberately not a list. The provider returns one entry */
/** per booking site, each carrying a source, a logo and a link; a list here — even with */
/** those fields omitted — would invite someone to add the source back "for attribution". */
/** A single scalar cannot. */
@Serializable
data class HotelRate(
    // Integer minor units as a string (CLAUDE.md rule 5).
    @SerialName("amountCents")
    val amountCents: String,
    @SerialName("currency")
    val currency: String,
    // The only basis published. A total-for-the-stay reads like a quote.
    @SerialName("basis")
    val basis: HotelRateBasis,
    @SerialName("beforeTaxesFees")
    val beforeTaxesFees: Boolean,
)

@Serializable
data class HotelImage(
    // Host allow-listed at the mapper and again in web/.
    @SerialName("url")
    val url: String,
)

@Serializable
data class HotelLocation(
    @SerialName("latitude")
    val latitude: Double,
    @SerialName("longitude")
    val longitude: Double,
)

@Serializable
data class HotelResult(
    @SerialName("id")
    val id: String,
    // Opaque provider id, carried so the later inquiry step can name the hotel. Not a URL.
    @SerialName("propertyToken")
    val propertyToken: String? = null,
    @SerialName("name")
    val name: String,
    @SerialName("description")
    val description: String? = null,
    @SerialName("propertyType")
    val propertyType: String? = null,
    @SerialName("hotelClass")
    val hotelClass: Int? = null,
    @SerialName("overallRating")
    val overallRating: Double? = null,
    @SerialName("reviewCount")
    val reviewCount: Int? = null,
    @SerialName("location")
    val location: HotelLocation? = null,
    @SerialName("checkInTime")
    val checkInTime: String? = null,
    @SerialName("checkOutTime")
    val checkOutTime: String? = null,
    @SerialName("amenities")
    val amenities: List<String>,
    @SerialName("images")
    val images: List<HotelImage>,
    @SerialName("ecoCertified")
    val ecoCertified: Boolean,
    @SerialName("rate")
    val rate: HotelRate? = null,
)

@Serializable
data class HotelSearchEcho(
    @SerialName("destination")
    val destination: String,
    @SerialName("checkIn")
    val checkIn: String,
    @SerialName("checkOut")
    val checkOut: String,
    @SerialName("adults")
    val adults: Int,
    @SerialName("nights")
    val nights: Int,
)

@Serializable
data class HotelSearchResponse(
    // Payload shape version. Part of the cache key, so a change means a cold cache.
    @SerialName("version")
    val version: Int,
    @SerialName("currency")
    val currency: String,
    @SerialName("totalAvailable")
    val totalAvailable: Int? = null,
    @SerialName("results")
    val results: List<HotelResult>,
    // Always false. Each extra page is another billable search.
    @SerialName("hasMore")
    val hasMore: Boolean,
    @SerialName("source")
    val source: HotelSearchResponseSource,
    @SerialName("degraded")
    val degraded: HotelSearchResponseDegraded? = null,
    @SerialName("asOf")
    val asOf: String,
    // Set only when source is "stale". The page must show how old the prices are.
    @SerialName("staleAsOf")
    val staleAsOf: String? = null,
    @SerialName("query")
    val query: HotelSearchEcho,
)

/** Every field is optional. An empty body is the valid "what is sailing soon" query, */
/** which is what Screen 2.0.4 issues before the visitor has typed anything. */
@Serializable
data class CruiseSearchRequest(
    // Free text, matched against the sailing title and its destinations array. Not a
    // port name — port calls are returned but are not searched.
    @SerialName("destination")
    val destination: String? = null,
    // Earliest departure. Defaults to today; the past is never returned.
    @SerialName("from")
    val from: String? = null,
    // Latest departure. Must not be before `from`.
    @SerialName("to")
    val to: String? = null,
    @SerialName("minNights")
    val minNights: Int? = null,
    @SerialName("maxNights")
    val maxNights: Int? = null,
    // Out-of-range values fall back to the default rather than erroring.
    @SerialName("limit")
    val limit: Int? = null,
)

/** A ship photo and the attribution that may not be separated from it. */
/**  */
/** ONE OBJECT RATHER THAN FOUR SIBLING FIELDS, because the credit is a licence */
/** condition. Every photo is CC BY or CC BY-SA, both of which require credit wherever */
/** the work appears, so `credit` is required here and the pair is enforced all the way */
/** down: `cruise_ship_image_attributed` is a CHECK in Postgres, the mapper drops a */
/** photo whose credit is missing, and the web client's zod twin repeats it. Nesting is */
/** what makes "a URL with no credit" unspellable rather than merely discouraged. */
@Serializable
data class ShipImage(
    // Always an `https://upload.wikimedia.org/` URL. Host-pinned by a CHECK on the
    // column and checked again in `web/lib/public/cruises.ts` — `web/next.config.ts`
    // registers a custom next/image loader, so `remotePatterns` is never consulted
    // and nothing else decides where a visitor's browser is sent.
    @SerialName("url")
    val url: String,
    // Pre-rendered attribution, e.g. "Kiran891 / Wikimedia Commons, CC BY-SA 4.0".
    // MUST be displayed wherever the image is. Commons attribution runs long — 214
    // characters in the current catalog — so a client must let it wrap rather than
    // truncate it. An ellipsis through an author's name is not attribution.
    @SerialName("credit")
    val credit: String,
    // Commons' LicenseShortName — "CC BY-SA 4.0", "Public domain", "CC0".
    @SerialName("license")
    val license: String? = null,
    // The Commons file page. What the credit line should link to.
    @SerialName("sourceUrl")
    val sourceUrl: String? = null,
)

/** NO FARE FIELD, by construction. See the note on `/cruise-search`. */
@Serializable
data class CruiseSailing(
    @SerialName("id")
    val id: String,
    // Provider-supplied, e.g. "7 Night Eastern Caribbean". Falls back to "Cruise".
    @SerialName("title")
    val title: String,
    @SerialName("line")
    val line: String,
    @SerialName("ship")
    val ship: String,
    @SerialName("departureDate")
    val departureDate: String,
    @SerialName("nights")
    val nights: Int,
    @SerialName("destinations")
    val destinations: List<String>,
    // Port calls in sequence. Consecutive duplicates are collapsed — an overnight in
    // port is two calls at the same place, and "Nassau · Nassau · Miami" looks broken.
    @SerialName("ports")
    val ports: List<String>,
    // Null is normal and common. Only the 151 curated hulls carry a photo; the sync
    // mints a bare `cruise_ship` stub for any ship name it has not seen, and 2025-26
    // newbuilds often have no Commons photo yet.
    @SerialName("shipImage")
    val shipImage: JsonElement,
)

/** Deliberately flat. There is no `source`, `asOf` or `degraded` here as there is on */
/** `HotelSearchResponse`: this reads our own table, so there is no cache tier to */
/** report and no budget to exhaust. */
@Serializable
data class CruiseSearchResponse(
    // Soonest departure first. Archived sailings are never included.
    @SerialName("results")
    val results: List<CruiseSailing>,
)

@Serializable
data class OkResponse(
    @SerialName("ok")
    val ok: Boolean,
)

@Serializable
data class LeadMessageRequest(
    @SerialName("firstName")
    val firstName: String,
    @SerialName("lastName")
    val lastName: String? = null,
    @SerialName("email")
    val email: String,
    @SerialName("phone")
    val phone: String? = null,
    // A card number anywhere in it is refused.
    @SerialName("message")
    val message: String,
    // Where the form was. An unknown value is dropped, not refused.
    @SerialName("page")
    val page: LeadMessageRequestPage? = null,
    @SerialName("aboutKind")
    val aboutKind: LeadMessageRequestAboutKind? = null,
    @SerialName("aboutSlug")
    val aboutSlug: String? = null,
    @SerialName("aboutLabel")
    val aboutLabel: String? = null,
    @SerialName("utmSource")
    val utmSource: String? = null,
    @SerialName("utmMedium")
    val utmMedium: String? = null,
    @SerialName("utmCampaign")
    val utmCampaign: String? = null,
    // When the form was drawn, epoch milliseconds. A send under three seconds later is treated as automated.
    @SerialName("startedAt")
    val startedAt: Double,
    // The hidden field. Anything in it marks the send as automated.
    @SerialName("website")
    val website: String? = null,
)

@Serializable
data class AgentLeadRequest(
    @SerialName("op")
    val op: AgentLeadRequestOp,
    // Every op but `create`.
    @SerialName("leadId")
    val leadId: String? = null,
    // `create` only.
    @SerialName("firstName")
    val firstName: String? = null,
    @SerialName("lastName")
    val lastName: String? = null,
    // `create` only.
    @SerialName("email")
    val email: String? = null,
    @SerialName("phone")
    val phone: String? = null,
    // `create` only.
    @SerialName("source")
    val source: AgentLeadRequestSource? = null,
    // `create` only. A card number is refused.
    @SerialName("message")
    val message: String? = null,
    // `close` only.
    @SerialName("reason")
    val reason: AgentLeadRequestReason? = null,
    // `close` only. Private to the advisor.
    @SerialName("note")
    val note: String? = null,
    // `convert` only: one of the caller's clients.
    @SerialName("clientId")
    val clientId: String? = null,
)

@Serializable
data class AgentLeadCreateResponse(
    @SerialName("outcome")
    val outcome: AgentLeadCreateResponseOutcome,
    // On `created` and `added`.
    @SerialName("leadId")
    val leadId: String? = null,
    // On `client_exists`.
    @SerialName("clientId")
    val clientId: String? = null,
)

@Serializable
data class AgentLeadWriteResponse(
    @SerialName("leadId")
    val leadId: String,
    @SerialName("outcome")
    val outcome: AgentLeadWriteResponseOutcome,
    // The lead's status after the op; null once deleted.
    @SerialName("status")
    val status: AgentLeadWriteResponseStatus? = null,
)

/** Text fields are cleaned before use: control characters become spaces, runs of white */
/** space one space, then trimmed and cut to the stated length in UTF-16 units. A field */
/** that is not a string, or is empty after cleaning, counts as absent. */
@Serializable
data class QuoteRequestRequest(
    // Client-generated UUID v7, validated as recent (within an hour either way).
    @SerialName("tripId")
    val tripId: String,
    // The component kind. Only what a public search surface can produce.
    @SerialName("kind")
    val kind: QuoteRequestRequestKind,
    // Optional. Missing or unknown falls back to `cruise` for a cruise and `custom` otherwise; never refused.
    @SerialName("tripType")
    val tripType: QuoteRequestRequestTripType? = null,
    // What the traveler is asking about. Becomes the component's display name and the trip title.
    @SerialName("name")
    val name: String,
    // Optional. When present the title is "<name> · <location>" (cut to 120) and the trip's destinations are [location].
    @SerialName("location")
    val location: String? = null,
    // YYYY-MM-DD, a real calendar date. Send both dates or neither; null or "" is "not sent". A sent date that does not parse is a 400, never dropped.
    @SerialName("checkIn")
    val checkIn: String? = null,
    // YYYY-MM-DD, after checkIn.
    @SerialName("checkOut")
    val checkOut: String? = null,
    // Rounded, then held to 1..20. Anything not a finite number means 2.
    @SerialName("travelers")
    val travelers: Double? = null,
    // Optional. Becomes `trip.notes`.
    @SerialName("note")
    val note: String? = null,
    // What the traveler saw, kept on the component's payload. Treated as hostile: only
    // these keys survive, and `capturedAt` (the server's time) is added. A non-object
    // is read as {}.
    @SerialName("snapshot")
    val snapshot: JsonElement? = null,
    // Where the result came from (`trip_component.api_source`). Missing or unknown is `curated`.
    @SerialName("source")
    val source: QuoteRequestRequestSource? = null,
    // The provider's id for the result (`trip_component.api_reference`).
    @SerialName("apiReference")
    val apiReference: String? = null,
)

@Serializable
data class QuoteRequestResponse(
    // The id the caller sent, as sent.
    @SerialName("tripId")
    val tripId: String,
    @SerialName("status")
    val status: String,
)

@Serializable
data class AgentTripCreateRequest(
    @SerialName("op")
    val op: AgentTripCreateRequestOp,
    @SerialName("clientId")
    val clientId: String,
    @SerialName("tripType")
    val tripType: AgentTripCreateRequestTripType,
    // Trimmed; required.
    @SerialName("title")
    val title: String,
    // Clamped to 1..64. Absent or not an integer is 1.
    @SerialName("travelerCount")
    val travelerCount: Int? = null,
)

@Serializable
data class AgentTripCreateResponse(
    @SerialName("outcome")
    val outcome: AgentTripCreateResponseOutcome,
    // Present only on `created`.
    @SerialName("tripId")
    val tripId: String? = null,
)

@Serializable
data class AgentTripComponentRequest(
    @SerialName("op")
    val op: AgentTripComponentRequestOp,
    @SerialName("tripId")
    val tripId: String,
    // Present edits that component; absent or null creates one ("" is a 400).
    @SerialName("componentId")
    val componentId: String? = null,
    @SerialName("kind")
    val kind: AgentTripComponentRequestKind,
    @SerialName("supplierId")
    val supplierId: String? = null,
    @SerialName("displayName")
    val displayName: String,
    @SerialName("startDate")
    val startDate: String? = null,
    @SerialName("endDate")
    val endDate: String? = null,
    // HH:MM or HH:MM:SS.
    @SerialName("startTime")
    val startTime: String? = null,
    // HH:MM or HH:MM:SS.
    @SerialName("endTime")
    val endTime: String? = null,
    @SerialName("location")
    val location: String? = null,
    @SerialName("confirmationNumber")
    val confirmationNumber: String? = null,
    @SerialName("costCents")
    val costCents: JsonElement? = null,
    // 0 to 999.99, rounded to two places.
    @SerialName("commissionPct")
    val commissionPct: JsonElement? = null,
    // Blank with a rate set is worked out from the rate; anything typed wins.
    @SerialName("commissionCents")
    val commissionCents: JsonElement? = null,
    // The kind's own fields (Data-Model §23), snake_case: flight_number, cabin, seat, room_type, board_basis, ship, itinerary_name, dining_seating, gratuities_included (true/false), dropoff, vehicle, duration, plan, coverage, notes, as the kind allows. Unknown keys are a 400.
    @SerialName("detail")
    val detail: JsonElement? = null,
)

@Serializable
data class AgentTripComponentArchiveRequest(
    @SerialName("op")
    val op: AgentTripComponentArchiveRequestOp,
    @SerialName("tripId")
    val tripId: String,
    @SerialName("componentId")
    val componentId: String,
)

@Serializable
data class AgentTripComponentResponse(
    @SerialName("outcome")
    val outcome: AgentTripComponentResponseOutcome,
    @SerialName("componentId")
    val componentId: String,
)

@Serializable
data class AgentTripComponentReorderRequest(
    @SerialName("op")
    val op: AgentTripComponentReorderRequestOp,
    @SerialName("tripId")
    val tripId: String,
    // Every live component of the trip, in the new order. Fewer or more is a 409.
    @SerialName("componentIds")
    val componentIds: List<String>,
)

@Serializable
data class AgentTripReorderResponse(
    @SerialName("outcome")
    val outcome: AgentTripReorderResponseOutcome,
    @SerialName("moved")
    val moved: Int,
)

@Serializable
data class AgentTripMilestoneRequest(
    @SerialName("op")
    val op: AgentTripMilestoneRequestOp,
    @SerialName("tripId")
    val tripId: String,
    // Present edits that milestone; absent or null creates one.
    @SerialName("milestoneId")
    val milestoneId: String? = null,
    @SerialName("kind")
    val kind: AgentTripMilestoneRequestKind,
    @SerialName("label")
    val label: String,
    @SerialName("amountCents")
    val amountCents: JsonElement? = null,
    @SerialName("dueDate")
    val dueDate: String? = null,
)

@Serializable
data class AgentTripMilestoneDeleteRequest(
    @SerialName("op")
    val op: AgentTripMilestoneDeleteRequestOp,
    @SerialName("tripId")
    val tripId: String,
    @SerialName("milestoneId")
    val milestoneId: String,
)

@Serializable
data class AgentTripMilestoneResponse(
    @SerialName("outcome")
    val outcome: AgentTripMilestoneResponseOutcome,
    @SerialName("milestoneId")
    val milestoneId: String,
)

@Serializable
data class AgentTripMilestonePaidRequest(
    @SerialName("op")
    val op: AgentTripMilestonePaidRequestOp,
    @SerialName("tripId")
    val tripId: String,
    @SerialName("milestoneId")
    val milestoneId: String,
    @SerialName("status")
    val status: AgentTripMilestonePaidRequestStatus,
    // Absent, null or "" means the whole amount; 0 means nothing landed.
    @SerialName("paidCents")
    val paidCents: JsonElement? = null,
    // Absent or null keeps the stored one; "" clears it. No card numbers.
    @SerialName("paidReference")
    val paidReference: String? = null,
    // Absent or null keeps the stored one; "" clears it. No card numbers.
    @SerialName("paidNote")
    val paidNote: String? = null,
    // When it was paid. Not after the advisor's today.
    @SerialName("paidOn")
    val paidOn: String? = null,
)

@Serializable
data class AgentTripMilestonePaidResponse(
    @SerialName("outcome")
    val outcome: AgentTripMilestonePaidResponseOutcome,
    @SerialName("milestoneId")
    val milestoneId: String,
    // The milestone's paid amount after the write, integer minor units as a string.
    @SerialName("paidCents")
    val paidCents: String,
)

@Serializable
data class AgentTripPayLinkRequest(
    @SerialName("op")
    val op: AgentTripPayLinkRequestOp,
    @SerialName("tripId")
    val tripId: String,
    @SerialName("milestoneId")
    val milestoneId: String,
    // The supplier's own https:// payment page (or a Travefy invoice carrying supplier cost only). Null, "" or absent removes the link.
    @SerialName("payUrl")
    val payUrl: String? = null,
)

@Serializable
data class AgentTripPayLinkResponse(
    @SerialName("outcome")
    val outcome: AgentTripPayLinkResponseOutcome,
    @SerialName("milestoneId")
    val milestoneId: String,
    // The link as stored (parsed and normalised), or null when there is none.
    @SerialName("payUrl")
    val payUrl: String? = null,
)

@Serializable
data class AgentItineraryGenerateRequest(
    @SerialName("op")
    val op: AgentItineraryGenerateRequestOp,
    @SerialName("tripId")
    val tripId: String,
)

@Serializable
data class AgentItineraryGenerateResponse(
    @SerialName("outcome")
    val outcome: AgentItineraryGenerateResponseOutcome,
    @SerialName("daysAdded")
    val daysAdded: Int,
    @SerialName("activitiesAdded")
    val activitiesAdded: Int,
)

@Serializable
data class AgentItineraryDayRequest(
    @SerialName("op")
    val op: AgentItineraryDayRequestOp,
    @SerialName("tripId")
    val tripId: String,
    // Present edits that day. Absent, null or "" creates one.
    @SerialName("dayId")
    val dayId: String? = null,
    // yyyy-mm-dd. Required on a create; on an edit, absent or null keeps the stored date. A shape that is a date but not a real one is refused by Postgres (a 500), as before the port.
    @SerialName("date")
    val date: String? = null,
    // Trimmed; blank stores null.
    @SerialName("label")
    val label: String? = null,
    // Trimmed; blank stores null.
    @SerialName("summary")
    val summary: String? = null,
)

@Serializable
data class AgentItineraryDayResponse(
    @SerialName("outcome")
    val outcome: AgentItineraryDayResponseOutcome,
    @SerialName("dayId")
    val dayId: String,
)

@Serializable
data class AgentItineraryActivityRequest(
    @SerialName("op")
    val op: AgentItineraryActivityRequestOp,
    @SerialName("tripId")
    val tripId: String,
    // Present edits that activity. Absent, null or "" creates one.
    @SerialName("activityId")
    val activityId: String? = null,
    // Required on a create. On an edit, a different day moves the activity.
    @SerialName("dayId")
    val dayId: String? = null,
    // Trimmed; required.
    @SerialName("title")
    val title: String,
    // Omitted, null or "" is worked out from `startTime`.
    @SerialName("block")
    val block: AgentItineraryActivityRequestBlock? = null,
    // HH:MM or HH:MM:SS, 00:00 to 23:59:59.
    @SerialName("startTime")
    val startTime: String? = null,
    // HH:MM or HH:MM:SS, 00:00 to 23:59:59.
    @SerialName("endTime")
    val endTime: String? = null,
    @SerialName("body")
    val body: String? = null,
    @SerialName("location")
    val location: String? = null,
    @SerialName("address")
    val address: String? = null,
    @SerialName("phone")
    val phone: String? = null,
    @SerialName("confirmationNumber")
    val confirmationNumber: String? = null,
    @SerialName("gyasisTip")
    val gyasisTip: String? = null,
)

@Serializable
data class AgentItineraryActivityDeleteRequest(
    @SerialName("op")
    val op: AgentItineraryActivityDeleteRequestOp,
    @SerialName("tripId")
    val tripId: String,
    @SerialName("activityId")
    val activityId: String,
)

@Serializable
data class AgentItineraryActivityResponse(
    @SerialName("outcome")
    val outcome: AgentItineraryActivityResponseOutcome,
    @SerialName("activityId")
    val activityId: String,
)

@Serializable
data class AgentItineraryReorderRequest(
    @SerialName("op")
    val op: AgentItineraryReorderRequestOp,
    @SerialName("tripId")
    val tripId: String,
    @SerialName("dayId")
    val dayId: String,
    // Every activity on the day, in the new order. Fewer or more is a 409.
    @SerialName("activityIds")
    val activityIds: List<String>,
)

@Serializable
data class AgentItineraryReorderResponse(
    @SerialName("outcome")
    val outcome: AgentItineraryReorderResponseOutcome,
    // Activities whose position changed.
    @SerialName("moved")
    val moved: Int,
)

@Serializable
data class AgentClientFields(
    @SerialName("firstName")
    val firstName: String,
    @SerialName("lastName")
    val lastName: String,
    @SerialName("preferredName")
    val preferredName: String? = null,
    // Loose on purpose: must contain `@`, not first or last.
    @SerialName("email")
    val email: String,
    @SerialName("phone")
    val phone: String? = null,
    // `yyyy-mm-dd`.
    @SerialName("dateOfBirth")
    val dateOfBirth: String? = null,
    // Lower-cased, trimmed, blanks and repeats dropped; each at most 40 characters.
    @SerialName("tags")
    val tags: List<String>? = null,
    @SerialName("importantDates")
    val importantDates: List<JsonElement>? = null,
    @SerialName("notes")
    val notes: String? = null,
    // Mailing address. All of line1, line2, city, region and postal code blank clears it; otherwise line1, city and country are required by the table (a missing one is a 500 today, as in the Deno function).
    @SerialName("address")
    val address: JsonElement? = null,
)

@Serializable
data class AgentClientCreateRequest(
    @SerialName("op")
    val op: AgentClientCreateRequestOp,
    @SerialName("client")
    val client: AgentClientFields,
)

@Serializable
data class AgentClientUpdateRequest(
    @SerialName("op")
    val op: AgentClientUpdateRequestOp,
    @SerialName("clientId")
    val clientId: String,
    // `client.version` as the form was rendered from. A mismatch is a 409.
    @SerialName("expectedVersion")
    val expectedVersion: Int,
    // The whole record; every field is overwritten.
    @SerialName("client")
    val client: AgentClientFields,
)

@Serializable
data class AgentClientArchiveRequest(
    @SerialName("op")
    val op: AgentClientArchiveRequestOp,
    @SerialName("clientId")
    val clientId: String,
    @SerialName("expectedVersion")
    val expectedVersion: Int,
    // True archives; false restores.
    @SerialName("archived")
    val archived: Boolean,
    // Kept in the audit row of an archive only (the client table has no column for it).
    @SerialName("reason")
    val reason: String? = null,
)

@Serializable
data class AgentClientBulkTagRequest(
    @SerialName("op")
    val op: AgentClientBulkTagRequestOp,
    @SerialName("clientIds")
    val clientIds: List<String>,
    // Trimmed and lower-cased.
    @SerialName("tag")
    val tag: String,
    // True adds the tag; false removes it.
    @SerialName("add")
    val add: Boolean,
)

@Serializable
data class AgentClientCreateResponse(
    @SerialName("outcome")
    val outcome: AgentClientCreateResponseOutcome,
    // `created` only: the new client's id (a v7 minted by the server).
    @SerialName("clientId")
    val clientId: String? = null,
    // `duplicate_email` only: the live client in this book with that email.
    @SerialName("existingClientId")
    val existingClientId: String? = null,
)

@Serializable
data class AgentClientUpdateResponse(
    @SerialName("outcome")
    val outcome: AgentClientUpdateResponseOutcome,
    // Absent on `duplicate_email`.
    @SerialName("clientId")
    val clientId: String? = null,
    // The version after the write (unchanged on `noop` and `duplicate_email`).
    @SerialName("version")
    val version: Int,
)

@Serializable
data class AgentClientArchiveResponse(
    @SerialName("outcome")
    val outcome: AgentClientArchiveResponseOutcome,
    @SerialName("clientId")
    val clientId: String,
    @SerialName("version")
    val version: Int,
)

@Serializable
data class AgentClientBulkTagResponse(
    @SerialName("outcome")
    val outcome: AgentClientBulkTagResponseOutcome,
    // The tag as stored (trimmed
    @SerialName("tag")
    val tag: String,
    @SerialName("add")
    val add: Boolean,
    // Clients that actually changed.
    @SerialName("changedCount")
    val changedCount: Int,
    // Ids sent
    @SerialName("requestedCount")
    val requestedCount: Int,
)

@Serializable
data class AgentClientNoteRequest(
    @SerialName("clientId")
    val clientId: String,
    @SerialName("op")
    val op: AgentClientNoteRequestOp,
    // Required on `update` and `archive`; ignored on `create`.
    @SerialName("noteId")
    val noteId: String? = null,
    // Required on `create` and `update`, with something in it besides whitespace (an empty body is not a delete). Stored trimmed. Ignored on `archive`.
    @SerialName("body")
    val body: String? = null,
)

@Serializable
data class AgentClientNoteResponse(
    @SerialName("clientId")
    val clientId: String,
    @SerialName("noteId")
    val noteId: String,
    @SerialName("changed")
    val changed: Boolean,
    // Present only when `changed` is true.
    @SerialName("outcome")
    val outcome: AgentClientNoteResponseOutcome? = null,
)

@Serializable
data class AgentTemplateSaveRequest(
    @SerialName("op")
    val op: AgentTemplateSaveRequestOp,
    @SerialName("tripId")
    val tripId: String,
    // Trimmed.
    @SerialName("name")
    val name: String,
    // Trimmed; blank or absent stores none.
    @SerialName("description")
    val description: String? = null,
)

@Serializable
data class AgentTemplateUpdateRequest(
    @SerialName("op")
    val op: AgentTemplateUpdateRequestOp,
    @SerialName("templateId")
    val templateId: String,
    @SerialName("name")
    val name: String,
    // Blank or absent CLEARS the stored description.
    @SerialName("description")
    val description: String? = null,
)

@Serializable
data class AgentTemplateArchiveRequest(
    @SerialName("op")
    val op: AgentTemplateArchiveRequestOp,
    @SerialName("templateId")
    val templateId: String,
)

@Serializable
data class AgentTemplateApplyRequest(
    @SerialName("op")
    val op: AgentTemplateApplyRequestOp,
    @SerialName("templateId")
    val templateId: String,
    @SerialName("tripId")
    val tripId: String,
)

@Serializable
data class AgentTemplateSaveResponse(
    @SerialName("templateId")
    val templateId: String,
    @SerialName("componentsSaved")
    val componentsSaved: Int,
    @SerialName("daysSaved")
    val daysSaved: Int,
)

@Serializable
data class AgentTemplateOutcomeResponse(
    // `update` answers changed or noop; `archive` answers archived.
    @SerialName("outcome")
    val outcome: AgentTemplateOutcomeResponseOutcome,
)

@Serializable
data class AgentTemplateApplyResponse(
    @SerialName("outcome")
    val outcome: AgentTemplateApplyResponseOutcome,
    @SerialName("componentsAdded")
    val componentsAdded: Int,
    // 0 when the trip has no start date.
    @SerialName("daysAdded")
    val daysAdded: Int,
    @SerialName("activitiesAdded")
    val activitiesAdded: Int,
)

@Serializable
data class AgentMessageTemplateWriteRequest(
    @SerialName("op")
    val op: AgentMessageTemplateWriteRequestOp,
    // `create`: a fresh client-minted v7 (older than an hour is a 400). `update`: the template's id.
    @SerialName("templateId")
    val templateId: String,
    @SerialName("category")
    val category: AgentMessageTemplateWriteRequestCategory,
    // Trimmed.
    @SerialName("name")
    val name: String,
    // Kept as written (not trimmed). Every `{{ token }}` must be one of client.firstName, trip.name, trip.destination, trip.dates, agent.firstName, payment.label, payment.amount, payment.dueDate, payment.link.
    @SerialName("body")
    val body: String,
    // Trimmed; blanks and repeats (ignoring case, first spelling kept) dropped; at most 10 of at most 30 characters.
    @SerialName("tags")
    val tags: List<String>? = null,
)

@Serializable
data class AgentMessageTemplateDuplicateRequest(
    @SerialName("op")
    val op: AgentMessageTemplateDuplicateRequestOp,
    // The template to copy.
    @SerialName("templateId")
    val templateId: String,
    // A fresh client-minted v7 for the copy.
    @SerialName("newTemplateId")
    val newTemplateId: String,
)

@Serializable
data class AgentMessageTemplateArchiveRequest(
    @SerialName("op")
    val op: AgentMessageTemplateArchiveRequestOp,
    @SerialName("templateId")
    val templateId: String,
    // True archives; false restores.
    @SerialName("archived")
    val archived: Boolean,
)

@Serializable
data class AgentMessageTemplateResponse(
    // `create`: created or exists. `update`: changed or noop. `duplicate`: created or exists. `archive`: changed or noop.
    @SerialName("outcome")
    val outcome: AgentMessageTemplateResponseOutcome,
    // `create`, `update` and `duplicate` (the copy's id); absent on `archive`.
    @SerialName("templateId")
    val templateId: String? = null,
)

@Serializable
data class AgentSettingsProfileRequest(
    @SerialName("op")
    val op: AgentSettingsProfileRequestOp,
    // Trimmed.
    @SerialName("displayName")
    val displayName: String,
    @SerialName("pronouns")
    val pronouns: String? = null,
    // Digits and `+ - ( ) . x` and spaces, at least 7 digits.
    @SerialName("phone")
    val phone: String? = null,
    @SerialName("bio")
    val bio: String? = null,
    // Normalised to https links. Instagram and Facebook take a bare handle or @handle; a link without a scheme gets https://; http:// is refused; the three networks must link to their own site with a path. Empty values are dropped.
    @SerialName("socialLinks")
    val socialLinks: JsonElement? = null,
)

@Serializable
data class AgentSettingsAvatarRequest(
    @SerialName("op")
    val op: AgentSettingsAvatarRequestOp,
    // The photo's bytes.
    @SerialName("image")
    val image: String,
)

@Serializable
data class AgentSettingsRemoveAvatarRequest(
    @SerialName("op")
    val op: AgentSettingsRemoveAvatarRequestOp,
)

@Serializable
data class AgentSettingsAvailabilityRequest(
    @SerialName("op")
    val op: AgentSettingsAvailabilityRequestOp,
    @SerialName("timeZone")
    val timeZone: AgentSettingsAvailabilityRequestTimeZone,
    // Every day, either null (off) or From and To on the half hour, ending after it starts ("24:00" may end one).
    @SerialName("weeklySchedule")
    val weeklySchedule: JsonElement,
    // One of 2, 4, 12, 24 or 48 (anything else is a 400). Written as prose, not an enum, because the Kotlin generator emits enums of strings only.
    @SerialName("responseTimeHours")
    val responseTimeHours: Int,
)

@Serializable
data class AgentSettingsDayHours(
    @SerialName("start")
    val start: String,
    @SerialName("end")
    val end: String,
)

@Serializable
data class AgentSettingsSaveTimeOffRequest(
    @SerialName("op")
    val op: AgentSettingsSaveTimeOffRequestOp,
    // With `isNew`, a fresh client-minted v7 (older than an hour is a 400); otherwise the block to edit.
    @SerialName("timeOffId")
    val timeOffId: String,
    // Only `true` creates.
    @SerialName("isNew")
    val isNew: Boolean? = null,
    // Today or later in the advisor's zone.
    @SerialName("startsOn")
    val startsOn: String,
    // On or after startsOn
    @SerialName("endsOn")
    val endsOn: String,
    @SerialName("label")
    val label: String? = null,
    @SerialName("autoReplyEnabled")
    val autoReplyEnabled: Boolean? = null,
    // Required when autoReplyEnabled; only `{{return_date}}` may be filled.
    @SerialName("autoReplyText")
    val autoReplyText: String? = null,
)

@Serializable
data class AgentSettingsEndTimeOffRequest(
    @SerialName("op")
    val op: AgentSettingsEndTimeOffRequestOp,
    @SerialName("timeOffId")
    val timeOffId: String,
)

@Serializable
data class AgentSettingsNotificationsRequest(
    @SerialName("op")
    val op: AgentSettingsNotificationsRequestOp,
    @SerialName("clientMessagesPush")
    val clientMessagesPush: Boolean,
    @SerialName("clientMessagesEmail")
    val clientMessagesEmail: Boolean,
    @SerialName("quoteRequestsPush")
    val quoteRequestsPush: Boolean,
    @SerialName("quoteRequestsEmail")
    val quoteRequestsEmail: Boolean,
)

@Serializable
data class AgentSettingsSignatureRequest(
    @SerialName("op")
    val op: AgentSettingsSignatureRequestOp,
    // Plain text, at most 8 lines; only {{agent.name}}, {{agent.phone}} and {{agent.email}}. Empty, absent or the default's exact text stores none (the default is used).
    @SerialName("signature")
    val signature: String? = null,
)

@Serializable
data class AgentSettingsResponse(
    // `save_time_off`: created, updated or unchanged. `end_time_off`: deleted (it had not started) or ended (it was running and now ends yesterday). Every other op: updated or unchanged.
    @SerialName("outcome")
    val outcome: AgentSettingsResponseOutcome,
    // `set_avatar` only: the stored photo's path, to put on a public Storage origin.
    @SerialName("avatarPath")
    val avatarPath: String? = null,
    // `save_time_off` only.
    @SerialName("timeOffId")
    val timeOffId: String? = null,
)

@Serializable
data class AgentCommissionLineFields(
    @SerialName("supplierId")
    val supplierId: String,
    // Gross booking value in cents. Required (absent or blank is a 400, never $0).
    @SerialName("grossCents")
    val grossCents: JsonElement,
    // 0 to 100; rounded to two decimals. Required.
    @SerialName("commissionPct")
    val commissionPct: JsonElement,
    @SerialName("paymentTerms")
    val paymentTerms: AgentCommissionLineFieldsPaymentTerms,
    // Whole days from 0 to 365.
    @SerialName("paymentLagDays")
    val paymentLagDays: JsonElement,
    // Trimmed; blank is none. Unique per advisor.
    @SerialName("inteletravelReference")
    val inteletravelReference: String? = null,
    // Trimmed; blank is none. Never exported.
    @SerialName("notes")
    val notes: String? = null,
)

@Serializable
data class AgentCommissionPaymentRequest(
    @SerialName("op")
    val op: AgentCommissionPaymentRequestOp,
    @SerialName("commissionId")
    val commissionId: String,
    @SerialName("expectedVersion")
    val expectedVersion: Int,
    @SerialName("status")
    val status: AgentCommissionPaymentRequestStatus,
    // Required. `received` with 0 is a 400 (record it as disputed instead).
    @SerialName("receivedCents")
    val receivedCents: JsonElement,
    // Optional; absent or blank is 0.
    @SerialName("feeCents")
    val feeCents: JsonElement? = null,
    // A real calendar date. One after the advisor's today is the `bad_date` outcome.
    @SerialName("receivedAt")
    val receivedAt: String,
)

@Serializable
data class AgentCommissionRemoveRequest(
    @SerialName("op")
    val op: AgentCommissionRemoveRequestOp,
    @SerialName("commissionId")
    val commissionId: String,
    @SerialName("expectedVersion")
    val expectedVersion: Int,
)

@Serializable
data class AgentCommissionExportRequest(
    @SerialName("op")
    val op: AgentCommissionExportRequestOp,
    // The ledger's filters, as the web's ledgerQueryFromParams writes them. All optional.
    @SerialName("filters")
    val filters: JsonElement? = null,
)

@Serializable
data class AgentCommissionStageWeights(
    @SerialName("inquiry")
    val inquiry: Int,
    @SerialName("proposal")
    val proposal: Int,
    @SerialName("booked")
    val booked: Int,
    @SerialName("in_progress")
    val in_progress: Int,
)

@Serializable
data class AgentCommissionWeightsRequest(
    @SerialName("op")
    val op: AgentCommissionWeightsRequestOp,
    // The weights the screen showed. If the stored ones differ, the save is a 409.
    @SerialName("expected")
    val expected: AgentCommissionStageWeights,
    @SerialName("weights")
    val weights: AgentCommissionStageWeights,
)

@Serializable
data class AgentCommissionCreateResponse(
    @SerialName("outcome")
    val outcome: AgentCommissionCreateResponseOutcome,
    // Only on `created`. Minted by the server (v7).
    @SerialName("commissionId")
    val commissionId: String? = null,
    // Only on `created`: always 1.
    @SerialName("version")
    val version: Int? = null,
)

/** `update` and `remove`. `commissionId` is echoed as it was sent. */
@Serializable
data class AgentCommissionLineResponse(
    @SerialName("outcome")
    val outcome: AgentCommissionLineResponseOutcome,
    @SerialName("commissionId")
    val commissionId: String,
    // The line's version now (after the write on changed / removed).
    @SerialName("version")
    val version: Int,
)

@Serializable
data class AgentCommissionPaymentResponse(
    @SerialName("outcome")
    val outcome: AgentCommissionPaymentResponseOutcome,
    @SerialName("commissionId")
    val commissionId: String,
    @SerialName("version")
    val version: Int,
    // Expected - fee - received, in cents as a digit-string. Null on `bad_date`.
    @SerialName("gapCents")
    val gapCents: String? = null,
)

@Serializable
data class AgentCommissionExportResponse(
    @SerialName("outcome")
    val outcome: AgentCommissionExportResponseOutcome,
    @SerialName("rowCount")
    val rowCount: Int,
    // RFC 4180, CRLF line ends with a trailing CRLF, no byte-order mark. Money as exact decimals ("1234.56"); a text cell starting with = + - @ tab or CR is prefixed with an apostrophe. Notes are not exported.
    @SerialName("csv")
    val csv: String,
)

@Serializable
data class AgentCommissionWeightsResponse(
    @SerialName("outcome")
    val outcome: AgentCommissionWeightsResponseOutcome,
)

@Serializable
data class CommissionImportUploadRequest(
    @SerialName("op")
    val op: CommissionImportUploadRequestOp,
    // The name the advisor will recognise. Path parts are dropped; at most 255 characters kept.
    @SerialName("filename")
    val filename: String,
    // The CSV's bytes, base64 (forgiving: white space and padding as atob takes them).
    @SerialName("fileBase64")
    val fileBase64: String,
)

/** Statement field to a 0-based column of the file. `received` is required; null is unmapped. */
@Serializable
data class CommissionImportColumnMap(
    @SerialName("reference")
    val reference: Int? = null,
    @SerialName("supplier")
    val supplier: Int? = null,
    @SerialName("traveler")
    val traveler: Int? = null,
    @SerialName("gross")
    val gross: Int? = null,
    @SerialName("received")
    val received: Int? = null,
    @SerialName("fee")
    val fee: Int? = null,
    @SerialName("paid_on")
    val paid_on: Int? = null,
)

@Serializable
data class CommissionImportMapRequest(
    @SerialName("op")
    val op: CommissionImportMapRequestOp,
    @SerialName("importId")
    val importId: String,
    @SerialName("expectedVersion")
    val expectedVersion: Int,
    @SerialName("columnMap")
    val columnMap: CommissionImportColumnMap,
    // The paid-on date for rows with none. Blank or null is none. Required when no `paid_on` column is mapped.
    @SerialName("statementDate")
    val statementDate: String? = null,
)

@Serializable
data class CommissionImportResolveRequest(
    @SerialName("op")
    val op: CommissionImportResolveRequestOp,
    @SerialName("importId")
    val importId: String,
    @SerialName("expectedVersion")
    val expectedVersion: Int,
    @SerialName("action")
    val action: CommissionImportResolveRequestAction,
    @SerialName("rowId")
    val rowId: String,
    // `match` only: the unpaid line this row pays.
    @SerialName("commissionId")
    val commissionId: String? = null,
    // `create` only.
    @SerialName("tripId")
    val tripId: String? = null,
    // `create` only.
    @SerialName("supplierId")
    val supplierId: String? = null,
    // `create` only; required.
    @SerialName("grossCents")
    val grossCents: JsonElement? = null,
    // `create` only; required, rounded to two decimals.
    @SerialName("commissionPct")
    val commissionPct: JsonElement? = null,
)

/** `reconcile` and `discard`. */
@Serializable
data class CommissionImportStatementRequest(
    @SerialName("op")
    val op: CommissionImportStatementRequestOp,
    @SerialName("importId")
    val importId: String,
    @SerialName("expectedVersion")
    val expectedVersion: Int,
)

@Serializable
data class CommissionImportUploadResponse(
    @SerialName("outcome")
    val outcome: CommissionImportUploadResponseOutcome,
    // The new statement's id, or (`duplicate_file`) the earlier one's.
    @SerialName("importId")
    val importId: String,
    // `uploaded` only: the data rows read.
    @SerialName("rowCount")
    val rowCount: Int? = null,
    // `duplicate_file` only: when the earlier statement was uploaded.
    @SerialName("uploadedAt")
    val uploadedAt: String? = null,
)

/** `map`, `resolve` and `discard`. `importId` is echoed as it was sent. */
@Serializable
data class CommissionImportResponse(
    @SerialName("outcome")
    val outcome: CommissionImportResponseOutcome,
    @SerialName("importId")
    val importId: String,
    // The statement's version now. Send it as the next `expectedVersion`.
    @SerialName("version")
    val version: Int,
)

@Serializable
data class CommissionImportReconcileResponse(
    @SerialName("outcome")
    val outcome: CommissionImportReconcileResponseOutcome,
    @SerialName("importId")
    val importId: String,
    @SerialName("version")
    val version: Int,
    // Lines marked received.
    @SerialName("paid")
    val paid: Int,
    // Lines created and marked received.
    @SerialName("created")
    val created: Int,
    @SerialName("alreadyRecorded")
    val alreadyRecorded: Int,
    // `needs_decisions`: rows still suggested, unmatched, duplicate or unreadable.
    @SerialName("blocking")
    val blocking: Int,
)

@Serializable
data class AgentReportExportRequest(
    @SerialName("op")
    val op: AgentReportExportRequestOp,
    @SerialName("report")
    val report: AgentReportExportRequestReport,
    // Required for every report but clients and pipeline, which take none (one sent is a 400, not ignored).
    @SerialName("period")
    val period: AgentReportExportRequestPeriod? = null,
    // Required for revenue; refused for every other report.
    @SerialName("basis")
    val basis: AgentReportExportRequestBasis? = null,
)

@Serializable
data class AgentReportCenterRequest(
    @SerialName("op")
    val op: AgentReportCenterRequestOp,
    @SerialName("type")
    val type: AgentReportCenterRequestType,
    // Required (a real date, on or before `to`) for every type but clients, which takes none.
    @SerialName("from")
    val from: String? = null,
    @SerialName("to")
    val to: String? = null,
    // Adds email, phone and mailing address columns. Clients only; true on any other type is a 400. Only the JSON values true, false and null are accepted.
    @SerialName("includeContact")
    val includeContact: Boolean? = null,
)

@Serializable
data class AgentReportFile(
    @SerialName("outcome")
    val outcome: AgentReportFileOutcome,
    // The rows SQL returned (for the funnel, the four stages; for the pipeline, stages plus month buckets).
    @SerialName("rowCount")
    val rowCount: Int,
    @SerialName("csv")
    val csv: String,
    // "revenue-booked-2026-01-01-to-2026-10-21.csv": the period it covers. Clients and the pipeline are dated by the advisor's own day ("clients-lifetime-value-2026-10-21.csv", "clients-with-contact-details-2026-10-21.csv").
    @SerialName("fileName")
    val fileName: String,
)

@Serializable
data class AccountAdminEmailRequest(
    @SerialName("op")
    val op: AccountAdminEmailRequestOp,
    @SerialName("clientId")
    val clientId: String,
)

@Serializable
data class AccountAdminEmailResponse(
    // `failed`: GoTrue could not make the link, or the mail server refused the message. The claim still counts toward the hourly cap.
    @SerialName("outcome")
    val outcome: AccountAdminEmailResponseOutcome,
    // Present with `sent` only.
    @SerialName("kind")
    val kind: AccountAdminEmailResponseKind? = null,
    // Present with `refused` only. The sentence the tab shows.
    @SerialName("reason")
    val reason: String? = null,
)

@Serializable
data class AccountAdminVerifyEmailRequest(
    @SerialName("op")
    val op: AccountAdminVerifyEmailRequestOp,
    @SerialName("clientId")
    val clientId: String,
    // How the advisor confirmed the address. Trimmed; UTF-16 lengths.
    @SerialName("note")
    val note: String,
)

@Serializable
data class AccountAdminVerifyEmailResponse(
    @SerialName("outcome")
    val outcome: AccountAdminVerifyEmailResponseOutcome,
    // Present with `refused` only.
    @SerialName("reason")
    val reason: String? = null,
    // Present with `duplicate` only: the other record when it is this advisor's, null when it belongs to another advisor (its id is never shown across books).
    @SerialName("duplicateClientId")
    val duplicateClientId: String? = null,
)

@Serializable
data class AccountAdminLockRequest(
    @SerialName("op")
    val op: AccountAdminLockRequestOp,
    @SerialName("clientId")
    val clientId: String,
    // Trimmed; UTF-16 lengths. Recorded on the account and the audit row.
    @SerialName("reason")
    val reason: String,
)

@Serializable
data class AccountAdminLockResponse(
    @SerialName("outcome")
    val outcome: AccountAdminLockResponseOutcome,
    // Present with `changed` only. Always 0 on `unlock`.
    @SerialName("sessionsEnded")
    val sessionsEnded: Int? = null,
    // Present with `refused` only.
    @SerialName("reason")
    val reason: String? = null,
)

@Serializable
data class AccountAdminSignOutRequest(
    @SerialName("op")
    val op: AccountAdminSignOutRequestOp,
    @SerialName("clientId")
    val clientId: String,
)

/** A client with no sign-in is a 404. */
@Serializable
data class AccountAdminSignOutResponse(
    @SerialName("outcome")
    val outcome: AccountAdminSignOutResponseOutcome,
    @SerialName("sessionsEnded")
    val sessionsEnded: Int,
)

@Serializable
data class AccountAdminFlagRequest(
    @SerialName("op")
    val op: AccountAdminFlagRequestOp,
    @SerialName("clientId")
    val clientId: String,
    // One of this client's sign-ins. Anyone else's is a 404.
    @SerialName("authEventId")
    val authEventId: String,
)

@Serializable
data class AccountAdminFlagResponse(
    @SerialName("outcome")
    val outcome: AccountAdminFlagResponseOutcome,
)

@Serializable
data class AccountAdminMergeRequest(
    @SerialName("op")
    val op: AccountAdminMergeRequestOp,
    // The record KEPT.
    @SerialName("clientId")
    val clientId: String,
    // The record retired (it becomes `merged_into` and is never deleted).
    @SerialName("otherClientId")
    val otherClientId: String,
    @SerialName("keepVersion")
    val keepVersion: Int,
    @SerialName("otherVersion")
    val otherVersion: Int,
    // Field name to `keep` or `retire`, for the fields the advisor flipped; the rest take their default. Keys are lower-case field names (`^[a-z_]{1,40}$`). The email is pinned to the surviving sign-in's address and cannot be flipped.
    @SerialName("choices")
    val choices: JsonElement? = null,
)

@Serializable
data class AccountAdminMergeResponse(
    @SerialName("outcome")
    val outcome: AccountAdminMergeResponseOutcome,
    // With `refused`: the kept record is archived, the two would have more than 12 companions, or the kept record would have no first or last name.
    @SerialName("reason")
    val reason: String? = null,
    // Present with `merged` only.
    @SerialName("keptClientId")
    val keptClientId: String? = null,
    // Present with `merged` only. What moved from the retired record.
    @SerialName("counts")
    val counts: JsonElement? = null,
)

/** Every field is optional, and a body that is missing, not JSON, or not an object is */
/** read as `{"trigger":"cron"}`. */
@Serializable
data class CruiseSyncRequest(
    // "manual" marks a person's run; anything else (or nothing) is "cron".
    @SerialName("trigger")
    val trigger: CruiseSyncRequestTrigger? = null,
    // Narrows a run to the one `cruise_sync_scope` whose `label` this is (trimmed; a
    // blank or non-string value is ignored). For manual runs: verifying one scope should
    // not spend the others' requests. pg_cron never sends it.
    @SerialName("scope")
    val scope: String? = null,
    // Refetch this `cruise_sailing` instead of running the schedule. Any UUID shape
    // (either letter case); anything else, null included, is 400.
    @SerialName("sailingId")
    val sailingId: String? = null,
)

@Serializable
data class CruiseSyncRunResponse(
    // The `cruise_sync_run` row, which holds the same counts and the cause.
    @SerialName("runId")
    val runId: String,
    // `partial` when some scope failed, the relay throttled the run, or a scope spent
    // requests and stored nothing; `failed` when that happened before any scope finished;
    // `skipped` when the budget is spent or an earlier run is still going.
    @SerialName("status")
    val status: CruiseSyncRunResponseStatus,
    @SerialName("scopesRun")
    val scopesRun: Int,
    // Provider HTTP attempts this run made, retries included.
    @SerialName("requestsSpent")
    val requestsSpent: Int,
    @SerialName("rowsUpserted")
    val rowsUpserted: Int,
    // Rows soft-archived after a complete pass (cruise lines and ships only).
    @SerialName("rowsArchived")
    val rowsArchived: Int,
    @SerialName("budget")
    val budget: JsonElement,
    // Why scopes were skipped, deferred, stopped or failed, in order. Empty on a clean run.
    @SerialName("notes")
    val notes: List<String>,
)

@Serializable
data class CruiseSyncRefetchResponse(
    @SerialName("sailingId")
    val sailingId: String,
    // The provider's id for the sailing (`cruise_sailing.provider_key`).
    @SerialName("cruiseId")
    val cruiseId: String? = null,
    // The provider's company for the line; null when the line has no provider coverage.
    @SerialName("company")
    val company: String? = null,
    @SerialName("cabinPricesWritten")
    val cabinPricesWritten: Int,
    @SerialName("portCallsWritten")
    val portCallsWritten: Int,
    // The refreshed lead fare in minor units, only when the provider answered in the
    // sailing's own market; otherwise null and the stored fare is left alone. Internal
    // (Data-Model §24.4): never shown on a public page.
    @SerialName("leadPriceCents")
    val leadPriceCents: Int? = null,
    // ISO 4217, beside leadPriceCents.
    @SerialName("currency")
    val currency: String? = null,
    // The budget after this request (before it, when nothing was spent).
    @SerialName("budget")
    val budget: JsonElement,
    // Present when no request was spent (the line has no provider coverage, or the
    // budget is gone, with the reason), or when the provider answered in another market
    // (cabin prices were still stored, tagged with that market). Absent otherwise.
    @SerialName("skipped")
    val skipped: String? = null,
)

@Serializable
data class PushDispatchResponse(
    // Notification rows finished as sent (a summary counts each row it covered).
    @SerialName("sent")
    val sent: Int,
    // Rows finished as not sent (back to pending, cleared for a newer row of the same thread, or failed on their third try).
    @SerialName("retried")
    val retried: Int,
    // Owed dismisses claimed and sent to the advisor's phones (counted even when they have none).
    @SerialName("dismissed")
    val dismissed: Int,
    // Devices forgotten because their push service said they no longer exist.
    @SerialName("gone")
    val gone: Int,
)

@Serializable
data class EmailDispatchResponse(
    // Client emails finished as sent.
    @SerialName("sent")
    val sent: Int,
    // Advisor alert emails finished as sent.
    @SerialName("alertsSent")
    val alertsSent: Int,
    // Emails and alerts finished as not sent and not failed (back to pending, or cleared for a newer row of the same thread).
    @SerialName("retried")
    val retried: Int,
    // Emails and alerts failed for good (a 5xx, nothing honest to send, or the third try).
    @SerialName("failed")
    val failed: Int,
    // Claimed rows put back unsent, with no try counted, because the pass ran out of time.
    @SerialName("released")
    val released: Int,
)

@Serializable
data class EmailInboxResponse(
    // Messages handled this run (the sum of `outcomes`).
    @SerialName("read")
    val read: Int,
    // How many messages ended each way, keyed in the order first seen. Only outcomes that
    // occurred appear. Keys: the `email_inbound_record` outcomes (`accepted`,
    // `unknown_token`, `expired_token`, `sender_mismatch`, `thread_closed`, `empty`,
    // `too_long`, `auto_reply`), plus `duplicate` (a re-delivered copy of a message already
    // recorded), `too_large` (over 1,000,000 octets, never read) and `failed` (could not be
    // read; moved to `Failed`).
    @SerialName("outcomes")
    val outcomes: JsonElement,
    // Messages left in INBOX because the run ran out of time.
    @SerialName("skipped")
    val skipped: Int,
    // Handled messages older than 30 days deleted from Processed, Rejected and Failed.
    @SerialName("purged")
    val purged: Int,
)

@Serializable
data class EmailUnsubscribeRequest(
    // The unsubscribe token; null or absent uses ?t=.
    @SerialName("token")
    val token: String? = null,
    @SerialName("on")
    val on: Boolean,
)

@Serializable
data class EmailUnsubscribeResponse(
    @SerialName("status")
    val status: EmailUnsubscribeResponseStatus? = null,
)
