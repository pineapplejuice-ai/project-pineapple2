package com.autobridge.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class UserRole {
    CUSTOMER, PARTNER, RIDER, OPS;

    companion object {
        /** Maps the Firebase custom claim `role` (partner|rider|ops) to a role; anything else is a customer. */
        fun fromClaim(claim: String?): UserRole = when (claim?.lowercase()) {
            "partner" -> PARTNER
            "rider" -> RIDER
            "ops" -> OPS
            else -> CUSTOMER
        }
    }
}

@Serializable
data class UserProfile(
    val id: String,
    val phone: String,
    val name: String = "",
    val role: UserRole = UserRole.CUSTOMER,
    /** For partner accounts: the partner they manage. */
    val partnerId: String? = null,
    /** For rider accounts: the rider record they act as. */
    val riderId: String? = null,
)

@Serializable
data class Rider(val id: String, val name: String, val phone: String, val vehicleType: VehicleType = VehicleType.BIKE)
