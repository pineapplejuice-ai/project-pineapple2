package com.autobridge.core.domain

import com.autobridge.core.domain.pricing.PricingEngine
import com.autobridge.core.model.*
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PricingEngineTest {
    private val engine = PricingEngine()
    private val midday = TimeSlot.byId("12-14")!!
    private val early = TimeSlot.byId("08-10")!!
    private val fixed = PackageSnapshot("k", "Wash", PriceType.FIXED, 1000)

    private fun quote(v: VehicleType = VehicleType.CAR, t: TripType = TripType.PICKUP_AND_DROP, p: Double = 5.0, d: Double = 5.0, slot: TimeSlot = midday, pkg: PackageSnapshot? = fixed) =
        engine.quote(v, t, pkg, p, d, slot)

    @Test fun carRoundTripWithinIncludedKm() {
        val q = quote()
        assertThat(q.breakdown.total).isEqualTo(1000 + 249)
        assertThat(q.breakdown.lines.map { it.kind }).containsExactly(PriceLine.Kind.SERVICE, PriceLine.Kind.LOGISTICS)
    }

    @Test fun bikeRoundTrip() { assertThat(quote(v = VehicleType.BIKE, pkg = null).breakdown.total).isEqualTo(99) }

    @Test fun exactlyEightKmIsIncluded() { assertThat(quote(p = 8.0, d = 8.0, pkg = null).breakdown.total).isEqualTo(249) }

    @Test fun extraKmPerLegRoundedUp() {
        // pickup 10.2 km -> 3 extra km, drop 9 km -> 1 extra km => 4 km * 15
        val q = quote(p = 10.2, d = 9.0, pkg = null)
        assertThat(q.breakdown.total).isEqualTo(249 + 60)
        assertThat(q.breakdown.lines.first { it.kind == PriceLine.Kind.EXTRA_DISTANCE }.quantity).isEqualTo(4)
        assertThat(quote(v = VehicleType.BIKE, p = 10.0, d = 10.0, pkg = null).breakdown.total).isEqualTo(99 + 4 * 8)
    }

    @Test fun singleLegIsSixtyPercent() {
        assertThat(quote(t = TripType.PICKUP_ONLY, pkg = null).breakdown.total).isEqualTo(149)
        assertThat(quote(t = TripType.DROP_ONLY, pkg = null).breakdown.total).isEqualTo(149)
        assertThat(quote(v = VehicleType.BIKE, t = TripType.PICKUP_ONLY, pkg = null).breakdown.total).isEqualTo(59)
    }

    @Test fun singleLegOnlyChargesItsOwnDistance() {
        // drop distance is ignored for pickup only
        assertThat(quote(t = TripType.PICKUP_ONLY, p = 10.0, d = 30.0, pkg = null).breakdown.total).isEqualTo(149 + 30)
        assertThat(quote(t = TripType.DROP_ONLY, p = 30.0, d = 9.5, pkg = null).breakdown.total).isEqualTo(149 + 30)
    }

    @Test fun earlySlotSurcharge() {
        assertThat(quote(slot = early, pkg = null).breakdown.total).isEqualTo(249 + 30)
        assertThat(engine.isEarlySlot(TimeSlot.byId("10-12")!!)).isFalse()
    }

    @Test fun commissionStoredButNotInBreakdown() {
        val q = engine.quote(VehicleType.CAR, TripType.PICKUP_AND_DROP, fixed, 1.0, 1.0, midday, commissionPercent = 12.5)
        assertThat(q.commissionAmount).isEqualTo(125)
        assertThat(q.breakdown.total).isEqualTo(1249)
        assertThat(engine.quote(VehicleType.CAR, TripType.PICKUP_AND_DROP, fixed, 1.0, 1.0, midday).commissionAmount).isEqualTo(100)
    }

    @Test fun fromPriceIsAnEstimate() {
        val q = quote(pkg = PackageSnapshot("k", "Service", PriceType.FROM, 3000))
        assertThat(q.breakdown.isEstimate).isTrue()
        assertThat(q.breakdown.lines.first().kind).isEqualTo(PriceLine.Kind.SERVICE_FROM)
        assertThat(quote().breakdown.isEstimate).isFalse()
    }
}
