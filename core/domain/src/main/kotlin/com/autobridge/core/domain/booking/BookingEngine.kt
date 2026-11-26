package com.autobridge.core.domain.booking

import com.autobridge.core.domain.pricing.PricingEngine
import com.autobridge.core.model.*

/** Everything the customer picked in the booking stepper. */
data class BookingDraft(
    val vehicle: Vehicle? = null,
    val partner: Partner? = null,
    val servicePackage: ServicePackage? = null,
    val issues: List<String> = emptyList(),
    val notes: String = "",
    val photoUris: List<String> = emptyList(),
    val tripType: TripType = TripType.PICKUP_AND_DROP,
    val pickupAddress: SavedAddress? = null,
    val dropAddress: SavedAddress? = null,
    val jobCardNumber: String = "",
    val epochDay: Long? = null,
    val slotId: String? = null,
)

enum class BookingStep { VEHICLE, PARTNER, SERVICE, TRIP, SLOT, REVIEW }

enum class DraftError {
    NO_VEHICLE, NO_PARTNER, PARTNER_NOT_BOOKABLE, PARTNER_INCOMPATIBLE, NO_SERVICE_OR_ISSUE, TOO_MANY_PHOTOS,
    NO_PICKUP_ADDRESS, NO_DROP_ADDRESS, NO_JOB_CARD, NO_SLOT, SLOT_FULL, SLOT_IN_PAST,
}

object BookingDraftValidator {
    const val MAX_PHOTOS = 3

    fun errorsFor(step: BookingStep, d: BookingDraft, fullSlots: Set<String> = emptySet(), todayEpochDay: Long = 0, nowHour: Int = 0): List<DraftError> {
        val e = mutableListOf<DraftError>()
        when (step) {
            BookingStep.VEHICLE -> if (d.vehicle == null) e += DraftError.NO_VEHICLE
            BookingStep.PARTNER -> when {
                d.partner == null -> e += DraftError.NO_PARTNER
                !d.partner.canTakeBookings -> e += DraftError.PARTNER_NOT_BOOKABLE
                d.vehicle != null && !com.autobridge.core.domain.partner.PartnerCompatibility.isCompatible(d.partner, d.vehicle) -> e += DraftError.PARTNER_INCOMPATIBLE
            }
            BookingStep.SERVICE -> {
                if (d.tripType != TripType.DROP_ONLY && d.servicePackage == null && d.issues.isEmpty() && d.notes.isBlank()) e += DraftError.NO_SERVICE_OR_ISSUE
                if (d.photoUris.size > MAX_PHOTOS) e += DraftError.TOO_MANY_PHOTOS
            }
            BookingStep.TRIP -> {
                if (d.tripType.hasPickupLeg && d.pickupAddress == null) e += DraftError.NO_PICKUP_ADDRESS
                if (d.tripType.hasDropLeg && d.dropAddress == null) e += DraftError.NO_DROP_ADDRESS
                if (d.tripType == TripType.DROP_ONLY && d.jobCardNumber.isBlank()) e += DraftError.NO_JOB_CARD
            }
            BookingStep.SLOT -> when {
                d.epochDay == null || d.slotId == null -> e += DraftError.NO_SLOT
                d.slotId in fullSlots -> e += DraftError.SLOT_FULL
                SlotRules.isPast(d.epochDay, d.slotId, todayEpochDay, nowHour) -> e += DraftError.SLOT_IN_PAST
            }
            BookingStep.REVIEW -> BookingStep.entries.filter { it != BookingStep.REVIEW }
                .forEach { e += errorsFor(it, d, fullSlots, todayEpochDay, nowHour) }
        }
        return e
    }
}

object SlotRules {
    const val BOOKABLE_DAYS = 7

    fun days(todayEpochDay: Long): List<Long> = (0 until BOOKABLE_DAYS).map { todayEpochDay + it }

    /** A slot is past if it starts within the next hour today. */
    fun isPast(epochDay: Long, slotId: String, todayEpochDay: Long, nowHour: Int): Boolean {
        val slot = TimeSlot.byId(slotId) ?: return true
        return epochDay < todayEpochDay || (epochDay == todayEpochDay && slot.startHour <= nowHour)
    }

    fun fullSlots(bookedCounts: Map<String, Int>, capacity: Int): Set<String> =
        bookedCounts.filter { it.value >= capacity }.keys
}

/** Builds and mutates bookings according to the domain rules. Returns null when an action is not allowed. */
class BookingFactory(private val pricing: PricingEngine) {

