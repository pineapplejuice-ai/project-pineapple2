package com.autobridge.core.model

/** Customer-side booking management rules (cancel / reschedule / rate). */
object BookingRules {
    /** Customers can cancel until the vehicle has been handed to the rider. */
    fun canCancel(b: Booking): Boolean = when (b.status) {
        BookingStatus.REQUESTED, BookingStatus.CONFIRMED, BookingStatus.RIDER_ASSIGNED,
        BookingStatus.PICKUP_EN_ROUTE -> true
        BookingStatus.READY -> b.tripType == TripType.DROP_ONLY
        else -> false
    }

    /** A cancellation fee applies once a rider has been assigned. */
    fun riderAssigned(b: Booking): Boolean = b.riderId != null || b.history.any { it.status == BookingStatus.RIDER_ASSIGNED }

    /** Reschedule is allowed only before a rider is assigned. */
    fun canReschedule(b: Booking): Boolean = !b.status.isTerminal && !riderAssigned(b) &&
        b.status in setOf(BookingStatus.REQUESTED, BookingStatus.CONFIRMED, BookingStatus.READY)

    fun canRate(b: Booking): Boolean = b.status == BookingStatus.COMPLETED && (b.ratings.partner == null || b.ratings.rider == null)

    fun canApproveEstimate(b: Booking): Boolean = b.status == BookingStatus.ESTIMATE_SHARED && b.estimate != null

    val CANCEL_REASONS = listOf(
        "Plans changed", "Found a better price", "Booked by mistake", "Vehicle not available", "Slot no longer works", "Other",
    )
}
