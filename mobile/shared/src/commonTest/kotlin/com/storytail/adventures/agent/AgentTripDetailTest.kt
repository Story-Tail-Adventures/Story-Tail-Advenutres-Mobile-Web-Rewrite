package com.storytail.adventures.agent

import com.storytail.adventures.api.AgentTripActivity
import com.storytail.adventures.api.AgentTripActivityRow
import com.storytail.adventures.api.AgentTripComponentRow
import com.storytail.adventures.api.AgentTripDayRowLike
import com.storytail.adventures.api.AgentTripDetailSnapshot
import com.storytail.adventures.api.AgentTripDocumentRow
import com.storytail.adventures.api.AgentTripItineraryDay
import com.storytail.adventures.api.AgentTripMessageRow
import com.storytail.adventures.api.AgentTripOverviewRow
import com.storytail.adventures.api.AgentTripPaymentRow
import com.storytail.adventures.api.groupIntoDays
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.componentKindLabel
import com.storytail.adventures.domain.agent.documentKindLabel
import com.storytail.adventures.domain.agent.itineraryBlockLabel
import com.storytail.adventures.domain.agent.milestoneStatusLabel
import com.storytail.adventures.domain.agent.refundStatusLabel
import com.storytail.adventures.domain.agent.senderRoleLabel
import com.storytail.adventures.domain.trip.StatusChip
import com.storytail.adventures.domain.trip.TripStatusMessages
import com.storytail.adventures.domain.trip.tripTypeLabel
import com.storytail.adventures.ui.components.client.formatMoney
import com.storytail.adventures.ui.screens.agent.agentTripDetailUiState
import com.storytail.adventures.ui.screens.agent.hhmm
import com.storytail.adventures.ui.screens.agent.monthDay
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * §3.4.2's derivations on the phone.
 *
 * WHAT IS ASSERTED HERE AND NOT ON THE WEB. Three things in this file cannot be checked by
 * `check_copy_parity.py` because their web twin is not a flat const — document kinds are a
 * `Record` in a `.tsx`, refund statuses a nested array in `cancelTrip.ts`, sender roles an
 * inline ternary — so the exact labels are pinned by assertion instead. That is the
 * arrangement `content.test.ts` already uses for the keys `web_messages` skips.
 *
 * And two things neither surface can get right by accident:
 *
 *   * THE STATUS CHIP FOLDS THE NEXT UNPAID MILESTONE IN AND THE TIMELINE MUST NOT. Both
 *     call the same function. One passes today, one passes the epoch, and getting that
 *     backwards relabels a past `booked` transition as "Final payment due" — a history row
 *     claiming something that did not happen.
 *   * THE SUMMARY LINE AND THE CHIP MUST SELECT ON THE SAME STATUS SET. The accessor picks
 *     `next_unpaid_due_date` with `status IN ('scheduled','overdue')`; if this file's filter
 *     disagreed, one line of the screen would say "All payments settled." while the chip
 *     above it said "Final payment due".
 */
class AgentTripDetailTest {

    // ── Fixtures ────────────────────────────────────────────────────────────────

    private fun overview(
        status: String = "booked",
        nextUnpaidDueDate: String? = null,
        asOfDate: String = "2026-10-01",
        tripType: String = "all_inclusive",
        destinations: List<String> = listOf("Negril, Jamaica"),
        cancellationReason: String? = null,
        refundStatus: String? = null,
        refundDetail: String? = null,
        notes: String? = null,
        cardLast4: String? = "4242",
        cardBrand: String? = "visa",
        cardSpendingLimitCents: Long? = 900_000,
        lastActivityAt: String? = null,
        componentCount: Int = 6,
    ) = AgentTripOverviewRow(
        tripId = "t-40",
        clientId = "c-7",
        clientName = "Jordan Hayes",
        title = "Anniversary Week in Negril",
        tripType = tripType,
        status = status,
        startDate = "2026-12-04",
        endDate = "2026-12-11",
        destinations = destinations,
        travelerCount = 6,
        totalValueCents = 1_284_500,
        totalPaidCents = 500_000,
        totalCommissionCents = 131_800,
        currency = "USD",
        cancellationReason = cancellationReason,
        refundStatus = refundStatus,
        refundDetail = refundDetail,
        notes = notes,
        cardLast4 = cardLast4,
        cardBrand = cardBrand,
        cardSpendingLimitCents = cardSpendingLimitCents,
        lastActivityAt = lastActivityAt,
        componentCount = componentCount,
        nextUnpaidDueDate = nextUnpaidDueDate,
        asOfDate = asOfDate,
    )

