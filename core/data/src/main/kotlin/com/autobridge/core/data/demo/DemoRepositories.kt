package com.autobridge.core.data.demo

import com.autobridge.core.data.Ids
import com.autobridge.core.data.StoredValue
import com.autobridge.core.domain.booking.BookingActions
import com.autobridge.core.domain.repository.*
import com.autobridge.core.model.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.SetSerializer
import kotlinx.serialization.builtins.serializer

/** Demo phone auth: any 10-digit number, OTP is always 123456. */
class DemoAuthRepository(store: KeyValueStore) : AuthRepository {
    private val stored = StoredValue(store, "demo.user", UserProfile.serializer())
    private var pendingPhone: String? = null
    private val _user = MutableStateFlow(stored.read())
    override val currentUser: StateFlow<UserProfile?> = _user.asStateFlow()
    override val isDemo = true

    override suspend fun sendOtp(phone: String): OtpResult {
        val digits = phone.filter { it.isDigit() }.takeLast(10)
        if (digits.length != 10) return OtpResult.Error("Enter a valid 10-digit mobile number")
        pendingPhone = "+91$digits"
        return OtpResult.CodeSent
    }

    override suspend fun verifyOtp(code: String): Result<UserProfile> {
        val phone = pendingPhone ?: return Result.failure(IllegalStateException("Request an OTP first"))
        if (code != DemoData.DEMO_OTP) return Result.failure(IllegalArgumentException("Incorrect OTP. In demo mode use ${DemoData.DEMO_OTP}"))
        val user = stored.read()?.copy(phone = phone) ?: UserProfile(DemoData.DEMO_USER_ID, phone)
        set(user)
        return Result.success(user)
    }

    override suspend fun updateName(name: String) { _user.value?.let { set(it.copy(name = name.trim())) } }
    override suspend fun signOut() { stored.write(null); _user.value = null }

    override suspend fun setDemoRole(role: UserRole) {
        val u = _user.value ?: return
        set(u.copy(
            role = role,
            partnerId = if (role == UserRole.PARTNER) DemoData.DEMO_PARTNER_ID else null,
            riderId = if (role == UserRole.RIDER) DemoData.DEMO_RIDER_ID else null,
        ))
    }

    private fun set(u: UserProfile) { stored.write(u); _user.value = u }
}

class DemoVehicleRepository(store: KeyValueStore, clock: Clock) : VehicleRepository {
    private val stored = StoredValue(store, "demo.vehicles", ListSerializer(Vehicle.serializer()))
    private val selected = StoredValue(store, "demo.selectedVehicle", String.serializer())
    private val vehicles = MutableStateFlow(stored.read() ?: DemoData.seedVehicles(clock.todayEpochDay()).also { stored.write(it) })
    private val selectedId = MutableStateFlow(selected.read() ?: vehicles.value.firstOrNull()?.id)

    override fun observeVehicles(): Flow<List<Vehicle>> = vehicles
    override fun observeSelectedVehicleId(): Flow<String?> = selectedId
    override suspend fun addVehicle(vehicle: Vehicle) {
        vehicles.update { list -> (list.filterNot { it.id == vehicle.id } + vehicle).also { stored.write(it) } }
        selectVehicle(vehicle.id)
    }
    override suspend fun deleteVehicle(id: String) {
        vehicles.update { list -> list.filterNot { it.id == id }.also { stored.write(it) } }
        if (selectedId.value == id) vehicles.value.firstOrNull()?.let { selectVehicle(it.id) } ?: run { selectedId.value = null; selected.write(null) }
    }
    override suspend fun selectVehicle(id: String) { selectedId.value = id; selected.write(id) }
}

class DemoAddressRepository(store: KeyValueStore) : AddressRepository {
    private val stored = StoredValue(store, "demo.addresses", ListSerializer(SavedAddress.serializer()))
    private val storedLocation = StoredValue(store, "demo.location", UserLocation.serializer())
    private val addresses = MutableStateFlow(stored.read() ?: DemoData.seedAddresses().also { stored.write(it) })
    private val location = MutableStateFlow(storedLocation.read() ?: addresses.value.firstOrNull()?.let {
        UserLocation(it.location, it.label.name.lowercase().replaceFirstChar { c -> c.uppercase() }, it.shortText, it.id)
    })

