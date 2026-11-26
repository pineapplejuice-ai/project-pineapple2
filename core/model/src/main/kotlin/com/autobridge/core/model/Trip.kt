package com.autobridge.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class TripType {
    /** Rider picks the vehicle up from the customer and drops it back after service. */
    PICKUP_AND_DROP,
    /** Rider takes the vehicle to the partner; customer collects it. */
    PICKUP_ONLY,
    /** Vehicle is already at the partner (job card exists); rider brings it back. */
    DROP_ONLY;

    val hasPickupLeg: Boolean get() = this != DROP_ONLY
    val hasDropLeg: Boolean get() = this != PICKUP_ONLY
    val legCount: Int get() = if (this == PICKUP_AND_DROP) 2 else 1
}

@Serializable
enum class BookingStatus {
    REQUESTED,
    CONFIRMED,
    RIDER_ASSIGNED,
    PICKUP_EN_ROUTE,
    PICKED_UP,
    AT_WORKSHOP,
    ESTIMATE_SHARED,
    IN_SERVICE,
    READY,
    DROP_EN_ROUTE,
    COMPLETED,
    CANCELLED,
    DECLINED;

    val isTerminal: Boolean get() = this == COMPLETED || this == CANCELLED || this == DECLINED
}

@Serializable
enum class Actor { CUSTOMER, PARTNER, RIDER, OPS, SYSTEM }

@Serializable
enum class WalkaroundStage { PICKUP_FROM_CUSTOMER, PICKUP_FROM_WORKSHOP, DROP_TO_CUSTOMER }

@Serializable
enum class PhotoAngle { FRONT, REAR, LEFT, RIGHT, ODOMETER }

/**
 * The status flow for each trip type. All "what comes next / who may move it / what is required" rules live here.
 *
 * - PICKUP_AND_DROP: Requested → Confirmed → Rider assigned → Rider on the way → Picked up → At workshop
 *   → [Estimate shared] → In service → Ready → Out for delivery → Delivered
 * - PICKUP_ONLY: … → Ready (for collection) → Collected
 * - DROP_ONLY: Requested → Confirmed → Ready → Rider assigned → Out for delivery → Delivered
 *
 * The estimate step only appears when [requiresEstimate] is true: "from"-priced or issue-only bookings, or a fixed
 * package with extras added by the partner.
 */
object TripFlow {

    fun steps(tripType: TripType, requiresEstimate: Boolean): List<BookingStatus> = when (tripType) {
        TripType.PICKUP_AND_DROP -> listOfNotNull(
            BookingStatus.REQUESTED, BookingStatus.CONFIRMED, BookingStatus.RIDER_ASSIGNED,
            BookingStatus.PICKUP_EN_ROUTE, BookingStatus.PICKED_UP, BookingStatus.AT_WORKSHOP,
            BookingStatus.ESTIMATE_SHARED.takeIf { requiresEstimate },
            BookingStatus.IN_SERVICE, BookingStatus.READY, BookingStatus.DROP_EN_ROUTE, BookingStatus.COMPLETED,
        )
        TripType.PICKUP_ONLY -> listOfNotNull(
            BookingStatus.REQUESTED, BookingStatus.CONFIRMED, BookingStatus.RIDER_ASSIGNED,
            BookingStatus.PICKUP_EN_ROUTE, BookingStatus.PICKED_UP, BookingStatus.AT_WORKSHOP,
            BookingStatus.ESTIMATE_SHARED.takeIf { requiresEstimate },
            BookingStatus.IN_SERVICE, BookingStatus.READY, BookingStatus.COMPLETED,
        )
        TripType.DROP_ONLY -> listOf(
            BookingStatus.REQUESTED, BookingStatus.CONFIRMED, BookingStatus.READY,
            BookingStatus.RIDER_ASSIGNED, BookingStatus.DROP_EN_ROUTE, BookingStatus.COMPLETED,
        )
    }

    fun steps(booking: Booking): List<BookingStatus> = steps(booking.tripType, booking.requiresEstimate)

    /** The default next status in the flow, null when terminal. */
    fun next(tripType: TripType, requiresEstimate: Boolean, current: BookingStatus): BookingStatus? {
        if (current.isTerminal) return null
        val s = steps(tripType, requiresEstimate)
        val i = s.indexOf(current)
        return if (i < 0 || i == s.lastIndex) null else s[i + 1]
    }

    fun next(booking: Booking): BookingStatus? = next(booking.tripType, booking.requiresEstimate, booking.status)

    /** Who is normally allowed to move a booking *into* [to]. Ops can always override. */
    fun actorFor(tripType: TripType, to: BookingStatus): Actor = when (to) {
        BookingStatus.REQUESTED -> Actor.CUSTOMER
        BookingStatus.CONFIRMED, BookingStatus.DECLINED, BookingStatus.ESTIMATE_SHARED,
        BookingStatus.READY -> Actor.PARTNER
        BookingStatus.IN_SERVICE -> Actor.PARTNER // customer approval of an estimate also moves here
        BookingStatus.RIDER_ASSIGNED -> Actor.OPS
        BookingStatus.PICKUP_EN_ROUTE, BookingStatus.PICKED_UP, BookingStatus.AT_WORKSHOP,
        BookingStatus.DROP_EN_ROUTE -> Actor.RIDER
        BookingStatus.COMPLETED -> if (tripType == TripType.PICKUP_ONLY) Actor.PARTNER else Actor.RIDER
        BookingStatus.CANCELLED -> Actor.CUSTOMER
    }

    /** Whether [actor] may move [booking] to [to] (ops may set any non-requested status). */
    fun canTransition(booking: Booking, to: BookingStatus, actor: Actor): Boolean {
        if (booking.status.isTerminal) return false
        if (actor == Actor.OPS || actor == Actor.SYSTEM) return to != BookingStatus.REQUESTED
        return when (to) {
            BookingStatus.CANCELLED -> actor == Actor.CUSTOMER && BookingRules.canCancel(booking)
            BookingStatus.DECLINED -> actor == Actor.PARTNER && booking.status == BookingStatus.REQUESTED
            BookingStatus.ESTIMATE_SHARED ->
                actor == Actor.PARTNER && booking.status == BookingStatus.AT_WORKSHOP && booking.tripType != TripType.DROP_ONLY
            BookingStatus.IN_SERVICE -> when (booking.status) {
                BookingStatus.ESTIMATE_SHARED -> actor == Actor.CUSTOMER
                BookingStatus.AT_WORKSHOP -> actor == Actor.PARTNER && !booking.requiresEstimate
                else -> false
            }
            else -> next(booking) == to && actorFor(booking.tripType, to) == actor
        }
    }

    /** Walkaround photos required to move into [to], or null if none. */
    fun walkaroundRequiredFor(tripType: TripType, to: BookingStatus): WalkaroundStage? = when {
        to == BookingStatus.PICKED_UP -> WalkaroundStage.PICKUP_FROM_CUSTOMER
        to == BookingStatus.DROP_EN_ROUTE && tripType == TripType.DROP_ONLY -> WalkaroundStage.PICKUP_FROM_WORKSHOP
        to == BookingStatus.COMPLETED && tripType.hasDropLeg -> WalkaroundStage.DROP_TO_CUSTOMER
        else -> null
    }

    /** The rider goes through the issue checklist with the service advisor when handing over at the workshop. */
    fun checklistRequiredFor(to: BookingStatus): Boolean = to == BookingStatus.AT_WORKSHOP

    val REQUIRED_ANGLES: List<PhotoAngle> = PhotoAngle.entries.toList()
}