    private fun milestone(
        id: String,
        status: String,
        due: String?,
        amount: Long = 200_000,
        paid: Long = 0,
    ) = AgentTripPaymentRow(
        milestoneId = id,
        label = "Final balance",
        amountCents = amount,
        paidCents = paid,
        currency = "USD",
        dueDate = due,
        status = status,
    )

    private fun snapshot(
        overview: AgentTripOverviewRow = overview(),
        components: List<AgentTripComponentRow> = emptyList(),
        days: List<AgentTripItineraryDay> = emptyList(),
        itineraryPublished: Boolean = false,
        payments: List<AgentTripPaymentRow> = emptyList(),
        documents: List<AgentTripDocumentRow> = emptyList(),
        messages: List<AgentTripMessageRow> = emptyList(),
        activity: List<AgentTripActivityRow> = emptyList(),
    ) = AgentTripDetailSnapshot(
        overview = overview,
        components = components,
        days = days,
        itineraryPublished = itineraryPublished,
        payments = payments,
        documents = documents,
        messages = messages,
        activity = activity,
    )

    private fun ui(snapshot: AgentTripDetailSnapshot) =
        agentTripDetailUiState(snapshot) { cents, currency -> formatMoney(cents, currency) }

    // ── The chip ────────────────────────────────────────────────────────────────

    @Test
    fun a_booked_trip_with_a_balance_inside_the_window_says_final_payment_due() {
        val state = ui(snapshot(overview(status = "booked", nextUnpaidDueDate = "2026-10-12")))
        assertEquals(TripStatusMessages.FINAL_PAYMENT_DUE, state.statusLabel)
        assertEquals(StatusChip.DUE, state.statusChip)
    }

    @Test
    fun a_booked_trip_with_a_distant_balance_says_booked() {
        val state = ui(snapshot(overview(status = "booked", nextUnpaidDueDate = "2026-12-01")))
        assertEquals(TripStatusMessages.BOOKED, state.statusLabel)
        assertEquals(StatusChip.BOOKED, state.statusChip)
    }

    @Test
    fun a_cancelled_trip_with_an_unpaid_milestone_is_still_cancelled() {
        // The override is checked AFTER cancelled on purpose. A cancelled trip with money
        // outstanding is not "Final payment due" — the refund line is what speaks to the
        // money, and §2.2.10 is where the traveler reads it.
        val state = ui(snapshot(overview(status = "cancelled", nextUnpaidDueDate = "2026-10-02")))
        assertEquals(TripStatusMessages.CANCELLED, state.statusLabel)
        assertEquals(StatusChip.CANCELLED, state.statusChip)
    }

    @Test
    fun an_unrecognised_stage_gets_no_chip_rather_than_the_wrong_one() {
        // A sixth `trip_status` member added server-side. Defaulting the chip to INQUIRY
        // would paint it in inquiry colours and state a stage confidently and wrongly.
        val state = ui(snapshot(overview(status = "on_hold")))
        assertEquals("on_hold", state.statusLabel)
        assertNull(state.statusChip)
    }

    @Test
    fun the_timeline_labels_a_stage_without_folding_todays_milestone_in() {
        // The trip's balance is eleven days out, so the CHIP says "Final payment due". A
        // history row recording the move to `booked` must still say "Booked": that is what
        // happened at the time, and relabelling it would put a claim in the audit view that
        // no event supports.
        val state = ui(
            snapshot(
                overview = overview(status = "booked", nextUnpaidDueDate = "2026-10-12"),
                activity = listOf(
                    AgentTripActivityRow(
                        historyId = "h1",
                        fromStatus = "proposal",
                        toStatus = "booked",
                        changedAt = "2026-09-14T10:00:00Z",
                        changedByName = "Gyasi Story",
                    ),
                ),
            ),
        )
        assertEquals(TripStatusMessages.FINAL_PAYMENT_DUE, state.statusLabel)
        assertEquals(
            "${TripStatusMessages.PROPOSAL_READY} → ${TripStatusMessages.BOOKED}",
            state.activity.single().description,
        )
    }

