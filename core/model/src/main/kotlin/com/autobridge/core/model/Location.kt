package com.autobridge.core.model

import kotlinx.serialization.Serializable
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

@Serializable
data class GeoPoint(val lat: Double, val lng: Double) {
    /** Great-circle distance in kilometres (haversine). */
    fun distanceKmTo(other: GeoPoint): Double {
        val r = 6371.0
        val dLat = Math.toRadians(other.lat - lat)
        val dLng = Math.toRadians(other.lng - lng)
        val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(lat)) * cos(Math.toRadians(other.lat)) * sin(dLng / 2).pow(2)
        return 2 * r * asin(sqrt(a))
    }

    companion object {
        /** Demo default: Koramangala, Bengaluru. */
        val BENGALURU = GeoPoint(12.9352, 77.6245)
    }
}

@Serializable
enum class AddressLabel { HOME, WORK, OTHER }

@Serializable
data class SavedAddress(
    val id: String,
    val label: AddressLabel,
    val line1: String,
    val area: String,
    val landmark: String = "",
    val location: GeoPoint,
    /** Used when [label] is OTHER, e.g. "Mom's place". */
    val customLabel: String = "",
) {
    val shortText: String get() = listOf(line1, area).filter { it.isNotBlank() }.joinToString(", ")
}

/** Where the user currently wants to see partners for. */
@Serializable
data class UserLocation(val point: GeoPoint, val title: String, val subtitle: String = "", val addressId: String? = null)
