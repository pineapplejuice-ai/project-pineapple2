package com.autobridge.core.domain

import com.autobridge.core.model.*

object Fixtures {
    val KORAMANGALA = GeoPoint(12.9352, 77.6245)

    fun partner(
        id: String = "p1", rating: Double = 4.5, reviews: Int = 100, verified: Boolean = true,
        cats: List<PartnerCategory> = listOf(PartnerCategory.DETAILING), location: GeoPoint = KORAMANGALA,
        types: Set<VehicleType> = setOf(VehicleType.CAR), brands: Set<String> = emptySet(), isPartner: Boolean = true,
        hours: OpeningHours = OpeningHours.everyDay(9 * 60, 19 * 60),
    ) = Partner(id = id, name = "Demo $id", categories = cats, area = "Koramangala", address = "", location = location,
        rating = rating, reviewCount = reviews, verified = verified, isPartner = isPartner, vehicleTypes = types, brandIds = brands, hours = hours)

    fun vehicle(type: VehicleType = VehicleType.CAR, brand: String = "maruti-suzuki", fuel: FuelType = FuelType.PETROL) =
        Vehicle("v1", type, brand, "Brand", "$brand-model", "Model", fuel, "KA01AB1234", 2020, 10000, null)

    fun pkg(partnerId: String = "p1", price: Int = 500, type: PriceType = PriceType.FIXED, vehicleType: VehicleType = VehicleType.CAR) =
        ServicePackage("$partnerId-k$price", partnerId, "Package $price", category = PartnerCategory.DETAILING, vehicleType = vehicleType, priceType = type, price = price)

    /** ~1 km per 0.009 degrees of latitude. */
    fun kmNorth(km: Double) = GeoPoint(KORAMANGALA.lat + km / 111.19, KORAMANGALA.lng)

    fun address(km: Double = 3.0) = SavedAddress("a1", AddressLabel.HOME, "Line", "Area", location = kmNorth(km))
}