    @Test
    fun the_first_timeline_entry_has_no_arrow() {
        val state = ui(
            snapshot(
                activity = listOf(
                    AgentTripActivityRow("h0", null, "inquiry", "2026-08-01T09:00:00Z", null),
                ),
            ),
        )
        assertEquals(TripStatusMessages.INQUIRY, state.activity.single().description)
        assertTrue(!state.activity.single().description.contains("→"))
    }

    // ── The payments summary ────────────────────────────────────────────────────

    @Test
    fun no_schedule_and_a_settled_schedule_are_different_sentences() {
        assertEquals(AgentCopy.TRIP_PAYMENTS_EMPTY, ui(snapshot()).paymentsSummary)
        assertEquals(
            AgentCopy.TRIP_PAYMENTS_ALL_SETTLED,
            ui(snapshot(payments = listOf(milestone("m1", "paid", "2026-08-01")))).paymentsSummary,
        )
    }

    @Test
    fun a_waived_milestone_counts_as_settled_and_is_never_the_next_one_due() {
        // THE ACCESSOR'S OWN RULE, and the two must agree or the screen contradicts itself:
        // `agent_trip_overview` picks next_unpaid_due_date with
        // `status IN ('scheduled','overdue')`, so a waived milestone cannot make a trip say
        // "Final payment due". If this filter counted it as outstanding, the summary line
        // would name a milestone the chip above had already discounted.
        val allSettled = ui(
            snapshot(
                payments = listOf(
                    milestone("m1", "paid", "2026-08-01"),
                    milestone("m2", "waived", "2026-09-01"),
                ),
            ),
        )
        assertEquals(AgentCopy.TRIP_PAYMENTS_ALL_SETTLED, allSettled.paymentsSummary)

        val withOutstanding = ui(
            snapshot(
                payments = listOf(
                    // Earliest date, but waived — it must not be picked.
                    milestone("m2", "waived", "2026-09-01"),
                    milestone("m3", "scheduled", "2026-10-12", amount = 784_500),
                ),
            ),
        )
        assertTrue(withOutstanding.paymentsSummary.contains("Oct 12"))
        assertTrue(withOutstanding.paymentsSummary.contains("$7,845"))
    }

    @Test
    fun the_next_one_due_is_the_earliest_dated_outstanding_milestone() {
        val state = ui(
            snapshot(
                payments = listOf(
                    milestone("m3", "scheduled", "2026-12-01"),
                    milestone("m1", "overdue", "2026-09-20"),
                    milestone("m2", "scheduled", null),
                ),
            ),
        )
        assertTrue(state.paymentsSummary.contains("Sep 20"), state.paymentsSummary)
    }

    @Test
    fun the_summary_names_what_is_left_to_pay_not_the_whole_amount() {
        // A partially paid milestone. The figure an advisor is asked for is the balance.
        val state = ui(
            snapshot(
                payments = listOf(
                    milestone("m1", "scheduled", "2026-10-12", amount = 500_000, paid = 200_000),
                ),
            ),
        )
        assertTrue(state.paymentsSummary.contains("$3,000"), state.paymentsSummary)
    }

    @Test
    fun a_row_shows_its_status_and_only_an_unpaid_one_leads_with_the_date() {
        val state = ui(
            snapshot(
                payments = listOf(
                    milestone("m1", "paid", "2026-08-01"),
                    milestone("m2", "overdue", "2026-09-20"),
                ),
            ),
        )
        assertEquals("Paid", state.payments[0].statusLabel)
        assertTrue(state.payments[0].paid)
        assertEquals("Overdue", state.payments[1].statusLabel)
        assertEquals("Sep 20", state.payments[1].dueLabel)
    }

    // ── The header and the glance ───────────────────────────────────────────────

    @Test
    fun the_money_row_is_three_figures_and_the_third_is_the_withheld_one() {
        val state = ui(snapshot())
        assertEquals(3, state.money.size)
        assertEquals(AgentCopy.CLIENT_TOTAL_LABEL to "$12,845", state.money[0])
        assertEquals(AgentCopy.PAID_SO_FAR_LABEL to "$5,000", state.money[1])
        // `trip.total_commission_cents` — never returned to a client role.
        assertEquals(AgentCopy.COMMISSION_LABEL to "$1,318", state.money[2])
    }

    @Test
    fun the_sub_line_carries_the_dates_and_the_travelers_so_the_glance_need_not() {
        val state = ui(snapshot())
        assertEquals("Dec 4 – Dec 11 · 6 travelers", state.subLine)
        val labels = state.glance.map { it.first }
        assertTrue(!labels.contains("Dates"))
        assertTrue(!labels.contains("Travelers"))
    }

