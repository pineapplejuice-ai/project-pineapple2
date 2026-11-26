package com.autobridge.core.model

import com.autobridge.core.model.BookingStatus.*
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TripFlowTest {
    private fun booking(trip: TripType, pkg: PackageSnapshot?, status: BookingStatus = REQUESTED, estimate: Estimate? = null) = Booking(
        id = "b", customerId = "c", customerName = "", customerPhone = "",
        vehicle = VehicleSnapshot("v", VehicleType.CAR, "tata", "Tata Nexon", FuelType.PETROL, "KA01AB1234"),
        partner = PartnerSnapshot("p", "Demo", "Area", "Addr", GeoPoint(0.0, 0.0), "", ""),
        servicePackage = pkg, tripType = trip, slot = BookingSlot(1, "10-12"),
        price = PriceBreakdown(emptyList(), 0, false), commissionPercent = 10.0, commissionAmount = 0,
        status = status, estimate = estimate, createdAtMillis = 0,
    )
    private val fixed = PackageSnapshot("k", "Wash", PriceType.FIXED, 500)
    private val from = PackageSnapshot("k", "Service", PriceType.FROM, 3000)

    @Test fun pickupAndDropWithEstimate() {
        assertThat(TripFlow.steps(TripType.PICKUP_AND_DROP, true)).containsExactly(
            REQUESTED, CONFIRMED, RIDER_ASSIGNED, PICKUP_EN_ROUTE, PICKED_UP, AT_WORKSHOP, ESTIMATE_SHARED, IN_SERVICE, READY, DROP_EN_ROUTE, COMPLETED,
        ).inOrder()
    }

    @Test fun pickupAndDropFixedSkipsEstimate() {
        assertThat(TripFlow.steps(booking(TripType.PICKUP_AND_DROP, fixed))).doesNotContain(ESTIMATE_SHARED)
        assertThat(TripFlow.next(booking(TripType.PICKUP_AND_DROP, fixed, AT_WORKSHOP))).isEqualTo(IN_SERVICE)
    }

    @Test fun fixedWithExtrasRequiresEstimate() {
        val est = Estimate(listOf(EstimateLine("1", "Extra polish", 300)), 0)
        assertThat(booking(TripType.PICKUP_AND_DROP, fixed, estimate = est).requiresEstimate).isTrue()
    }

    @Test fun fromPriceAndIssueOnlyRequireEstimate() {
        assertThat(booking(TripType.PICKUP_AND_DROP, from).requiresEstimate).isTrue()
        assertThat(booking(TripType.PICKUP_ONLY, null).requiresEstimate).isTrue()
        assertThat(TripFlow.next(booking(TripType.PICKUP_AND_DROP, from, AT_WORKSHOP))).isEqualTo(ESTIMATE_SHARED)
    }

    @Test fun pickupOnlyEndsWithCollection() {
        val s = TripFlow.steps(TripType.PICKUP_ONLY, false)
        assertThat(s).containsExactly(REQUESTED, CONFIRMED, RIDER_ASSIGNED, PICKUP_EN_ROUTE, PICKED_UP, AT_WORKSHOP, IN_SERVICE, READY, COMPLETED).inOrder()
        assertThat(s).doesNotContain(DROP_EN_ROUTE)
        assertThat(TripFlow.actorFor(TripType.PICKUP_ONLY, COMPLETED)).isEqualTo(Actor.PARTNER)
    }

    @Test fun dropOnlyFlow() {
        val b = booking(TripType.DROP_ONLY, null)
        assertThat(b.requiresEstimate).isFalse()
        assertThat(TripFlow.steps(b)).containsExactly(REQUESTED, CONFIRMED, READY, RIDER_ASSIGNED, DROP_EN_ROUTE, COMPLETED).inOrder()
        assertThat(TripFlow.walkaroundRequiredFor(TripType.DROP_ONLY, DROP_EN_ROUTE)).isEqualTo(WalkaroundStage.PICKUP_FROM_WORKSHOP)
        assertThat(TripFlow.walkaroundRequiredFor(TripType.DROP_ONLY, COMPLETED)).isEqualTo(WalkaroundStage.DROP_TO_CUSTOMER)
    }

    @Test fun walkaroundRules() {
        assertThat(TripFlow.walkaroundRequiredFor(TripType.PICKUP_AND_DROP, PICKED_UP)).isEqualTo(WalkaroundStage.PICKUP_FROM_CUSTOMER)
        assertThat(TripFlow.walkaroundRequiredFor(TripType.PICKUP_ONLY, COMPLETED)).isNull()
        assertThat(TripFlow.walkaroundRequiredFor(TripType.PICKUP_AND_DROP, IN_SERVICE)).isNull()
        assertThat(TripFlow.checklistRequiredFor(AT_WORKSHOP)).isTrue()
    }

    @Test fun transitionsRespectActors() {
        val b = booking(TripType.PICKUP_AND_DROP, fixed)
        assertThat(TripFlow.canTransition(b, CONFIRMED, Actor.PARTNER)).isTrue()
        assertThat(TripFlow.canTransition(b, CONFIRMED, Actor.RIDER)).isFalse()
        assertThat(TripFlow.canTransition(b, DECLINED, Actor.PARTNER)).isTrue()
        assertThat(TripFlow.canTransition(b, PICKED_UP, Actor.RIDER)).isFalse()
        assertThat(TripFlow.canTransition(b, PICKED_UP, Actor.OPS)).isTrue()
        assertThat(TripFlow.canTransition(b.copy(status = COMPLETED), CANCELLED, Actor.OPS)).isFalse()
        assertThat(TripFlow.canTransition(booking(TripType.PICKUP_AND_DROP, from, ESTIMATE_SHARED), IN_SERVICE, Actor.CUSTOMER)).isTrue()
        assertThat(TripFlow.canTransition(booking(TripType.PICKUP_AND_DROP, from, AT_WORKSHOP), IN_SERVICE, Actor.PARTNER)).isFalse()
    }

    @Test fun nextIsNullAtEnd() {
        assertThat(TripFlow.next(booking(TripType.PICKUP_AND_DROP, fixed, COMPLETED))).isNull()
        assertThat(TripFlow.next(booking(TripType.PICKUP_AND_DROP, fixed, CANCELLED))).isNull()
    }

    @Test fun bookingRules() {
        val b = booking(TripType.PICKUP_AND_DROP, fixed)
        assertThat(BookingRules.canCancel(b)).isTrue()
        assertThat(BookingRules.canCancel(b.copy(status = PICKED_UP))).isFalse()
        assertThat(BookingRules.canReschedule(b)).isTrue()
        assertThat(BookingRules.canReschedule(b.copy(riderId = "r", status = RIDER_ASSIGNED))).isFalse()
        assertThat(BookingRules.canRate(b.copy(status = COMPLETED))).isTrue()
        assertThat(BookingRules.canCancel(booking(TripType.DROP_ONLY, null, READY))).isTrue()
    }

    @Test fun timeSlotLabels() {
        assertThat(TimeSlot.ALL.first().label).isEqualTo("8 AM – 10 AM")
        assertThat(TimeSlot.byId("12-14")!!.label).isEqualTo("12 PM – 2 PM")
    }
}