    fun quote(d: BookingDraft): com.autobridge.core.domain.pricing.PriceQuote? {
        val vehicle = d.vehicle ?: return null
        val partner = d.partner ?: return null
        val slot = d.slotId?.let { TimeSlot.byId(it) } ?: TimeSlot.ALL[1]
        return pricing.quote(
            vehicleType = vehicle.type,
            tripType = d.tripType,
            servicePackage = d.servicePackage?.toSnapshot(),
            pickupKm = d.pickupAddress?.location?.distanceKmTo(partner.location) ?: 0.0,
            dropKm = d.dropAddress?.location?.distanceKmTo(partner.location) ?: 0.0,
            slot = slot,
            commissionPercent = partner.commissionPercent,
        )
    }

    fun create(d: BookingDraft, id: String, customer: UserProfile, nowMillis: Long): Booking? {
        if (BookingDraftValidator.errorsFor(BookingStep.REVIEW, d).isNotEmpty()) return null
        val vehicle = d.vehicle!!
        val partner = d.partner!!
        val q = quote(d) ?: return null
        val pkg = if (d.tripType == TripType.DROP_ONLY) null else d.servicePackage
        return Booking(
            id = id,
            customerId = customer.id,
            customerName = customer.name,
            customerPhone = customer.phone,
            vehicle = VehicleSnapshot(vehicle.id, vehicle.type, vehicle.brandId, vehicle.displayName, vehicle.fuel, vehicle.registrationNumber),
            partner = PartnerSnapshot(partner.id, partner.name, partner.area, partner.address, partner.location, partner.phone, partner.whatsapp),
            servicePackage = pkg?.toSnapshot(),
            issues = d.issues,
            notes = d.notes.trim(),
            photoUris = d.photoUris.take(BookingDraftValidator.MAX_PHOTOS),
            tripType = d.tripType,
            pickupAddress = d.pickupAddress.takeIf { d.tripType.hasPickupLeg },
            dropAddress = d.dropAddress.takeIf { d.tripType.hasDropLeg },
            jobCardNumber = d.jobCardNumber.trim().takeIf { d.tripType == TripType.DROP_ONLY },
            slot = BookingSlot(d.epochDay!!, d.slotId!!),
            price = q.breakdown,
            commissionPercent = q.commissionPercent,
            commissionAmount = q.commissionAmount,
            status = BookingStatus.REQUESTED,
            history = listOf(StatusEvent(BookingStatus.REQUESTED, nowMillis, Actor.CUSTOMER)),
            checklist = Checklists.forBooking(d.issues, vehicle.type),
            createdAtMillis = nowMillis,
        )
    }
}

fun ServicePackage.toSnapshot() = PackageSnapshot(id, name, priceType, price)

/** State changes on an existing booking. Every function validates against TripFlow / BookingRules. */
class BookingActions(private val pricing: PricingEngine) {

    fun transition(b: Booking, to: BookingStatus, actor: Actor, now: Long, note: String = ""): Booking? {
        if (!TripFlow.canTransition(b, to, actor)) return null
        if (actor == Actor.RIDER) {
            TripFlow.walkaroundRequiredFor(b.tripType, to)?.let { if (!b.hasCompleteWalkaround(it)) return null }
            if (TripFlow.checklistRequiredFor(to) && b.checklist.any { !it.checked }) return null
        }
        return b.withStatus(to, actor, now, note)
    }

    fun cancel(b: Booking, reason: String, now: Long): Booking? {
        if (!BookingRules.canCancel(b) || reason.isBlank()) return null
        val fee = pricing.cancellationFee(b)
        val lines = if (fee > 0) listOf(PriceLine(PriceLine.Kind.CANCELLATION_FEE, fee)) else emptyList()
        return b.withStatus(BookingStatus.CANCELLED, Actor.CUSTOMER, now, reason).copy(
            cancellation = Cancellation(reason, fee, Actor.CUSTOMER, now),
            price = PriceBreakdown(lines, fee, false),
            commissionAmount = 0,
        )
    }

    fun reschedule(b: Booking, slot: BookingSlot, now: Long): Booking? {
        if (!BookingRules.canReschedule(b)) return null
        val newSlot = slot.slot ?: return null
        val oldSlot = b.slot.slot
        var lines = b.price.lines.filterNot { it.kind == PriceLine.Kind.EARLY_SLOT }
        if (pricing.isEarlySlot(newSlot)) {
            lines = lines + PriceLine(PriceLine.Kind.EARLY_SLOT, pricing.earlySlotSurcharge)
        }
        return b.copy(
            slot = slot,
            price = b.price.copy(lines = lines, total = lines.sumOf { it.amount }),
            rescheduleCount = b.rescheduleCount + 1,
            history = b.history + StatusEvent(b.status, now, Actor.CUSTOMER, "Rescheduled from ${oldSlot?.label ?: b.slot.slotId}"),
            updatedAtMillis = now,
        )
    }