    @Test
    fun one_traveler_is_singular() {
        val one = overview().copy(travelerCount = 1)
        assertTrue(ui(snapshot(one)).subLine.endsWith("1 traveler"))
    }

    @Test
    fun a_trip_with_no_dates_still_gets_its_travelers() {
        val dateless = overview().copy(startDate = null, endDate = null)
        assertEquals("6 travelers", ui(snapshot(dateless)).subLine)
    }

    @Test
    fun the_card_line_carries_the_cap_because_that_is_what_blocks_a_booking() {
        val glance = ui(snapshot()).glance.toMap()
        assertEquals("VISA •••• 4242 · $9,000 cap", glance[AgentCopy.GLANCE_CARD_ON_FILE])
    }

    @Test
    fun a_card_with_no_cap_and_no_card_at_all_are_different_lines() {
        val noCap = ui(snapshot(overview(cardSpendingLimitCents = null))).glance.toMap()
        assertEquals("VISA •••• 4242", noCap[AgentCopy.GLANCE_CARD_ON_FILE])

        val none = ui(snapshot(overview(cardLast4 = null, cardBrand = null))).glance.toMap()
        assertEquals(AgentCopy.GLANCE_NO_CARD, none[AgentCopy.GLANCE_CARD_ON_FILE])
    }

    @Test
    fun a_trip_with_no_destination_says_not_set_rather_than_nothing() {
        val glance = ui(snapshot(overview(destinations = emptyList()))).glance.toMap()
        assertEquals(AgentCopy.GLANCE_NOT_SET, glance[AgentCopy.GLANCE_DESTINATION])
    }

    @Test
    fun the_refund_rows_appear_only_when_there_is_a_refund() {
        val plain = ui(snapshot()).glance.map { it.first }
        assertTrue(!plain.contains(AgentCopy.GLANCE_REFUND_STATUS))
        assertTrue(!plain.contains(AgentCopy.GLANCE_REFUND_DETAIL))

        val cancelled = ui(
            snapshot(
                overview(
                    status = "cancelled",
                    cancellationReason = "Client illness",
                    refundStatus = "partial",
                    refundDetail = "Refunded $1,640 on Feb 12; $240 credit through Dec 2027",
                ),
            ),
        ).glance.toMap()
        assertEquals("Client illness", cancelled[AgentCopy.GLANCE_CANCELLATION_REASON])
        assertEquals("Partial", cancelled[AgentCopy.GLANCE_REFUND_STATUS])
        assertEquals(
            "Refunded $1,640 on Feb 12; $240 credit through Dec 2027",
            cancelled[AgentCopy.GLANCE_REFUND_DETAIL],
        )
    }

    @Test
    fun a_row_still_carrying_pre_vocabulary_free_text_shows_no_status_row() {
        // 20261001100000 split `refund_status` into a four-value vocabulary and moved the
        // sentences into `refund_detail`. A row that escaped the migration must not put a
        // whole sentence where a status belongs — it falls through to the detail line.
        val state = ui(
            snapshot(
                overview(
                    status = "cancelled",
                    refundStatus = "Refunded in full on Feb 12",
                    refundDetail = null,
                ),
            ),
        )
        val labels = state.glance.map { it.first }
        assertTrue(!labels.contains(AgentCopy.GLANCE_REFUND_STATUS))
    }

    @Test
    fun last_activity_comes_off_the_accessor_and_not_off_the_status_timeline() {
        val none = ui(snapshot()).glance.toMap()
        assertEquals(AgentCopy.GLANCE_NO_ACTIVITY, none[AgentCopy.GLANCE_LAST_ACTIVITY])

        // THE FIXTURE THAT TELLS THE TWO APART: the newest status change is Sep 14 and the
        // accessor's `last_activity_at` is Sep 28, because a client wrote in after the trip
        // was booked. `last_activity_at` is greatest(max status change, max unarchived
        // conversation message); reading the timeline's first row instead — which this did
        // first — showed Sep 14 and quietly under-reported every trip whose last event was
        // a message.
        val some = ui(
            snapshot(
                overview = overview(lastActivityAt = "2026-09-28T14:02:00Z"),
                activity = listOf(
                    AgentTripActivityRow("h1", "proposal", "booked", "2026-09-14T10:00:00Z", "Gyasi Story"),
                ),
            ),
        ).glance.toMap()
        assertEquals("Sep 28", some[AgentCopy.GLANCE_LAST_ACTIVITY])
    }

