package com.autobridge.app.core.ui

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.graphics.vector.ImageVector
import com.autobridge.app.R
import com.autobridge.core.domain.booking.DraftError
import com.autobridge.core.domain.partner.PartnerSort
import com.autobridge.core.model.*

@StringRes fun categoryLabel(c: PartnerCategory): Int = when (c) {
    PartnerCategory.AUTHORISED_SERVICE -> R.string.cat_authorised
    PartnerCategory.MULTI_BRAND_GARAGE -> R.string.cat_garage
    PartnerCategory.DETAILING -> R.string.cat_detailing
    PartnerCategory.CAR_WASH -> R.string.cat_wash
    PartnerCategory.TYRES_WHEELS -> R.string.cat_tyres
    PartnerCategory.BATTERY -> R.string.cat_battery
    PartnerCategory.EV_SERVICE -> R.string.cat_ev
}

fun categoryIcon(c: PartnerCategory): ImageVector = when (c) {
    PartnerCategory.AUTHORISED_SERVICE -> Icons.Filled.VerifiedUser
    PartnerCategory.MULTI_BRAND_GARAGE -> Icons.Filled.Build
    PartnerCategory.DETAILING -> Icons.Filled.Brush
    PartnerCategory.CAR_WASH -> Icons.Filled.LocalCarWash
    PartnerCategory.TYRES_WHEELS -> Icons.Filled.DonutLarge
    PartnerCategory.BATTERY -> Icons.Filled.BatteryChargingFull
    PartnerCategory.EV_SERVICE -> Icons.Filled.EvStation
}

@StringRes fun statusTitleRes(s: BookingStatus, trip: TripType): Int = when (s) {
    BookingStatus.REQUESTED -> R.string.status_requested
    BookingStatus.CONFIRMED -> R.string.status_confirmed
    BookingStatus.RIDER_ASSIGNED -> R.string.status_rider_assigned
    BookingStatus.PICKUP_EN_ROUTE -> R.string.status_pickup_en_route
    BookingStatus.PICKED_UP -> R.string.status_picked_up
    BookingStatus.AT_WORKSHOP -> R.string.status_at_workshop
    BookingStatus.ESTIMATE_SHARED -> R.string.status_estimate_shared
    BookingStatus.IN_SERVICE -> R.string.status_in_service
    BookingStatus.READY -> if (trip == TripType.PICKUP_ONLY) R.string.status_ready_collect else R.string.status_ready
    BookingStatus.DROP_EN_ROUTE -> R.string.status_drop_en_route
    BookingStatus.COMPLETED -> if (trip == TripType.PICKUP_ONLY) R.string.status_collected else R.string.status_delivered
    BookingStatus.CANCELLED -> R.string.status_cancelled
    BookingStatus.DECLINED -> R.string.status_declined
}

@StringRes fun tripTypeLabel(t: TripType): Int = when (t) {
    TripType.PICKUP_AND_DROP -> R.string.trip_pickup_drop
    TripType.PICKUP_ONLY -> R.string.trip_pickup_only
    TripType.DROP_ONLY -> R.string.trip_drop_only
}

@StringRes fun tripTypeDescription(t: TripType): Int = when (t) {
    TripType.PICKUP_AND_DROP -> R.string.trip_pickup_drop_desc
    TripType.PICKUP_ONLY -> R.string.trip_pickup_only_desc
    TripType.DROP_ONLY -> R.string.trip_drop_only_desc
}

@StringRes fun fuelLabel(f: FuelType): Int = when (f) {
    FuelType.PETROL -> R.string.fuel_petrol
    FuelType.DIESEL -> R.string.fuel_diesel
    FuelType.CNG -> R.string.fuel_cng
    FuelType.ELECTRIC -> R.string.fuel_electric
    FuelType.HYBRID -> R.string.fuel_hybrid
}

@StringRes fun vehicleTypeLabel(t: VehicleType): Int = if (t == VehicleType.CAR) R.string.vehicle_car else R.string.vehicle_bike

fun vehicleTypeIcon(t: VehicleType): ImageVector = if (t == VehicleType.CAR) Icons.Filled.DirectionsCar else Icons.Filled.Motorcycle

