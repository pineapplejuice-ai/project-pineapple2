package com.autobridge.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.app.core.di.AppConfig
import com.autobridge.core.domain.partner.PartnerFilter
import com.autobridge.core.domain.partner.PartnerSearch
import com.autobridge.core.domain.partner.RankedPartner
import com.autobridge.core.domain.repository.*
import com.autobridge.core.domain.vehicle.ServiceReminder
import com.autobridge.core.domain.vehicle.ServiceReminders
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PackageOffer(val pkg: ServicePackage, val partner: RankedPartner)

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val userName: String = "",
    val location: UserLocation? = null,
    val vehicles: List<Vehicle> = emptyList(),
    val selectedVehicle: Vehicle? = null,
    val reminder: ServiceReminder? = null,
    val bestNearYou: List<RankedPartner> = emptyList(),
    val bestDetailing: List<RankedPartner> = emptyList(),
    val brandCentres: List<RankedPartner> = emptyList(),
    val popularPackages: List<PackageOffer> = emptyList(),
    val ongoing: Booking? = null,
    val isDemo: Boolean = true,
    val favouriteIds: Set<String> = emptySet(),
)

private data class HomeInputs(
    val user: UserProfile?, val location: UserLocation?, val vehicles: List<Vehicle>, val selectedId: String?,
    val partners: List<Partner>, val packages: List<ServicePackage>, val bookings: List<Booking>, val favourites: Set<String>,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class HomeViewModel @Inject constructor(
    auth: AuthRepository,
    addresses: AddressRepository,
    private val vehicleRepo: VehicleRepository,
    partners: PartnerRepository,
    bookings: BookingRepository,
    private val favouritesRepo: FavouritesRepository,
    private val search: PartnerSearch,
    private val clock: Clock,
    config: AppConfig,
) : ViewModel() {
    private val retry = MutableStateFlow(0)

    private val userBookings = auth.currentUser.flatMapLatest { u -> if (u == null) flowOf(emptyList()) else bookings.observeCustomerBookings(u.id) }

    private val inputs = retry.flatMapLatest {
        combine(
            combine(auth.currentUser, addresses.observeCurrentLocation(), vehicleRepo.observeVehicles(), vehicleRepo.observeSelectedVehicleId()) { u, l, v, s -> listOf(u, l, v, s) },
            combine(partners.observePartners(), partners.observePackages(), userBookings, favouritesRepo.observeFavouriteIds()) { p, k, b, f -> listOf(p, k, b, f) },
        ) { a, b ->
            @Suppress("UNCHECKED_CAST")
            HomeInputs(a[0] as UserProfile?, a[1] as UserLocation?, a[2] as List<Vehicle>, a[3] as String?, b[0] as List<Partner>, b[1] as List<ServicePackage>, b[2] as List<Booking>, b[3] as Set<String>)
        }
    }

    val state: StateFlow<HomeUiState> = inputs.map { i -> build(i, config.isDemo) }
        .catch { e -> emit(HomeUiState(loading = false, error = e.message, isDemo = config.isDemo)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState(isDemo = config.isDemo))

    private fun build(i: HomeInputs, isDemo: Boolean): HomeUiState {
        val vehicle = i.vehicles.firstOrNull { it.id == i.selectedId } ?: i.vehicles.firstOrNull()
        val near = i.location?.point ?: GeoPoint.BENGALURU
        val day = clock.dayOfWeek()
        val minute = clock.minuteOfDay()
        fun find(f: PartnerFilter) = search.search(i.partners.filter { it.canTakeBookings }, i.packages, f, near, day, minute)
        val base = PartnerFilter(vehicle = vehicle, vehicleType = vehicle?.type)
        val best = find(base)
        val brandCentres = if (vehicle == null) emptyList() else find(base.copy(category = PartnerCategory.AUTHORISED_SERVICE, radiusKm = 25.0))
            .filter { vehicle.brandId in it.partner.brandIds }
        val offers = best.take(10).flatMap { rp ->
            i.packages.filter { it.partnerId == rp.partner.id && it.popular && (vehicle == null || it.vehicleType == vehicle.type) }.map { PackageOffer(it, rp) }
        }.distinctBy { it.pkg.name }.take(8)
        return HomeUiState(
            loading = false,
            userName = i.user?.name.orEmpty(),
            location = i.location,
            vehicles = i.vehicles,
            selectedVehicle = vehicle,
            reminder = vehicle?.let { ServiceReminders.reminderFor(it, clock.todayEpochDay()) },
            bestNearYou = best.take(8),
            bestDetailing = find(base.copy(category = PartnerCategory.DETAILING)).take(8),
            brandCentres = brandCentres.take(5),
            popularPackages = offers,
            ongoing = i.bookings.firstOrNull { it.isActive },
            isDemo = isDemo,
            favouriteIds = i.favourites,
        )
    }

    fun selectVehicle(id: String) = viewModelScope.launch { vehicleRepo.selectVehicle(id) }
    fun toggleFavourite(id: String) = viewModelScope.launch { favouritesRepo.toggle(id) }
    fun retry() = retry.update { it + 1 }
}