    // ── The strip ───────────────────────────────────────────────────────────────

    @Test
    fun the_tab_counts_come_off_the_lists_not_off_the_overview() {
        // DELIBERATELY DISAGREEING with the overview, which claims six components while the
        // rows list holds one. The phone holds every tab at once, so the list's length is
        // what the tab will actually show — a header count that disagreed with the rows
        // under it is worse than a count computed twice.
        //
        // And for documents it is the only number there is: the accessor returns
        // `component_count`, `manual_component_count` and `api_component_count` and no
        // document count at all. A `document_count` DTO field was declared first, decoded
        // to its `= 0` default, and the tab read "Documents · 0" over three documents.
        val state = ui(
            snapshot(
                overview = overview(componentCount = 6),
                components = listOf(
                    AgentTripComponentRow(
                        "cp1", "hotel", "Ocean-view suite", null,
                        null, null, null, null, null, 500_000, "USD",
                    ),
                ),
                documents = listOf(
                    AgentTripDocumentRow("d1", "receipt", "a.pdf", 2048, false, "2026-09-01T00:00:00Z"),
                    AgentTripDocumentRow("d2", "visa", "b.pdf", 2048, false, "2026-09-01T00:00:00Z"),
                ),
            ),
        )
        assertEquals("Components · 1", state.tabs.first { it.id == "components" }.label)
        assertEquals("Documents · 2", state.tabs.first { it.id == "documents" }.label)
        assertEquals(8, state.tabs.size)
        // The other six carry no count, because there is nothing countable behind them.
        assertEquals("Overview", state.tabs.first().label)
        assertEquals("Activity", state.tabs.last().label)
    }

    // ── The itinerary ───────────────────────────────────────────────────────────

    @Test
    fun the_published_state_is_never_blank() {
        assertEquals(AgentCopy.ITINERARY_DRAFT, ui(snapshot()).itineraryStateLabel)
        assertEquals(
            AgentCopy.ITINERARY_PUBLISHED,
            ui(snapshot(itineraryPublished = true)).itineraryStateLabel,
        )
    }

    @Test
    fun a_day_line_carries_the_weekday_and_a_day_with_nothing_in_it_survives() {
        val state = ui(
            snapshot(
                days = listOf(
                    AgentTripItineraryDay(
                        dayId = "d1",
                        dayNumber = 1,
                        date = "2026-12-04",
                        label = "Miami → Negril",
                        summary = null,
                        activities = listOf(
                            AgentTripActivity(
                                activityId = "a1",
                                block = "morning",
                                startTime = "06:40:00",
                                title = "AA 1413 · MIA → MBJ",
                                body = null,
                                location = "Miami",
                                gyasisTip = null,
                            ),
                        ),
                    ),
                    AgentTripItineraryDay("d2", 2, "2026-12-05", "Seven Mile Beach", null, emptyList()),
                ),
            ),
        )
        assertEquals("Fri Dec 4", state.days[0].dateLabel)
        assertEquals("06:40 · Morning · Miami", state.days[0].activities.single().line)
        // The empty day is kept, not filtered out with its null activity columns.
        assertEquals(2, state.days.size)
        assertTrue(state.days[1].activities.isEmpty())
    }

    @Test
    fun an_untitled_entry_degrades_to_its_block_rather_than_rendering_blank() {
        val state = ui(
            snapshot(
                days = listOf(
                    AgentTripItineraryDay(
                        "d1", 1, "2026-12-04", null, null,
                        listOf(AgentTripActivity("a1", "all_day", null, null, null, null, null)),
                    ),
                ),
            ),
        )
        assertEquals("All day", state.days[0].activities.single().title)
    }

    @Test
    fun the_fold_keeps_an_empty_day_and_the_accessors_order() {
        // `agent_trip_itinerary_days` LEFT JOINs activities onto days, so a day with three
        // entries arrives as three rows and a day with NONE arrives as one row whose
        // activity columns are all null. Both have to survive the fold.
        fun row(dayId: String, n: Int, activityId: String?, title: String?) = AgentTripDayRowLike(
            dayId = dayId, dayNumber = n, date = "2026-12-0$n", label = null, summary = null,
            activityId = activityId, block = null, startTime = null, title = title,
            body = null, location = null, gyasisTip = null,
        )

        val days = listOf(
            row("d1", 1, "a1", "First"),
            row("d1", 1, "a2", "Second"),
            row("d2", 2, null, null),
            row("d3", 3, "a3", "Third"),
        ).groupIntoDays()

        assertEquals(listOf("d1", "d2", "d3"), days.map { it.dayId })
        assertEquals(listOf("First", "Second"), days[0].activities.map { it.title })
        assertTrue(days[1].activities.isEmpty())
        assertEquals(1, days[2].activities.size)
    }