    override fun observeAddresses(): Flow<List<SavedAddress>> = addresses
    override fun observeCurrentLocation(): Flow<UserLocation?> = location
    override suspend fun saveAddress(address: SavedAddress) {
        addresses.update { l -> (l.filterNot { it.id == address.id } + address).also { stored.write(it) } }
    }
    override suspend fun deleteAddress(id: String) { addresses.update { l -> l.filterNot { it.id == id }.also { stored.write(it) } } }
    override suspend fun setCurrentLocation(location: UserLocation) { this.location.value = location; storedLocation.write(location) }
}

/** Demo GPS: always Koramangala, Bengaluru. */
class DemoLocationProvider : LocationProvider {
    override val isDemo = true
    override fun hasPermission() = true
    override suspend fun currentLocation(): LocationResult = LocationResult.Success(GeoPoint.BENGALURU)
}

class DemoPartnerRepository(store: KeyValueStore, private val clock: Clock) : PartnerRepository {
    private val storedPartners = StoredValue(store, "demo.partners.v1", ListSerializer(Partner.serializer()))
    private val storedPackages = StoredValue(store, "demo.packages.v1", ListSerializer(ServicePackage.serializer()))
    private val partners = MutableStateFlow(storedPartners.read() ?: DemoData.partners)
    private val packages = MutableStateFlow(storedPackages.read() ?: DemoData.packages)

    override fun observePartners(): Flow<List<Partner>> = partners
    override fun observePackages(): Flow<List<ServicePackage>> = packages
    override fun observeReviews(partnerId: String): Flow<List<Review>> = flowOf(DemoData.reviewsFor(partnerId, clock.nowMillis()))
    override suspend fun partner(id: String): Partner? = partners.value.firstOrNull { it.id == id }
    override suspend fun savePartner(partner: Partner) {
        partners.update { l -> l.map { if (it.id == partner.id) partner else it }.also { storedPartners.write(it) } }
    }
    override suspend fun savePackage(pkg: ServicePackage) {
        packages.update { l -> (if (l.any { it.id == pkg.id }) l.map { if (it.id == pkg.id) pkg else it } else l + pkg).also { storedPackages.write(it) } }
    }
    override suspend fun deletePackage(id: String) { packages.update { l -> l.filterNot { it.id == id }.also { storedPackages.write(it) } } }
}

/** Places suggestions are never faked: in demo mode this is simply disabled. */
class DisabledPlacesSuggestionRepository : PlacesSuggestionRepository {
    override val isEnabled = false
    override suspend fun nearby(category: PartnerCategory?, near: GeoPoint, radiusKm: Double): List<Partner> = emptyList()
}

class DemoShopRequestRepository(store: KeyValueStore) : ShopRequestRepository {
    private val stored = StoredValue(store, "demo.shopRequests", ListSerializer(ShopRequest.serializer()))
    private val requests = MutableStateFlow(stored.read() ?: emptyList())
    override fun observeRequests(): Flow<List<ShopRequest>> = requests
    override suspend fun submit(request: ShopRequest) { requests.update { (it + request).also(stored::write) } }
    override suspend fun updateStatus(id: String, status: ShopRequestStatus) {
        requests.update { l -> l.map { if (it.id == id) it.copy(status = status) else it }.also(stored::write) }
    }
}

class DemoFavouritesRepository(store: KeyValueStore) : FavouritesRepository {
    private val stored = StoredValue(store, "demo.favourites", SetSerializer(String.serializer()))
    private val ids = MutableStateFlow(stored.read() ?: emptySet())
    override fun observeFavouriteIds(): Flow<Set<String>> = ids
    override suspend fun toggle(partnerId: String) {
        ids.update { (if (partnerId in it) it - partnerId else it + partnerId).also(stored::write) }
    }
}

class DemoRiderRepository : RiderRepository {
    override fun observeRiders(): Flow<List<Rider>> = flowOf(DemoData.riders)
}

class DemoSettingsRepository(store: KeyValueStore) : SettingsRepository {
    private val promptStored = StoredValue(store, "settings.notifPrompt", Boolean.serializer())
    private val roleStored = StoredValue(store, "settings.roleSwitcher", Boolean.serializer())
    private val prompt = MutableStateFlow(promptStored.read() ?: false)
    private val role = MutableStateFlow(roleStored.read() ?: false)
    override fun observeNotificationPromptShown(): Flow<Boolean> = prompt
    override suspend fun setNotificationPromptShown() { prompt.value = true; promptStored.write(true) }
    override fun observeRoleSwitcherUnlocked(): Flow<Boolean> = role
    override suspend fun setRoleSwitcherUnlocked(unlocked: Boolean) { role.value = unlocked; roleStored.write(unlocked) }
}

