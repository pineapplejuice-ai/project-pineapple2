package com.autobridge.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class VehicleType { CAR, BIKE }

@Serializable
enum class FuelType {
    PETROL, DIESEL, CNG, ELECTRIC, HYBRID;

    val isElectrified: Boolean get() = this == ELECTRIC || this == HYBRID
}

@Serializable
data class Vehicle(
    val id: String,
    val type: VehicleType,
    val brandId: String,
    val brandName: String,
    val modelId: String,
    val modelName: String,
    val fuel: FuelType,
    /** Normalised registration number without spaces, e.g. KA01AB1234 or 22BH1234AB. */
    val registrationNumber: String,
    val year: Int,
    val kmDriven: Int,
    /** Epoch day of the last service, null if unknown. */
    val lastServiceEpochDay: Long? = null,
) {
    val displayName: String get() = "$brandName $modelName"
    val displayRegistration: String get() = RegistrationNumber.format(registrationNumber)
}

/** Catalogue loaded from the bundled JSON asset. */
@Serializable
data class VehicleCatalogue(val brands: List<Brand>) {
    fun brandsFor(type: VehicleType): List<Brand> = brands.filter { it.type == type }.sortedBy { it.name }
    fun brand(id: String): Brand? = brands.firstOrNull { it.id == id }
}

@Serializable
data class Brand(
    val id: String,
    val name: String,
    val type: VehicleType,
    val evOnly: Boolean = false,
    val models: List<VehicleModel>,
)

@Serializable
data class VehicleModel(
    val id: String,
    val name: String,
    val fuels: List<FuelType>,
)