    // ── Components, documents, messages, notes ──────────────────────────────────

    @Test
    fun a_component_line_leads_with_the_supplier_because_that_is_who_gets_rung() {
        val state = ui(
            snapshot(
                components = listOf(
                    AgentTripComponentRow(
                        componentId = "cp1",
                        kind = "transfer",
                        displayName = "Private transfer · Mercedes Vito",
                        supplierName = "Negril Ground",
                        startDate = "2026-12-04",
                        endDate = null,
                        startTime = "10:20:00",
                        endTime = null,
                        location = "MBJ",
                        costCents = 24_000,
                        currency = "USD",
                    ),
                ),
            ),
        )
        val c = state.components.single()
        assertEquals("Transfer", c.kindLabel)
        assertEquals("Negril Ground · Dec 4 · 10:20 · MBJ", c.line)
        assertEquals("$240", c.costLabel)
    }

    @Test
    fun a_component_with_nothing_but_a_name_gets_no_line_rather_than_a_row_of_separators() {
        val state = ui(
            snapshot(
                components = listOf(
                    AgentTripComponentRow(
                        "cp1", "insurance", "Travel Guard · Deluxe", null,
                        null, null, null, null, null, 18_900, "USD",
                    ),
                ),
            ),
        )
        assertNull(state.components.single().line)
    }

    @Test
    fun a_document_line_names_its_kind_and_its_size() {
        val state = ui(
            snapshot(
                documents = listOf(
                    AgentTripDocumentRow(
                        documentId = "dc1",
                        kind = "supplier_confirmation",
                        filename = "sandals-negril.pdf",
                        sizeBytes = 1_153_433,
                        isSensitive = false,
                        createdAt = "2026-09-20T12:00:00Z",
                    ),
                ),
            ),
        )
        // 1,153,433 bytes is 1.0999 MiB — the fixture that tells rounding from truncation.
        // `sizeLabel` on the web uses `.toFixed(1)` and says "1.1 MB"; `fileSizeLabel`
        // divided and threw the remainder away, so the same file read "1.0 MB" on a phone.
        // A formatter is invisible to the copy-parity gate, so this is where it is pinned.
        assertEquals("Supplier confirmation · 1.1 MB", state.documents.single().line)
    }

    @Test
    fun an_internal_note_is_marked_rather_than_hidden() {
        // The agent's read, unlike the client's. An advisor scrolling a thread has to be
        // able to tell what the traveler can see from what they cannot.
        val state = ui(
            snapshot(
                messages = listOf(
                    AgentTripMessageRow("m1", "client", "Can we move the flight?", "2026-09-22T08:00:00Z", false),
                    AgentTripMessageRow("m2", "agent", "Ringing AA now.", "2026-09-22T08:40:00Z", true),
                ),
            ),
        )
        assertEquals("Client", state.messages[0].who)
        assertTrue(!state.messages[0].internalNote)
        assertEquals("You", state.messages[1].who)
        assertTrue(state.messages[1].internalNote)
        assertEquals("Sep 22", state.messages[1].whenLabel)
    }

    @Test
    fun a_blank_notes_field_is_the_same_as_no_notes() {
        assertNull(ui(snapshot(overview(notes = null))).notes)
        assertNull(ui(snapshot(overview(notes = "   "))).notes)
        assertEquals("Watch the flight change.", ui(snapshot(overview(notes = "Watch the flight change."))).notes)
    }

    // ── The vocabularies the parity gate cannot see ─────────────────────────────

    @Test
    fun every_component_kind_has_a_label_and_an_unknown_one_echoes() {
        assertEquals("Flight", componentKindLabel("flight"))
        assertEquals("Hotel or resort", componentKindLabel("hotel"))
        assertEquals("Cruise", componentKindLabel("cruise"))
        assertEquals("Transfer", componentKindLabel("transfer"))
        assertEquals("Tour or activity", componentKindLabel("excursion"))
        assertEquals("Insurance", componentKindLabel("insurance"))
        assertEquals("Something else", componentKindLabel("custom"))
        // NOT collapsed into "Something else": `custom` is a real member with that label, so
        // an eighth enum member hiding behind it would be invisible.
        assertEquals("dining", componentKindLabel("dining"))
    }