    fun shareEstimate(b: Booking, lines: List<EstimateLine>, note: String, now: Long): Booking? {
        if (b.status != BookingStatus.AT_WORKSHOP || b.tripType == TripType.DROP_ONLY) return null
        val withEstimate = b.copy(estimate = Estimate(lines.map { it.copy(approved = null) }, now, note))
        return withEstimate.withStatus(BookingStatus.ESTIMATE_SHARED, Actor.PARTNER, now)
    }

    /** Customer decides each line; when every line is decided the booking moves to IN_SERVICE. */
    fun decideEstimateLine(b: Booking, lineId: String, approved: Boolean, now: Long): Booking? {
        if (!BookingRules.canApproveEstimate(b)) return null
        val est = b.estimate!!
        val updated = b.copy(estimate = est.copy(lines = est.lines.map { if (it.id == lineId) it.copy(approved = approved) else it }), updatedAtMillis = now)
        return if (updated.estimate!!.isFullyDecided) {
            pricing.repriceWithEstimate(updated).withStatus(BookingStatus.IN_SERVICE, Actor.CUSTOMER, now, "Estimate approved")
        } else updated
    }

    fun approveAll(b: Booking, now: Long): Booking? {
        if (!BookingRules.canApproveEstimate(b)) return null
        var cur: Booking = b
        b.estimate!!.lines.filter { it.approved == null }.forEach { cur = decideEstimateLine(cur, it.id, true, now) ?: return null }
        return cur
    }

    fun assignRider(b: Booking, rider: Rider, now: Long): Booking? {
        if (b.status.isTerminal) return null
        val assigned = b.copy(riderId = rider.id, riderName = rider.name, riderPhone = rider.phone, updatedAtMillis = now)
        // Move into RIDER_ASSIGNED only when it's the next step; otherwise just attach the rider.
        return if (TripFlow.next(b) == BookingStatus.RIDER_ASSIGNED) assigned.withStatus(BookingStatus.RIDER_ASSIGNED, Actor.OPS, now, rider.name) else assigned
    }

    fun addWalkaroundPhoto(b: Booking, photo: WalkaroundPhoto): Booking =
        b.copy(walkaround = b.walkaround.filterNot { it.stage == photo.stage && it.angle == photo.angle } + photo, updatedAtMillis = photo.takenAtMillis)

    fun setChecklistItem(b: Booking, itemId: String, checked: Boolean, note: String, now: Long): Booking =
        b.copy(checklist = b.checklist.map { if (it.id == itemId) it.copy(checked = checked, advisorNote = note) else it }, updatedAtMillis = now)

    fun rate(b: Booking, riderStars: Int?, partnerStars: Int?, comment: String, now: Long): Booking? {
        if (!BookingRules.canRate(b)) return null
        val valid = { s: Int? -> s == null || s in 1..5 }
        if (!valid(riderStars) || !valid(partnerStars)) return null
        return b.copy(ratings = Ratings(riderStars ?: b.ratings.rider, partnerStars ?: b.ratings.partner, comment.trim()), updatedAtMillis = now)
    }

    private fun Booking.withStatus(to: BookingStatus, actor: Actor, now: Long, note: String = "") =
        copy(status = to, history = history + StatusEvent(to, now, actor, note), updatedAtMillis = now)
}

/** Issue catalogue shown in the booking stepper and the handover checklist built from it. */
object Checklists {
    val CAR_ISSUES = listOf(
        "Periodic service due", "Brake noise / weak brakes", "AC not cooling", "Battery weak / not starting",
        "Warning light on dashboard", "Pulling to one side", "Strange engine noise", "Oil or coolant leak",
        "Tyre wear / puncture", "Dents and scratches", "Interior cleaning", "Clutch / gear issue",
    )
    val BIKE_ISSUES = listOf(
        "Periodic service due", "Brake issue", "Chain noise / loose chain", "Battery / self-start issue",
        "Low mileage", "Strange engine noise", "Oil leak", "Tyre wear / puncture", "Headlight / indicator issue",
        "Clutch / gear issue",
    )
    private val HANDOVER = listOf(
        "Odometer reading noted with advisor", "Fuel / charge level noted", "Valuables removed from vehicle",
        "Spare wheel & tools present", "Existing dents/scratches shown to advisor", "Job card number received",
    )

    fun issuesFor(type: VehicleType) = if (type == VehicleType.CAR) CAR_ISSUES else BIKE_ISSUES

    fun forBooking(issues: List<String>, type: VehicleType): List<ChecklistItem> {
        val handover = if (type == VehicleType.CAR) HANDOVER else HANDOVER.filterNot { it.startsWith("Spare wheel") }
        return issues.mapIndexed { i, s -> ChecklistItem("issue-$i", s, reportedByCustomer = true) } +
            handover.mapIndexed { i, s -> ChecklistItem("check-$i", s, reportedByCustomer = false) }
    }
}
