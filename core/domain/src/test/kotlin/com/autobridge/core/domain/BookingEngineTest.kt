package com.autobridge.core.domain

import com.autobridge.core.domain.booking.*
import com.autobridge.core.domain.pricing.PricingEngine
import com.autobridge.core.domain.vehicle.ServiceReminders
import com.autobridge.core.model.*
import com.autobridge.core.model.BookingStatus.*
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BookingEngineTest {
    private val pricing = PricingEngine()
    private val factory = BookingFactory(pricing)
    private val actions = BookingActions(pricing)
    private val user = UserProfile("u1", "+919999999999", "Demo User")

    private fun draft(trip: TripType = TripType.PICKUP_AND_DROP, pkgType: PriceType = PriceType.FIXED, slot: String = "12-14") = BookingDraft(
        vehicle = Fixtures.vehicle(), partner = Fixtures.partner(), servicePackage = Fixtures.pkg(type = pkgType),
        issues = listOf("AC not cooling"), tripType = trip, pickupAddress = Fixtures.address(), dropAddress = Fixtures.address(),
        jobCardNumber = if (trip == TripType.DROP_ONLY) "JC1" else "", epochDay = 100, slotId = slot,
    )

    private fun create(d: BookingDraft = draft()) = factory.create(d, "AB-1", user, 1000)!!

    private fun withAllPhotos(b: Booking, stage: WalkaroundStage) =
        TripFlow.REQUIRED_ANGLES.fold(b) { acc, a -> actions.addWalkaroundPhoto(acc, WalkaroundPhoto(stage, a, "file://$a", 1)) }

    @Test fun createSnapshotsEverything() {
        val b = create()
        assertThat(b.status).isEqualTo(REQUESTED)
        assertThat(b.partner.name).isEqualTo("Demo p1")
        assertThat(b.servicePackage!!.price).isEqualTo(500)
        assertThat(b.price.total).isEqualTo(500 + 249)
        assertThat(b.commissionAmount).isEqualTo(50)
        assertThat(b.checklist.first().title).isEqualTo("AC not cooling")
        assertThat(b.history.single().status).isEqualTo(REQUESTED)
    }

    @Test fun dropOnlyDropsPackageAndPickup() {
        val b = create(draft(TripType.DROP_ONLY))
        assertThat(b.servicePackage).isNull()
        assertThat(b.pickupAddress).isNull()
        assertThat(b.jobCardNumber).isEqualTo("JC1")
    }

    @Test fun validatorCatchesMissingPieces() {
        val d = draft().copy(pickupAddress = null)
        assertThat(BookingDraftValidator.errorsFor(BookingStep.TRIP, d)).containsExactly(DraftError.NO_PICKUP_ADDRESS)
        assertThat(BookingDraftValidator.errorsFor(BookingStep.TRIP, draft(TripType.DROP_ONLY).copy(jobCardNumber = ""))).contains(DraftError.NO_JOB_CARD)
        assertThat(BookingDraftValidator.errorsFor(BookingStep.SLOT, draft(), fullSlots = setOf("12-14"))).containsExactly(DraftError.SLOT_FULL)
        assertThat(BookingDraftValidator.errorsFor(BookingStep.SLOT, draft(), todayEpochDay = 100, nowHour = 13)).containsExactly(DraftError.SLOT_IN_PAST)
        assertThat(BookingDraftValidator.errorsFor(BookingStep.SERVICE, draft().copy(photoUris = listOf("a", "b", "c", "d")))).contains(DraftError.TOO_MANY_PHOTOS)
        assertThat(BookingDraftValidator.errorsFor(BookingStep.PARTNER, draft().copy(partner = Fixtures.partner(isPartner = false)))).containsExactly(DraftError.PARTNER_NOT_BOOKABLE)
        assertThat(factory.create(d, "x", user, 0)).isNull()
    }

    @Test fun fullPickupAndDropFixedFlow() {
        var b = create()
        b = actions.transition(b, CONFIRMED, Actor.PARTNER, 2)!!
        b = actions.assignRider(b, Rider("r1", "Demo Rider", "1"), 3)!!
        assertThat(b.status).isEqualTo(RIDER_ASSIGNED)
        b = actions.transition(b, PICKUP_EN_ROUTE, Actor.RIDER, 4)!!
        assertThat(actions.transition(b, PICKED_UP, Actor.RIDER, 5)).isNull() // photos missing
        b = actions.transition(withAllPhotos(b, WalkaroundStage.PICKUP_FROM_CUSTOMER), PICKED_UP, Actor.RIDER, 5)!!
        assertThat(actions.transition(b, AT_WORKSHOP, Actor.RIDER, 6)).isNull() // checklist incomplete
        b.checklist.forEach { b = actions.setChecklistItem(b, it.id, true, "", 6) }
        b = actions.transition(b, AT_WORKSHOP, Actor.RIDER, 6)!!
        b = actions.transition(b, IN_SERVICE, Actor.PARTNER, 7)!! // fixed: no estimate
        b = actions.transition(b, READY, Actor.PARTNER, 8)!!
        b = actions.transition(b, DROP_EN_ROUTE, Actor.RIDER, 9)!!
        assertThat(actions.transition(b, COMPLETED, Actor.RIDER, 10)).isNull()
        b = actions.transition(withAllPhotos(b, WalkaroundStage.DROP_TO_CUSTOMER), COMPLETED, Actor.RIDER, 10)!!
        assertThat(b.history.map { it.status }).isEqualTo(TripFlow.steps(b))
    }

    @Test fun estimateLineByLineApproval() {
        var b = create(draft(pkgType = PriceType.FROM)).copy(status = AT_WORKSHOP)
        assertThat(actions.transition(b, IN_SERVICE, Actor.PARTNER, 1)).isNull()
        b = actions.shareEstimate(b, listOf(EstimateLine("1", "Brake pads", 1200), EstimateLine("2", "Wiper blades", 400)), "", 2)!!
        assertThat(b.status).isEqualTo(ESTIMATE_SHARED)
        b = actions.decideEstimateLine(b, "1", true, 3)!!
        assertThat(b.status).isEqualTo(ESTIMATE_SHARED)
        b = actions.decideEstimateLine(b, "2", false, 4)!!
        assertThat(b.status).isEqualTo(IN_SERVICE)
        assertThat(b.price.total).isEqualTo(500 + 249 + 1200)
        assertThat(b.commissionAmount).isEqualTo(170)
        assertThat(b.price.isEstimate).isFalse()
    }

    @Test fun fixedPackageWithExtrasGoesThroughEstimate() {
        var b = create().copy(status = AT_WORKSHOP)
        b = actions.shareEstimate(b, listOf(EstimateLine("1", "Headlight restoration", 600)), "", 2)!!
        assertThat(TripFlow.steps(b)).contains(ESTIMATE_SHARED)
        b = actions.approveAll(b, 3)!!
        assertThat(b.status).isEqualTo(IN_SERVICE)
    }

    @Test fun cancellationFeeOnlyAfterRiderAssigned() {
        val b = create()
        assertThat(actions.cancel(b, "Plans changed", 2)!!.cancellation!!.fee).isEqualTo(0)
        val assigned = actions.assignRider(actions.transition(b, CONFIRMED, Actor.PARTNER, 2)!!, Rider("r", "R", "1"), 3)!!
        val cancelled = actions.cancel(assigned, "Plans changed", 4)!!
        assertThat(cancelled.status).isEqualTo(CANCELLED)
        assertThat(cancelled.cancellation!!.fee).isEqualTo(99)
        assertThat(cancelled.price.total).isEqualTo(99)
        assertThat(actions.cancel(b, "", 2)).isNull()
    }

    @Test fun rescheduleUpdatesEarlySurcharge() {
        val b = create()
        val r = actions.reschedule(b, BookingSlot(101, "08-10"), 5)!!
        assertThat(r.price.total).isEqualTo(b.price.total + 30)
        assertThat(r.rescheduleCount).isEqualTo(1)
        val back = actions.reschedule(r, BookingSlot(101, "14-16"), 6)!!
        assertThat(back.price.total).isEqualTo(b.price.total)
        assertThat(actions.reschedule(b.copy(riderId = "r"), BookingSlot(101, "14-16"), 6)).isNull()
    }

    @Test fun ratingOnlyAfterCompletion() {
        val b = create()
        assertThat(actions.rate(b, 5, 5, "", 1)).isNull()
        val rated = actions.rate(b.copy(status = COMPLETED), 5, 4, " great ", 2)!!
        assertThat(rated.ratings).isEqualTo(Ratings(5, 4, "great"))
        assertThat(actions.rate(b.copy(status = COMPLETED), 6, 4, "", 2)).isNull()
    }

    @Test fun slotRules() {
        assertThat(SlotRules.fullSlots(mapOf("08-10" to 3, "10-12" to 1), 3)).containsExactly("08-10")
        assertThat(SlotRules.days(10)).hasSize(SlotRules.BOOKABLE_DAYS)
        assertThat(SlotRules.isPast(10, "10-12", 10, 9)).isFalse()
        assertThat(SlotRules.isPast(10, "10-12", 10, 10)).isTrue()
    }

    @Test fun serviceReminders() {
        val v = Fixtures.vehicle().copy(lastServiceEpochDay = 0)
        assertThat(ServiceReminders.reminderFor(v, 100)).isNull()
        assertThat(ServiceReminders.reminderFor(v, 200)!!.daysOverdue).isEqualTo(20)
        assertThat(ServiceReminders.reminderFor(v.copy(lastServiceEpochDay = null), 5)!!.neverServiced).isTrue()
        assertThat(ServiceReminders.reminderFor(v.copy(type = VehicleType.BIKE), 95)).isNotNull()
    }
}
