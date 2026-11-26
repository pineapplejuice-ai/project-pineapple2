package com.autobridge.app.feature.partner

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.core.domain.partner.PartnerCompatibility
import com.autobridge.core.domain.repository.*
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PartnerDetailUiState(
    val loading: Boolean = true,
    val partner: Partner? = null,
    val packages: List<ServicePackage> = emptyList(),
    val reviews: List<Review> = emptyList(),
    val isFavourite: Boolean = false,
    val distanceKm: Double? = null,
    val isOpenNow: Boolean = false,
    val vehicle: Vehicle? = null,
    val compatible: Boolean = true,
    val todayDayOfWeek: Int = 1,
)

@HiltViewModel
class PartnerDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    partners: PartnerRepository,
    vehicles: VehicleRepository,
    addresses: AddressRepository,
    private val favourites: FavouritesRepository,
    clock: Clock,
) : ViewModel() {
    private val partnerId: String = checkNotNull(savedState["partnerId"])

    private val vehicle = combine(vehicles.observeVehicles(), vehicles.observeSelectedVehicleId()) { l, id -> l.firstOrNull { it.id == id } ?: l.firstOrNull() }

    val state: StateFlow<PartnerDetailUiState> = combine(
        partners.observePartners().map { l -> l.firstOrNull { it.id == partnerId } },
        partners.observePackages().map { l -> l.filter { it.partnerId == partnerId } },
        partners.observeReviews(partnerId).catch { emit(emptyList()) },
        combine(favourites.observeFavouriteIds(), vehicle, addresses.observeCurrentLocation()) { f, v, l -> Triple(f, v, l) },
    ) { p, pkgs, reviews, (fav, v, loc) ->
        PartnerDetailUiState(
            loading = false,
            partner = p,
            // Packages for the selected vehicle's type first; others are hidden to avoid booking the wrong one.
            packages = pkgs.filter { v == null || it.vehicleType == v.type }.sortedWith(compareByDescending<ServicePackage> { it.popular }.thenBy { it.price }),
            reviews = reviews,
            isFavourite = partnerId in fav,
            distanceKm = p?.let { (loc?.point ?: GeoPoint.BENGALURU).distanceKmTo(it.location) },
            isOpenNow = p?.hours?.isOpenAt(clock.dayOfWeek(), clock.minuteOfDay()) == true,
            vehicle = v,
            compatible = p == null || v == null || PartnerCompatibility.isCompatible(p, v),
            todayDayOfWeek = clock.dayOfWeek(),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PartnerDetailUiState())

    fun toggleFavourite() = viewModelScope.launch { favourites.toggle(partnerId) }
}