class PassThroughPhotoUploader : PhotoUploader {
    override suspend fun upload(localUri: String, path: String): String = localUri
}

class NoOpPushTokenRepository : PushTokenRepository {
    override suspend fun saveToken(userId: String, token: String) = Unit
}

/**
 * In-memory bookings persisted to the KeyValueStore. To make the demo feel alive, new bookings are auto-confirmed
 * by the (demo) partner after a few seconds and a demo rider is assigned shortly after, unless the demo partner
 * account (role mode) is the one handling the booking.
 */
class DemoBookingRepository(
    store: KeyValueStore,
    private val clock: Clock,
    private val actions: BookingActions,
    private val scope: CoroutineScope,
    private val autoAdvanceDelayMs: Long = 4_000,
) : BookingRepository {
    private val stored = StoredValue(store, "demo.bookings.v1", ListSerializer(Booking.serializer()))
    private val bookings = MutableStateFlow(stored.read() ?: DemoSeedBookings.create(clock).also { stored.write(it) })

    override fun observeCustomerBookings(customerId: String): Flow<List<Booking>> =
        bookings.map { l -> l.filter { it.customerId == customerId }.sortedByDescending { it.createdAtMillis } }
    override fun observePartnerBookings(partnerId: String): Flow<List<Booking>> =
        bookings.map { l -> l.filter { it.partner.partnerId == partnerId }.sortedByDescending { it.createdAtMillis } }
    override fun observeRiderBookings(riderId: String): Flow<List<Booking>> =
        bookings.map { l -> l.filter { it.riderId == riderId }.sortedBy { it.slot.epochDay * 100 + (it.slot.slot?.startHour ?: 0) } }
    override fun observeAllBookings(): Flow<List<Booking>> = bookings.map { l -> l.sortedByDescending { it.createdAtMillis } }
    override fun observeBooking(id: String): Flow<Booking?> = bookings.map { l -> l.firstOrNull { it.id == id } }

    override suspend fun bookedCounts(partnerId: String, epochDay: Long): Map<String, Int> {
        val partner = DemoData.partners.firstOrNull { it.id == partnerId }
        val capacity = partner?.slotCapacity ?: 3
        val real = bookings.value.filter { it.partner.partnerId == partnerId && it.slot.epochDay == epochDay && it.isActive }
            .groupingBy { it.slot.slotId }.eachCount()
        // Deterministic "busy" slots so the demo shows greyed-out full slots.
        return TimeSlot.ALL.associate { s ->
            val busy = ((partnerId.hashCode() * 31 + epochDay.toInt() * 7 + s.startHour) and 0x7fffffff) % 5 == 0
            s.id to ((real[s.id] ?: 0) + if (busy) capacity else 0)
        }
    }

    override suspend fun create(booking: Booking): Result<Booking> {
        val b = if (bookings.value.any { it.id == booking.id }) booking.copy(id = Ids.bookingRef()) else booking
        mutate { it + b }
        if (b.partner.partnerId != DemoData.DEMO_PARTNER_ID) scope.launch { autoAdvance(b.id) }
        return Result.success(b)
    }

    override suspend fun update(booking: Booking): Result<Booking> {
        mutate { l -> l.map { if (it.id == booking.id) booking else it } }
        return Result.success(booking)
    }

    private suspend fun autoAdvance(id: String) {
        delay(autoAdvanceDelayMs)
        current(id)?.takeIf { it.status == BookingStatus.REQUESTED }?.let { b ->
            actions.transition(b, BookingStatus.CONFIRMED, Actor.SYSTEM, clock.nowMillis(), "Auto-confirmed (demo)")?.let { update(it) }
        }
        delay(autoAdvanceDelayMs)
        current(id)?.takeIf { it.status == BookingStatus.CONFIRMED && it.tripType != TripType.DROP_ONLY }?.let { b ->
            actions.assignRider(b, DemoData.riders.first(), clock.nowMillis())?.let { update(it) }
        }
    }

    private fun current(id: String) = bookings.value.firstOrNull { it.id == id }
    private fun mutate(f: (List<Booking>) -> List<Booking>) { bookings.update { f(it).also(stored::write) } }
}
