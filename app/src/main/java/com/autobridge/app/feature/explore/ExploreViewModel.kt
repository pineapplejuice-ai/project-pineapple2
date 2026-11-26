package com.autobridge.app.feature.explore

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.core.data.Ids
import com.autobridge.core.domain.partner.*
import com.autobridge.core.domain.repository.*
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ExploreUiState(
    val loading: Boolean = true,
    val filter: PartnerFilter = PartnerFilter(),
    val results: List<RankedPartner> = emptyList(),
    val suggestions: List<RankedPartner> = emptyList(),
    val placesEnabled: Boolean = false,
    val requestedPlaceIds: Set<String> = emptySet(),
    val favouriteIds: Set<String> = emptySet(),
    val vehicle: Vehicle? = null,
    val locationTitle: String? = null,
    val error: String? = null,
)

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class ExploreViewModel @Inject constructor(
    savedState: SavedStateHandle,
    partners: PartnerRepository,
    vehicles: VehicleRepository,
    addresses: AddressRepository,
    private val favourites: FavouritesRepository,
    private val places: PlacesSuggestionRepository,
    private val shopRequests: ShopRequestRepository,
    private val auth: AuthRepository,
    private val search: PartnerSearch,
    private val clock: Clock,
) : ViewModel() {
    private val initialCategory = savedState.get<String>("category")?.let { c -> PartnerCategory.entries.firstOrNull { it.name == c } }
    private val filter = MutableStateFlow(PartnerFilter(category = initialCategory))
    private val requested = MutableStateFlow<Set<String>>(emptySet())

    private val vehicle = combine(vehicles.observeVehicles(), vehicles.observeSelectedVehicleId()) { list, id -> list.firstOrNull { it.id == id } ?: list.firstOrNull() }
    private val location = addresses.observeCurrentLocation()

    private val suggestions: Flow<List<RankedPartner>> = combine(filter.debounce(400), location) { f, l -> f to l }
        .mapLatest { (f, l) ->
            if (!places.isEnabled) emptyList() else {
                val near = l?.point ?: GeoPoint.BENGALURU
                places.nearby(f.category, near, f.radiusKm).map { p ->
                    RankedPartner(p, near.distanceKmTo(p.location), isOpenNow = false, bayesianRating = 0.0, score = 0.0)
                }.sortedBy { it.distanceKm }
            }
        }.onStart { emit(emptyList()) }

    val state: StateFlow<ExploreUiState> = combine(
        combine(filter, vehicle, location) { f, v, l -> Triple(f, v, l) },
        combine(partners.observePartners(), partners.observePackages()) { p, k -> p to k },
        favourites.observeFavouriteIds(),
        suggestions,
        requested,
    ) { (f, v, l), (p, k), fav, sugg, req ->
        val effective = f.copy(vehicle = v, vehicleType = v?.type)
        val results = search.search(p.filter { it.canTakeBookings }, k, effective, l?.point ?: GeoPoint.BENGALURU, clock.dayOfWeek(), clock.minuteOfDay())
        // Hide Places suggestions that are already AutoBridge partners (same placeId) or match the query poorly.
        val partnerPlaceIds = p.mapNotNull { it.placeId }.toSet()
        val q = f.query.trim()
        ExploreUiState(
            loading = false, filter = f, results = results,
            suggestions = sugg.filter { it.partner.placeId !in partnerPlaceIds && (q.isEmpty() || it.partner.name.contains(q, ignoreCase = true)) },
            placesEnabled = places.isEnabled, requestedPlaceIds = req, favouriteIds = fav, vehicle = v, locationTitle = l?.title,
        )
    }.catch { e -> emit(ExploreUiState(loading = false, error = e.message)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ExploreUiState(filter = PartnerFilter(category = initialCategory)))

    fun onQuery(q: String) = filter.update { it.copy(query = q) }
    fun onCategory(c: PartnerCategory?) = filter.update { it.copy(category = c) }
    fun onRadius(r: Double) = filter.update { it.copy(radiusKm = r) }
    fun onSort(s: PartnerSort) = filter.update { it.copy(sort = s) }
    fun toggleOpenNow() = filter.update { it.copy(openNowOnly = !it.openNowOnly) }
    fun toggleVerified() = filter.update { it.copy(verifiedOnly = !it.verifiedOnly) }
    fun toggleBrandCompatible() = filter.update { it.copy(brandCompatibleOnly = !it.brandCompatibleOnly) }
    fun toggleFavourite(id: String) = viewModelScope.launch { favourites.toggle(id) }

    /** "Request this shop": creates a lead for ops to onboard the shop. */
    fun requestShop(p: Partner) {
        val placeId = p.placeId ?: p.id
        if (placeId in requested.value) return
        requested.update { it + placeId }
        viewModelScope.launch {
            shopRequests.submit(
                ShopRequest(Ids.new(), p.placeId, p.name, p.address, p.primaryCategory, auth.currentUser.value?.id.orEmpty(), clock.nowMillis()),
            )
        }
    }
}
