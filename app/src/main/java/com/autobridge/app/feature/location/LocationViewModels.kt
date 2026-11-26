package com.autobridge.app.feature.location

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.core.data.Ids
import com.autobridge.core.domain.repository.AddressRepository
import com.autobridge.core.domain.repository.LocationProvider
import com.autobridge.core.domain.repository.LocationResult
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Quick-pick localities used when GPS isn't available (and as the demo "map"). */
val QUICK_LOCALITIES = listOf(
    "Koramangala" to GeoPoint(12.9352, 77.6245), "Indiranagar" to GeoPoint(12.9719, 77.6412),
    "HSR Layout" to GeoPoint(12.9116, 77.6474), "Whitefield" to GeoPoint(12.9698, 77.7500),
    "Jayanagar" to GeoPoint(12.9250, 77.5938), "Hebbal" to GeoPoint(13.0358, 77.5970),
    "Electronic City" to GeoPoint(12.8452, 77.6602), "Malleshwaram" to GeoPoint(13.0031, 77.5643),
)

enum class LocateStatus { IDLE, LOCATING, DENIED, UNAVAILABLE }

data class LocationUiState(
    val addresses: List<SavedAddress> = emptyList(),
    val current: UserLocation? = null,
    val locate: LocateStatus = LocateStatus.IDLE,
    val needsPermission: Boolean = false,
)

/** Saved addresses + the Home location chip / picker sheet. */
@HiltViewModel
class LocationViewModel @Inject constructor(
    private val repo: AddressRepository,
    private val provider: LocationProvider,
) : ViewModel() {
    private val locate = MutableStateFlow(LocateStatus.IDLE)
    val state: StateFlow<LocationUiState> = combine(repo.observeAddresses(), repo.observeCurrentLocation(), locate) { a, c, l ->
        LocationUiState(a, c, l, needsPermission = !provider.hasPermission())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LocationUiState())

    fun useAddress(a: SavedAddress, title: String) = viewModelScope.launch {
        repo.setCurrentLocation(UserLocation(a.location, title, a.shortText, a.id))
    }

    fun useLocality(name: String, point: GeoPoint) = viewModelScope.launch { repo.setCurrentLocation(UserLocation(point, name)) }

    /** Call after the permission dialog (or directly if already granted). */
    fun useCurrentLocation(title: String) {
        locate.value = LocateStatus.LOCATING
        viewModelScope.launch {
            locate.value = when (val r = provider.currentLocation()) {
                is LocationResult.Success -> {
                    repo.setCurrentLocation(UserLocation(r.point, title, "%.4f, %.4f".format(r.point.lat, r.point.lng)))
                    LocateStatus.IDLE
                }
                LocationResult.PermissionDenied -> LocateStatus.DENIED
                LocationResult.Unavailable -> LocateStatus.UNAVAILABLE
            }
        }
    }

    fun permissionDenied() { locate.value = LocateStatus.DENIED }
    fun delete(id: String) = viewModelScope.launch { repo.deleteAddress(id) }
}

data class AddAddressUiState(
    val label: AddressLabel = AddressLabel.HOME,
    val customLabel: String = "",
    val line1: String = "",
    val area: String = "",
    val landmark: String = "",
    val point: GeoPoint? = null,
    val pointLabel: String = "",
    val locate: LocateStatus = LocateStatus.IDLE,
    val showErrors: Boolean = false,
    val saved: Boolean = false,
) {
    val isValid: Boolean get() = line1.isNotBlank() && area.isNotBlank() && point != null
}

@HiltViewModel
class AddAddressViewModel @Inject constructor(
    private val repo: AddressRepository,
    private val provider: LocationProvider,
) : ViewModel() {
    private val _state = MutableStateFlow(AddAddressUiState())
    val state: StateFlow<AddAddressUiState> = _state.asStateFlow()
    val needsPermission: Boolean get() = !provider.hasPermission()

    fun onLabel(l: AddressLabel) = _state.update { it.copy(label = l) }
    fun onCustomLabel(v: String) = _state.update { it.copy(customLabel = v.take(30)) }
    fun onLine1(v: String) = _state.update { it.copy(line1 = v.take(120)) }
    fun onArea(v: String) = _state.update { it.copy(area = v.take(60)) }
    fun onLandmark(v: String) = _state.update { it.copy(landmark = v.take(60)) }
    fun onLocality(name: String, p: GeoPoint) = _state.update { it.copy(point = p, pointLabel = name, area = it.area.ifBlank { name }) }
    fun permissionDenied() = _state.update { it.copy(locate = LocateStatus.DENIED) }

    fun locate() {
        _state.update { it.copy(locate = LocateStatus.LOCATING) }
        viewModelScope.launch {
            when (val r = provider.currentLocation()) {
                is LocationResult.Success -> _state.update { it.copy(point = r.point, pointLabel = "%.4f, %.4f".format(r.point.lat, r.point.lng), locate = LocateStatus.IDLE) }
                LocationResult.PermissionDenied -> _state.update { it.copy(locate = LocateStatus.DENIED) }
                LocationResult.Unavailable -> _state.update { it.copy(locate = LocateStatus.UNAVAILABLE) }
            }
        }
    }

    fun save() {
        val s = _state.value
        if (!s.isValid) { _state.update { it.copy(showErrors = true) }; return }
        viewModelScope.launch {
            repo.saveAddress(SavedAddress(Ids.new(), s.label, s.line1.trim(), s.area.trim(), s.landmark.trim(), s.point!!, s.customLabel.trim()))
            _state.update { it.copy(saved = true) }
        }
    }
}