    @Test
    fun every_document_kind_in_the_enum_has_a_label() {
        // Ten, from `CREATE TYPE document_kind` in the initial migration. The web's Record
        // had nine — `csv_import` was missing and rendered raw through its `?? d.kind`
        // fallback. Enumerating the enum here is what found it.
        val kinds = listOf(
            "passport", "visa", "insurance_cert", "supplier_confirmation",
            "receipt", "photo", "csv_import", "pdf_proposal", "pdf_itinerary", "other",
        )
        for (kind in kinds) {
            assertTrue(documentKindLabel(kind) != kind, "no label for document_kind '$kind'")
        }
        assertEquals("CSV import", documentKindLabel("csv_import"))
        assertEquals("Insurance certificate", documentKindLabel("insurance_cert"))
        assertEquals("boarding_pass", documentKindLabel("boarding_pass"))
    }

    @Test
    fun every_milestone_status_has_a_label() {
        assertEquals("Scheduled", milestoneStatusLabel("scheduled"))
        assertEquals("Paid", milestoneStatusLabel("paid"))
        assertEquals("Overdue", milestoneStatusLabel("overdue"))
        assertEquals("Waived", milestoneStatusLabel("waived"))
        assertEquals("forgiven", milestoneStatusLabel("forgiven"))
    }

    @Test
    fun a_null_block_is_null_and_not_a_label() {
        // `BLOCKS` on the web opens with `{value: "", label: "Work it out from the time"}`,
        // which is an instruction to a form and not a thing to render. A row with no block
        // shows its time and nothing else.
        assertNull(itineraryBlockLabel(null))
        assertNull(itineraryBlockLabel(""))
        assertEquals("Morning", itineraryBlockLabel("morning"))
        assertEquals("All day", itineraryBlockLabel("all_day"))
        assertEquals("siesta", itineraryBlockLabel("siesta"))
    }

    @Test
    fun a_refund_status_outside_the_vocabulary_is_null_rather_than_echoed() {
        assertEquals("None expected", refundStatusLabel("none_expected"))
        assertEquals("Pending", refundStatusLabel("pending"))
        assertEquals("Partial", refundStatusLabel("partial"))
        assertEquals("Full", refundStatusLabel("full"))
        assertNull(refundStatusLabel(null))
        assertNull(refundStatusLabel("Refunded in full on Feb 12"))
    }

    @Test
    fun an_admin_sender_is_named_rather_than_disguised() {
        assertEquals("You", senderRoleLabel("agent"))
        assertEquals("Client", senderRoleLabel("client"))
        // Rare enough that inventing a friendly name would hide who answered the client.
        assertEquals("admin", senderRoleLabel("admin"))
    }

    @Test
    fun an_unknown_trip_type_echoes_the_raw_value_as_the_web_does() {
        assertEquals("All-inclusive", tripTypeLabel("all_inclusive"))
        assertEquals("Multi-destination", tripTypeLabel("multi_destination"))
        assertEquals("Group trip", tripTypeLabel("group"))
        // The drift this file's move closed: the Compose helper used to return
        // `replace('_', ' ')`, so a sixth enum member read "group charter" on a phone and
        // "group_charter" in a browser.
        assertEquals("group_charter", tripTypeLabel("group_charter"))
    }

    // ── The small formatters ────────────────────────────────────────────────────

    @Test
    fun a_time_loses_its_seconds_and_a_missing_one_stays_missing() {
        assertEquals("06:40", hhmm("06:40:00"))
        assertEquals("06:40", hhmm("06:40"))
        assertNull(hhmm(null))
        assertNull(hhmm("6:4"))
    }

    @Test
    fun a_date_becomes_a_month_and_a_day_and_nonsense_becomes_null() {
        assertEquals("Dec 4", monthDay("2026-12-04"))
        assertEquals("Jan 1", monthDay("2027-01-01"))
        // A timestamptz is trimmed to its date before parsing.
        assertEquals("Sep 28", monthDay("2026-09-28T14:02:00Z"))
        assertNull(monthDay(null))
        assertNull(monthDay("nonsense"))
        assertNull(monthDay("2026-13-01"))
    }
}