@StringRes fun addressLabel(l: AddressLabel): Int = when (l) {
    AddressLabel.HOME -> R.string.address_home
    AddressLabel.WORK -> R.string.address_work
    AddressLabel.OTHER -> R.string.address_other
}

fun addressIcon(l: AddressLabel): ImageVector = when (l) {
    AddressLabel.HOME -> Icons.Filled.Home
    AddressLabel.WORK -> Icons.Filled.Work
    AddressLabel.OTHER -> Icons.Filled.Place
}

@StringRes fun sortLabel(s: PartnerSort): Int = when (s) {
    PartnerSort.BEST -> R.string.sort_best
    PartnerSort.NEAREST -> R.string.sort_nearest
    PartnerSort.RATING -> R.string.sort_rating
    PartnerSort.PRICE_LOW -> R.string.sort_price
}

@StringRes fun photoAngleLabel(a: PhotoAngle): Int = when (a) {
    PhotoAngle.FRONT -> R.string.angle_front
    PhotoAngle.REAR -> R.string.angle_rear
    PhotoAngle.LEFT -> R.string.angle_left
    PhotoAngle.RIGHT -> R.string.angle_right
    PhotoAngle.ODOMETER -> R.string.angle_odometer
}

@StringRes fun walkaroundStageLabel(s: WalkaroundStage): Int = when (s) {
    WalkaroundStage.PICKUP_FROM_CUSTOMER -> R.string.stage_pickup_customer
    WalkaroundStage.PICKUP_FROM_WORKSHOP -> R.string.stage_pickup_workshop
    WalkaroundStage.DROP_TO_CUSTOMER -> R.string.stage_drop_customer
}

@StringRes fun priceLineLabel(k: PriceLine.Kind): Int = when (k) {
    PriceLine.Kind.SERVICE -> R.string.price_service
    PriceLine.Kind.SERVICE_FROM -> R.string.price_service_from
    PriceLine.Kind.LOGISTICS -> R.string.price_logistics
    PriceLine.Kind.EXTRA_DISTANCE -> R.string.price_extra_km
    PriceLine.Kind.EARLY_SLOT -> R.string.price_early_slot
    PriceLine.Kind.APPROVED_EXTRAS -> R.string.price_extras
    PriceLine.Kind.CANCELLATION_FEE -> R.string.price_cancel_fee
}

@StringRes fun draftErrorLabel(e: DraftError): Int = when (e) {
    DraftError.NO_VEHICLE -> R.string.err_no_vehicle
    DraftError.NO_PARTNER -> R.string.err_no_partner
    DraftError.PARTNER_NOT_BOOKABLE -> R.string.err_partner_not_bookable
    DraftError.PARTNER_INCOMPATIBLE -> R.string.err_partner_incompatible
    DraftError.NO_SERVICE_OR_ISSUE -> R.string.err_no_service
    DraftError.TOO_MANY_PHOTOS -> R.string.err_too_many_photos
    DraftError.NO_PICKUP_ADDRESS -> R.string.err_no_pickup
    DraftError.NO_DROP_ADDRESS -> R.string.err_no_drop
    DraftError.NO_JOB_CARD -> R.string.err_no_job_card
    DraftError.NO_SLOT -> R.string.err_no_slot
    DraftError.SLOT_FULL -> R.string.err_slot_full
    DraftError.SLOT_IN_PAST -> R.string.err_slot_past
}

@StringRes fun registrationError(r: RegistrationNumber.Reason): Int = when (r) {
    RegistrationNumber.Reason.EMPTY -> R.string.reg_err_empty
    RegistrationNumber.Reason.BAD_FORMAT -> R.string.reg_err_format
    RegistrationNumber.Reason.UNKNOWN_STATE -> R.string.reg_err_state
    RegistrationNumber.Reason.ZERO_NUMBER -> R.string.reg_err_zero
}

@StringRes fun roleLabel(r: UserRole): Int = when (r) {
    UserRole.CUSTOMER -> R.string.role_customer
    UserRole.PARTNER -> R.string.role_partner
    UserRole.RIDER -> R.string.role_rider
    UserRole.OPS -> R.string.role_ops
}
