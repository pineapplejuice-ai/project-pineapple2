package com.autobridge.app.feature.favourites

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.autobridge.app.R
import com.autobridge.app.core.ui.components.*
import com.autobridge.core.domain.partner.PartnerFilter
import com.autobridge.core.domain.partner.PartnerSearch
import com.autobridge.core.domain.partner.RankedPartner
import com.autobridge.core.domain.repository.*
import com.autobridge.core.model.GeoPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FavouritesUiState(val loading: Boolean = true, val partners: List<RankedPartner> = emptyList())

@HiltViewModel
class FavouritesViewModel @Inject constructor(
    partners: PartnerRepository,
    addresses: AddressRepository,
    private val favourites: FavouritesRepository,
    search: PartnerSearch,
    clock: Clock,
) : ViewModel() {
    val state: StateFlow<FavouritesUiState> = combine(
        partners.observePartners(), partners.observePackages(), favourites.observeFavouriteIds(), addresses.observeCurrentLocation(),
    ) { p, k, fav, loc ->
        // Reuse PartnerSearch for distance/open-now; no radius or compatibility limits for favourites.
        val filter = PartnerFilter(radiusKm = Double.MAX_VALUE, brandCompatibleOnly = false)
        FavouritesUiState(false, search.search(p.filter { it.id in fav }, k, filter, loc?.point ?: GeoPoint.BENGALURU, clock.dayOfWeek(), clock.minuteOfDay()))
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), FavouritesUiState())

    fun toggle(id: String) = viewModelScope.launch { favourites.toggle(id) }
}

@Composable
fun FavouritesScreen(onBack: () -> Unit, onOpenPartner: (String) -> Unit, vm: FavouritesViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    Scaffold(topBar = { AppTopBar(stringResource(R.string.favourites_title), onBack) }) { p ->
        when {
            s.loading -> LoadingState(Modifier.padding(p))
            s.partners.isEmpty() -> EmptyState(Icons.Filled.FavoriteBorder, stringResource(R.string.favourites_empty_title), stringResource(R.string.favourites_empty_body), Modifier.padding(p))
            else -> LazyColumn(Modifier.padding(p)) {
                items(s.partners, key = { it.partner.id }) { rp -> PartnerListCard(rp, true, { vm.toggle(rp.partner.id) }, { onOpenPartner(rp.partner.id) }) }
            }
        }
    }
}
