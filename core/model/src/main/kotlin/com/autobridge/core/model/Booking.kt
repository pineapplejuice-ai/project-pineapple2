package com.autobridge.core.model

import kotlinx.serialization.Serializable

@Serializable
data class VehicleSnapshot(
    val vehicleId: String,
    val type: VehicleType,
    val brandId: String,
    val name: String,
    val fuel: FuelType,
    val registrationNumber: String,
)

@Serializable
data class PartnerSnapshot(
    val partnerId: String,
    val name: String,
    val area: String,
    val address: String,
    val location: GeoPoint,
    val phone: String,
    val whatsapp: String,
)

@Serializable
data class PackageSnapshot(
    val packageId: String,
    val name: String,
    val priceType: PriceType,
    val price: Int,
)

@Serializable
data class TimeSlot(val id: String, val startHour: Int, val endHour: Int) {
    val label: String get() = "${hourLabel(startHour)} – ${hourLabel(endHour)}"

    companion object {
        val ALL = listOf(8, 10, 12, 14, 16, 18).map { TimeSlot("%02d-%02d".format(it, it + 2), it, it + 2) }
        fun byId(id: String): TimeSlot? = ALL.firstOrNull { it.id == id }
        private fun hourLabel(h: Int): String = when {
            h == 0 || h == 24 -> "12 AM"
            h < 12 -> "$h AM"
            h == 12 -> "12 PM"
            else -> "${h - 12} PM"
        }
    }
}

@Serializable
data class BookingSlot(val epochDay: Long, val slotId: String) {
    val slot: TimeSlot? get() = TimeSlot.byId(slotId)
}

@Serializable
data class PriceLine(val kind: Kind, val amount: Int, val quantity: Int = 0) {
    @Serializable
    enum class Kind { SERVICE, SERVICE_FROM, LOGISTICS, EXTRA_DISTANCE, EARLY_SLOT, APPROVED_EXTRAS, CANCELLATION_FEE }
}

/** Customer-facing price. Commission is deliberately not part of this class. */
@Serializable
data class PriceBreakdown(
    val lines: List<PriceLine>,
    val total: Int,
    /** True when the service part is a "from" price and may change after the estimate. */
    val isEstimate: Boolean,
)

@Serializable
data class EstimateLine(
    val id: String,
    val description: String,
    val amount: Int,
    /** Added by the partner after inspection, on top of the booked package. */
    val isExtra: Boolean = true,
    /** null = awaiting customer decision. */
    val approved: Boolean? = null,
)

@Serializable
data class Estimate(
    val lines: List<EstimateLine>,
    val sharedAtMillis: Long,
    val note: String = "",
) {
    val approvedTotal: Int get() = lines.filter { it.approved == true }.sumOf { it.amount }
    val pendingCount: Int get() = lines.count { it.approved == null }
    val isFullyDecided: Boolean get() = lines.none { it.approved == null }
}

@Serializable
data class ChecklistItem(
    val id: String,
    val title: String,
    /** Reported by the customer while booking (vs. a standard handover check). */
    val reportedByCustomer: Boolean,
    val checked: Boolean = false,
    val advisorNote: String = "",
)

@Serializable
data class WalkaroundPhoto(val stage: WalkaroundStage, val angle: PhotoAngle, val uri: String, val takenAtMillis: Long)

@Serializable
data class StatusEvent(val status: BookingStatus, val atMillis: Long, val by: Actor, val note: String = "")

@Serializable
data class Cancellation(val reason: String, val fee: Int, val by: Actor, val atMillis: Long)

@Serializable
data class Ratings(val rider: Int? = null, val partner: Int? = null, val comment: String = "")

@Serializable
data class Booking(
    val id: String,
    val customerId: String,
    val customerName: String,
    val customerPhone: String,
    val vehicle: VehicleSnapshot,
    val partner: PartnerSnapshot,
    val servicePackage: PackageSnapshot?,
    val issues: List<String> = emptyList(),
    val notes: String = "",
    val photoUris: List<String> = emptyList(),
    val tripType: TripType,
    val pickupAddress: SavedAddress? = null,
    val dropAddress: SavedAddress? = null,
    val jobCardNumber: String? = null,
    val slot: BookingSlot,
    val price: PriceBreakdown,
    /** Internal: partner commission for this booking. Never shown to customers. */
    val commissionPercent: Double,
    val commissionAmount: Int,
    val status: BookingStatus = BookingStatus.REQUESTED,
    val history: List<StatusEvent> = emptyList(),
    val riderId: String? = null,
    val riderName: String? = null,
    val riderPhone: String? = null,
    val estimate: Estimate? = null,
    val checklist: List<ChecklistItem> = emptyList(),
    val walkaround: List<WalkaroundPhoto> = emptyList(),
    val cancellation: Cancellation? = null,
    val ratings: Ratings = Ratings(),
    val rescheduleCount: Int = 0,
    val createdAtMillis: Long,
    val updatedAtMillis: Long = createdAtMillis,
) {
    /**
     * Estimate approval is needed unless a fixed-price package was booked with no extras added.
     * Drop-only trips never go through an estimate on AutoBridge (the job is already running at the partner).
     */
    val requiresEstimate: Boolean
        get() = when {
            tripType == TripType.DROP_ONLY -> false
            estimate?.lines?.any { it.isExtra } == true -> true
            servicePackage == null -> true
            else -> servicePackage.priceType == PriceType.FROM
        }

    val isActive: Boolean get() = !status.isTerminal

    fun photosFor(stage: WalkaroundStage): List<WalkaroundPhoto> = walkaround.filter { it.stage == stage }

    fun hasCompleteWalkaround(stage: WalkaroundStage): Boolean {
        val angles = photosFor(stage).map { it.angle }.toSet()
        return TripFlow.REQUIRED_ANGLES.all { it in angles }
    }
}
