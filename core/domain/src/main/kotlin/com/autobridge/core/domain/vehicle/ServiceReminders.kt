package com.autobridge.core.domain.vehicle

import com.autobridge.core.model.Vehicle
import com.autobridge.core.model.VehicleType

data class ServiceReminder(val vehicle: Vehicle, val daysOverdue: Long, val neverServiced: Boolean)

/** Service intervals: cars every 180 days, bikes every 90 days. */
object ServiceReminders {
    fun intervalDays(type: VehicleType): Long = if (type == VehicleType.CAR) 180 else 90

    fun reminderFor(vehicle: Vehicle, todayEpochDay: Long): ServiceReminder? {
        val last = vehicle.lastServiceEpochDay ?: return ServiceReminder(vehicle, 0, neverServiced = true)
        val overdue = todayEpochDay - last - intervalDays(vehicle.type)
        return if (overdue >= -7) ServiceReminder(vehicle, overdue, neverServiced = false) else null
    }
}

/** Validation for the add-vehicle form (registration is validated by RegistrationNumber). */
object VehicleValidation {
    const val MIN_YEAR = 1990
    fun isValidYear(year: Int?, currentYear: Int): Boolean = year != null && year in MIN_YEAR..currentYear
    fun isValidKm(km: Int?): Boolean = km != null && km in 0..999_999
    fun isValidLastService(epochDay: Long?, todayEpochDay: Long, purchaseYearStartEpochDay: Long): Boolean =
        epochDay == null || (epochDay <= todayEpochDay && epochDay >= purchaseYearStartEpochDay)
}
