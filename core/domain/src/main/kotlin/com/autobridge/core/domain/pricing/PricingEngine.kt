package com.autobridge.core.domain.pricing

import com.autobridge.core.model.*
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

data class PricingConfig(
    val carBase: Int = 249,
    val bikeBase: Int = 99,
    val includedKmPerLeg: Double = 8.0,
    val carPerKm: Int = 15,
    val bikePerKm: Int = 8,
    /** Single leg (pickup only / drop only) costs this share of the round-trip base. */
    val singleLegFactor: Double = 0.6,
    val earlySlotStartHour: Int = 8,
    val earlySlotEndHour: Int = 10,
    val earlySlotSurcharge: Int = 30,
    val carCancellationFee: Int = 99,
    val bikeCancellationFee: Int = 49,
)

data class PriceQuote(
    val breakdown: PriceBreakdown,
    val commissionPercent: Double,
    val commissionAmount: Int,
)

/**
 * Pricing rules:
 * - Pickup & drop: car ₹249 / bike ₹99 covers up to 8 km each way, then ₹15 / ₹8 per extra km per leg (rounded up).
 * - Single leg = 60% of the base (rounded), extra km still charged on that leg.
 * - 8–10 AM slot: +₹30.
 * - Partner commission (default 10%) on the service amount, stored per booking, never shown to the customer.
 */
class PricingEngine(private val config: PricingConfig = PricingConfig()) {

    val earlySlotSurcharge: Int get() = config.earlySlotSurcharge

    fun logisticsBase(vehicleType: VehicleType, tripType: TripType): Int {
        val base = if (vehicleType == VehicleType.CAR) config.carBase else config.bikeBase
        return if (tripType == TripType.PICKUP_AND_DROP) base else (base * config.singleLegFactor).roundToInt()
    }

    fun extraKm(legDistanceKm: Double): Int = max(0, ceil(legDistanceKm - config.includedKmPerLeg - 1e-9).toInt())

    fun perKm(vehicleType: VehicleType): Int = if (vehicleType == VehicleType.CAR) config.carPerKm else config.bikePerKm

    fun isEarlySlot(slot: TimeSlot): Boolean =
        slot.startHour >= config.earlySlotStartHour && slot.startHour < config.earlySlotEndHour

    /**
     * @param pickupKm distance customer → partner for the pickup leg (ignored when there is no pickup leg)
     * @param dropKm distance partner → customer for the drop leg (ignored when there is no drop leg)
     */
    fun quote(
        vehicleType: VehicleType,
        tripType: TripType,
        servicePackage: PackageSnapshot?,
        pickupKm: Double,
        dropKm: Double,
        slot: TimeSlot,
        commissionPercent: Double = Partner.DEFAULT_COMMISSION_PERCENT,
        approvedExtras: Int = 0,
    ): PriceQuote {
        val lines = mutableListOf<PriceLine>()
        servicePackage?.let {
            lines += PriceLine(if (it.priceType == PriceType.FIXED) PriceLine.Kind.SERVICE else PriceLine.Kind.SERVICE_FROM, it.price)
        }
        lines += PriceLine(PriceLine.Kind.LOGISTICS, logisticsBase(vehicleType, tripType), tripType.legCount)
        val km = (if (tripType.hasPickupLeg) extraKm(pickupKm) else 0) + (if (tripType.hasDropLeg) extraKm(dropKm) else 0)
        if (km > 0) lines += PriceLine(PriceLine.Kind.EXTRA_DISTANCE, km * perKm(vehicleType), km)
        if (isEarlySlot(slot)) lines += PriceLine(PriceLine.Kind.EARLY_SLOT, config.earlySlotSurcharge)
        if (approvedExtras > 0) lines += PriceLine(PriceLine.Kind.APPROVED_EXTRAS, approvedExtras)
        val serviceAmount = (servicePackage?.price ?: 0) + approvedExtras
        val total = lines.sumOf { it.amount }
        val isEstimate = servicePackage == null || servicePackage.priceType == PriceType.FROM
        return PriceQuote(
            breakdown = PriceBreakdown(lines, total, isEstimate),
            commissionPercent = commissionPercent,
            commissionAmount = commission(serviceAmount, commissionPercent),
        )
    }

    fun commission(serviceAmount: Int, percent: Double): Int = (serviceAmount * percent / 100.0).roundToInt()

    fun cancellationFee(booking: Booking): Int =
        if (!BookingRules.riderAssigned(booking)) 0
        else if (booking.vehicle.type == VehicleType.CAR) config.carCancellationFee else config.bikeCancellationFee

    /** Re-prices a booking after estimate approval: approved extras are added, commission recalculated. */
    fun repriceWithEstimate(booking: Booking): Booking {
        val extras = booking.estimate?.approvedTotal ?: 0
        val lines = booking.price.lines.filterNot { it.kind == PriceLine.Kind.APPROVED_EXTRAS }.toMutableList()
        if (extras > 0) lines += PriceLine(PriceLine.Kind.APPROVED_EXTRAS, extras)
        val serviceAmount = (booking.servicePackage?.price ?: 0) + extras
        return booking.copy(
            price = booking.price.copy(lines = lines, total = lines.sumOf { it.amount }, isEstimate = false),
            commissionAmount = commission(serviceAmount, booking.commissionPercent),
        )
    }
}
