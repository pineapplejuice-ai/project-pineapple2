package com.autobridge.core.data.demo

import com.autobridge.core.domain.booking.BookingDraft
import com.autobridge.core.domain.booking.BookingFactory
import com.autobridge.core.domain.pricing.PricingEngine
import com.autobridge.core.domain.repository.Clock
import com.autobridge.core.model.*

/** A handful of demo bookings so partner / rider / ops modes have something to work on. */
internal object DemoSeedBookings {
    private const val DAY = 86_400_000L

    fun create(clock: Clock): List<Booking> {
        val factory = BookingFactory(PricingEngine())
        val now = clock.nowMillis()
        val today = clock.todayEpochDay()
        val vehicles = DemoData.seedVehicles(today)
        val home = DemoData.seedAddresses().first()
        fun partner(id: String) = DemoData.partners.first { it.id == id }
        fun pkg(partnerId: String, type: VehicleType, priceType: PriceType? = null) =
            DemoData.packages.first { it.partnerId == partnerId && it.vehicleType == type && (priceType == null || it.priceType == priceType) }
        fun customer(id: String, name: String, phone: String) = UserProfile(id, phone, name)

        fun make(
            ref: String, who: UserProfile, vehicle: Vehicle, partnerId: String, pkg: ServicePackage?, trip: TripType,
            day: Long, slot: String, status: BookingStatus, riderIndex: Int?, createdAgoMs: Long, issues: List<String> = emptyList(),
        ): Booking {
            val draft = BookingDraft(
                vehicle = vehicle, partner = partner(partnerId), servicePackage = pkg, issues = issues, tripType = trip,
                pickupAddress = home, dropAddress = home, jobCardNumber = if (trip == TripType.DROP_ONLY) "JC-DEMO-4411" else "",
                epochDay = day, slotId = slot,
            )
            val created = now - createdAgoMs
            val b = factory.create(draft, ref, who, created)!!
            val steps = TripFlow.steps(b).let { s -> s.take(s.indexOf(status) + 1) }
            val rider = riderIndex?.let { DemoData.riders[it] }
            return b.copy(
                status = status,
                history = steps.mapIndexed { i, s -> StatusEvent(s, created + i * 3_600_000L, TripFlow.actorFor(trip, s)) },
                riderId = rider?.id, riderName = rider?.name, riderPhone = rider?.phone,
                checklist = if (status.ordinal > BookingStatus.AT_WORKSHOP.ordinal) b.checklist.map { it.copy(checked = true) } else b.checklist,
            )
        }

        val me = customer(DemoData.DEMO_USER_ID, "", "+919999999999")
        val swift = vehicles[0]
        return listOf(
            make("AB-DEMO01", me, swift, "demo-p01", pkg("demo-p01", VehicleType.CAR), TripType.PICKUP_AND_DROP,
                today - 20, "10-12", BookingStatus.COMPLETED, 0, 21 * DAY),
            make("AB-DEMO02", customer("demo-c2", "Demo Customer Priya", "+919000030002"), swift.copy(id = "demo-cv2", registrationNumber = "KA03MM7788"),
                "demo-p01", pkg("demo-p01", VehicleType.CAR, PriceType.FIXED), TripType.PICKUP_AND_DROP, today + 1, "12-14", BookingStatus.REQUESTED, null, 2 * 3_600_000L),
            make("AB-DEMO03", customer("demo-c3", "Demo Customer Arjun", "+919000030003"), swift.copy(id = "demo-cv3", registrationNumber = "KA51ZX9090"),
                "demo-p01", pkg("demo-p01", VehicleType.CAR, PriceType.FROM), TripType.PICKUP_ONLY, today, "10-12", BookingStatus.AT_WORKSHOP, 0, 5 * 3_600_000L,
                listOf("Dents and scratches", "Interior cleaning")),
            make("AB-DEMO04", customer("demo-c4", "Demo Customer Kavya", "+919000030004"), vehicles[1].copy(id = "demo-cv4", registrationNumber = "22BH4321AA"),
                "demo-p05", pkg("demo-p05", VehicleType.BIKE), TripType.PICKUP_AND_DROP, today + 1, "16-18", BookingStatus.CONFIRMED, null, 3_600_000L),
            make("AB-DEMO05", customer("demo-c5", "Demo Customer Rahul", "+919000030005"), swift.copy(id = "demo-cv5", registrationNumber = "KA01MJ2020"),
                "demo-p22", pkg("demo-p22", VehicleType.CAR, PriceType.FIXED), TripType.PICKUP_AND_DROP, today, "14-16", BookingStatus.RIDER_ASSIGNED, 0, 4 * 3_600_000L,
                listOf("Brake noise / weak brakes")),
        )
    }
}
