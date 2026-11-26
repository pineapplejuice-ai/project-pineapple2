package com.autobridge.core.domain.repository

import com.autobridge.core.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/** Simple synchronous string storage (SharedPreferences on Android, a map in tests). */
interface KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String?)
}

interface Clock {
    fun nowMillis(): Long
    /** Epoch day in the user's zone. */
    fun todayEpochDay(): Long
    /** ISO day of week (1=Mon) and minute of day, in the user's zone. */
    fun dayOfWeek(): Int
    fun minuteOfDay(): Int
}

sealed interface OtpResult {
    data object CodeSent : OtpResult
    data class Error(val message: String) : OtpResult
}

interface AuthRepository {
    val currentUser: StateFlow<UserProfile?>
    /** True for demo auth (OTP 123456). */
    val isDemo: Boolean
    suspend fun sendOtp(phone: String): OtpResult
    suspend fun verifyOtp(code: String): Result<UserProfile>
    suspend fun updateName(name: String)
    suspend fun signOut()
    /** Demo only: switch role mode (no-op in real mode, where roles come from custom claims). */
    suspend fun setDemoRole(role: UserRole)
}

interface VehicleCatalogueRepository {
    suspend fun catalogue(): VehicleCatalogue
}

interface VehicleRepository {
    fun observeVehicles(): Flow<List<Vehicle>>
    fun observeSelectedVehicleId(): Flow<String?>
    suspend fun addVehicle(vehicle: Vehicle)
    suspend fun deleteVehicle(id: String)
    suspend fun selectVehicle(id: String)
}

interface AddressRepository {
    fun observeAddresses(): Flow<List<SavedAddress>>
    fun observeCurrentLocation(): Flow<UserLocation?>
    suspend fun saveAddress(address: SavedAddress)
    suspend fun deleteAddress(id: String)
    suspend fun setCurrentLocation(location: UserLocation)
}

sealed interface LocationResult {
    data class Success(val point: GeoPoint) : LocationResult
    data object PermissionDenied : LocationResult
    data object Unavailable : LocationResult
}

interface LocationProvider {
    val isDemo: Boolean
    fun hasPermission(): Boolean
    suspend fun currentLocation(): LocationResult
}

interface PartnerRepository {
    fun observePartners(): Flow<List<Partner>>
    fun observePackages(): Flow<List<ServicePackage>>
    fun observeReviews(partnerId: String): Flow<List<Review>>
    suspend fun partner(id: String): Partner?
    suspend fun savePartner(partner: Partner)
    suspend fun savePackage(pkg: ServicePackage)
    suspend fun deletePackage(id: String)
}

/** Google Places suggestions for shops not yet on AutoBridge. Disabled without PLACES_API_KEY. */
interface PlacesSuggestionRepository {
    val isEnabled: Boolean
    suspend fun nearby(category: PartnerCategory?, near: GeoPoint, radiusKm: Double): List<Partner>
}

interface ShopRequestRepository {
    fun observeRequests(): Flow<List<ShopRequest>>
    suspend fun submit(request: ShopRequest)
    suspend fun updateStatus(id: String, status: ShopRequestStatus)
}

interface FavouritesRepository {
    fun observeFavouriteIds(): Flow<Set<String>>
    suspend fun toggle(partnerId: String)
}

interface BookingRepository {
    fun observeCustomerBookings(customerId: String): Flow<List<Booking>>
    fun observePartnerBookings(partnerId: String): Flow<List<Booking>>
    fun observeRiderBookings(riderId: String): Flow<List<Booking>>
    fun observeAllBookings(): Flow<List<Booking>>
    fun observeBooking(id: String): Flow<Booking?>
    /** Number of active bookings per slot id for a partner on a day. */
    suspend fun bookedCounts(partnerId: String, epochDay: Long): Map<String, Int>
    suspend fun create(booking: Booking): Result<Booking>
    /** Replaces the whole booking (callers apply domain rules first via BookingActions). */
    suspend fun update(booking: Booking): Result<Booking>
}

interface RiderRepository {
    fun observeRiders(): Flow<List<Rider>>
}

/** Uploads a local photo and returns a durable URI (demo: returns the local URI). */
interface PhotoUploader {
    suspend fun upload(localUri: String, path: String): String
}

interface PushTokenRepository {
    suspend fun saveToken(userId: String, token: String)
}

interface SettingsRepository {
    fun observeNotificationPromptShown(): Flow<Boolean>
    suspend fun setNotificationPromptShown()
    fun observeRoleSwitcherUnlocked(): Flow<Boolean>
    suspend fun setRoleSwitcherUnlocked(unlocked: Boolean)
}

/** Posts a user-visible notification when a booking changes status (local notifications in demo). */
interface BookingNotifier {
    fun notifyStatus(booking: Booking)
}
