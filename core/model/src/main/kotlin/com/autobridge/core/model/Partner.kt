package com.autobridge.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class PartnerCategory {
    AUTHORISED_SERVICE, MULTI_BRAND_GARAGE, DETAILING, CAR_WASH, TYRES_WHEELS, BATTERY, EV_SERVICE
}

@Serializable
enum class PartnerSource { AUTOBRIDGE, GOOGLE_PLACES }

/** Opening hours for one ISO day (1 = Monday .. 7 = Sunday), minutes from midnight. */
@Serializable
data class DayHours(val dayOfWeek: Int, val openMinute: Int, val closeMinute: Int)

@Serializable
data class OpeningHours(val days: List<DayHours>) {
    fun forDay(dayOfWeek: Int): DayHours? = days.firstOrNull { it.dayOfWeek == dayOfWeek }

    fun isOpenAt(dayOfWeek: Int, minuteOfDay: Int): Boolean {
        val d = forDay(dayOfWeek) ?: return false
        return minuteOfDay >= d.openMinute && minuteOfDay < d.closeMinute
    }

    companion object {
        fun everyDay(open: Int, close: Int, closedOn: Set<Int> = emptySet()) =
            OpeningHours((1..7).filterNot { it in closedOn }.map { DayHours(it, open, close) })
    }
}

@Serializable
data class Partner(
    val id: String,
    val name: String,
    val categories: List<PartnerCategory>,
    val area: String,
    val address: String,
    val location: GeoPoint,
    val phone: String = "",
    val whatsapp: String = "",
    val photoUrls: List<String> = emptyList(),
    /** AutoBridge customer rating (1..5), 0 if no reviews. */
    val rating: Double = 0.0,
    val reviewCount: Int = 0,
    /** Google rating shown separately and labelled as such; never mixed into [rating]. */
    val googleRating: Double? = null,
    val googleReviewCount: Int? = null,
    val verified: Boolean = false,
    /** Only onboarded partners can take bookings. */
    val isPartner: Boolean = false,
    val vehicleTypes: Set<VehicleType> = setOf(VehicleType.CAR),
    /** Brands an authorised centre is authorised for. Empty = multi-brand. */
    val brandIds: Set<String> = emptySet(),
    val hours: OpeningHours = OpeningHours.everyDay(9 * 60, 19 * 60),
    val commissionPercent: Double = DEFAULT_COMMISSION_PERCENT,
    val source: PartnerSource = PartnerSource.AUTOBRIDGE,
    val placeId: String? = null,
    val description: String = "",
    /** Max bookings per slot. */
    val slotCapacity: Int = 3,
) {
    val canTakeBookings: Boolean get() = isPartner && source == PartnerSource.AUTOBRIDGE
    val primaryCategory: PartnerCategory get() = categories.first()

    companion object {
        const val DEFAULT_COMMISSION_PERCENT = 10.0
    }
}

@Serializable
enum class PriceType { FIXED, FROM }

@Serializable
data class ServicePackage(
    val id: String,
    val partnerId: String,
    val name: String,
    val description: String = "",
    val category: PartnerCategory,
    val vehicleType: VehicleType,
    val priceType: PriceType,
    /** Rupees. For FROM packages this is the starting price; the final amount comes via the estimate. */
    val price: Int,
    val durationMinutes: Int = 120,
    val inclusions: List<String> = emptyList(),
    val popular: Boolean = false,
)

@Serializable
data class Review(
    val id: String,
    val partnerId: String,
    val authorName: String,
    val rating: Int,
    val text: String,
    val createdAtMillis: Long,
    val bookingId: String? = null,
)

@Serializable
enum class ShopRequestStatus { NEW, CONTACTED, ONBOARDED, REJECTED }

/** Lead captured when a customer taps "Request this shop" on a Google Places suggestion. */
@Serializable
data class ShopRequest(
    val id: String,
    val placeId: String?,
    val name: String,
    val address: String,
    val category: PartnerCategory,
    val requestedBy: String,
    val createdAtMillis: Long,
    val status: ShopRequestStatus = ShopRequestStatus.NEW,
)
