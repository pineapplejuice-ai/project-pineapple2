package com.autobridge.core.domain.partner

import com.autobridge.core.model.*
import kotlin.math.ln
import kotlin.math.min

/** A partner with everything the UI needs to list it. */
data class RankedPartner(
    val partner: Partner,
    val distanceKm: Double,
    val isOpenNow: Boolean,
    val bayesianRating: Double,
    val score: Double,
    val startingPrice: Int? = null,
)

data class RankingWeights(
    val rating: Double = 0.45,
    val reviews: Double = 0.15,
    val distance: Double = 0.25,
    val verified: Double = 0.10,
    val openNow: Double = 0.05,
    /** Bayesian prior: mean rating and how many "virtual" reviews it is worth. */
    val priorMean: Double = 3.8,
    val priorWeight: Int = 20,
    /** Review count at which the review signal saturates. */
    val reviewSaturation: Int = 500,
)

/**
 * "Best near you": Bayesian rating (so 5.0 with 3 reviews doesn't beat 4.6 with 800), review volume, distance within
 * the radius, verified badge and open-now.
 */
class PartnerRanker(private val w: RankingWeights = RankingWeights()) {

    fun bayesian(rating: Double, count: Int): Double =
        if (count <= 0) w.priorMean else (count * rating + w.priorWeight * w.priorMean) / (count + w.priorWeight)

    fun score(partner: Partner, distanceKm: Double, radiusKm: Double, openNow: Boolean): Double {
        val ratingScore = (bayesian(partner.rating, partner.reviewCount) - 1.0) / 4.0
        val reviewScore = min(1.0, ln(1.0 + partner.reviewCount) / ln(1.0 + w.reviewSaturation))
        val distanceScore = if (radiusKm <= 0) 0.0 else (1.0 - distanceKm / radiusKm).coerceIn(0.0, 1.0)
        return w.rating * ratingScore + w.reviews * reviewScore + w.distance * distanceScore +
            w.verified * (if (partner.verified) 1.0 else 0.0) + w.openNow * (if (openNow) 1.0 else 0.0)
    }

    fun rank(partners: List<RankedPartner>, radiusKm: Double): List<RankedPartner> = partners
        .map { it.copy(score = score(it.partner, it.distanceKm, radiusKm, it.isOpenNow), bayesianRating = bayesian(it.partner.rating, it.partner.reviewCount)) }
        .sortedWith(compareByDescending<RankedPartner> { it.score }.thenBy { it.distanceKm })
}

enum class PartnerSort { BEST, NEAREST, RATING, PRICE_LOW }

data class PartnerFilter(
    val query: String = "",
    val category: PartnerCategory? = null,
    val vehicle: Vehicle? = null,
    /** Restrict to centres that support the vehicle's brand (authorised) / fuel (EV). */
    val brandCompatibleOnly: Boolean = true,
    val vehicleType: VehicleType? = null,
    val radiusKm: Double = DEFAULT_RADIUS_KM,
    val openNowOnly: Boolean = false,
    val verifiedOnly: Boolean = false,
    val sort: PartnerSort = PartnerSort.BEST,
) {
    companion object {
        const val DEFAULT_RADIUS_KM = 10.0
        val RADIUS_OPTIONS = listOf(3.0, 5.0, 10.0, 20.0)
    }
}

object PartnerCompatibility {
    /** Authorised centres only for their brands; EV specialists only for electrified vehicles; vehicle type must match. */
    fun isCompatible(partner: Partner, vehicle: Vehicle): Boolean {
        if (vehicle.type !in partner.vehicleTypes) return false
        if (PartnerCategory.AUTHORISED_SERVICE in partner.categories && partner.brandIds.isNotEmpty() &&
            vehicle.brandId !in partner.brandIds
        ) return false
        if (partner.categories == listOf(PartnerCategory.EV_SERVICE) && !vehicle.fuel.isElectrified) return false
        return true
    }

    fun isAuthorisedFor(partner: Partner, brandId: String): Boolean =
        PartnerCategory.AUTHORISED_SERVICE in partner.categories && brandId in partner.brandIds
}

/** Applies filters, distance, ranking and sorting. Pure: callers pass time and location. */
class PartnerSearch(private val ranker: PartnerRanker = PartnerRanker()) {

    fun search(
        partners: List<Partner>,
        packages: List<ServicePackage>,
        filter: PartnerFilter,
        near: GeoPoint,
        dayOfWeek: Int,
        minuteOfDay: Int,
    ): List<RankedPartner> {
        val q = filter.query.trim().lowercase()
        val vehicleType = filter.vehicle?.type ?: filter.vehicleType
        val candidates = partners.asSequence()
            .filter { filter.category == null || filter.category in it.categories }
            .filter { vehicleType == null || vehicleType in it.vehicleTypes }
            .filter { !filter.brandCompatibleOnly || filter.vehicle == null || PartnerCompatibility.isCompatible(it, filter.vehicle) }
            .filter { !filter.verifiedOnly || it.verified }
            .filter { q.isEmpty() || matches(it, packages, q) }
            .map { p ->
                val pkgPrices = packages.filter { it.partnerId == p.id && (vehicleType == null || it.vehicleType == vehicleType) }.map { it.price }
                RankedPartner(
                    partner = p,
                    distanceKm = near.distanceKmTo(p.location),
                    isOpenNow = p.hours.isOpenAt(dayOfWeek, minuteOfDay),
                    bayesianRating = 0.0,
                    score = 0.0,
                    startingPrice = pkgPrices.minOrNull(),
                )
            }
            .filter { it.distanceKm <= filter.radiusKm }
            .filter { !filter.openNowOnly || it.isOpenNow }
            .toList()
        val ranked = ranker.rank(candidates, filter.radiusKm)
        return when (filter.sort) {
            PartnerSort.BEST -> ranked
            PartnerSort.NEAREST -> ranked.sortedBy { it.distanceKm }
            PartnerSort.RATING -> ranked.sortedByDescending { it.bayesianRating }
            PartnerSort.PRICE_LOW -> ranked.sortedWith(compareBy<RankedPartner, Int?>(nullsLast()) { it.startingPrice })
        }
    }

    private fun matches(p: Partner, packages: List<ServicePackage>, q: String): Boolean =
        p.name.lowercase().contains(q) || p.area.lowercase().contains(q) ||
            p.categories.any { it.name.replace('_', ' ').lowercase().contains(q) } ||
            packages.any { it.partnerId == p.id && it.name.lowercase().contains(q) }
}
