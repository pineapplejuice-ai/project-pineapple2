package com.autobridge.app.feature.vehicle

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.core.data.Ids
import com.autobridge.core.domain.repository.Clock
import com.autobridge.core.domain.repository.VehicleCatalogueRepository
import com.autobridge.core.domain.repository.VehicleRepository
import com.autobridge.core.domain.vehicle.VehicleValidation
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

enum class AddVehicleStep { TYPE, BRAND, MODEL, FUEL, DETAILS }

data class AddVehicleUiState(
    val step: AddVehicleStep = AddVehicleStep.TYPE,
    val catalogue: VehicleCatalogue? = null,
    val loadError: Boolean = false,
    val type: VehicleType? = null,
    val brandQuery: String = "",
    val brand: Brand? = null,
    val modelQuery: String = "",
    val model: VehicleModel? = null,
    val fuel: FuelType? = null,
    val registration: String = "",
    val registrationError: RegistrationNumber.Reason? = null,
    val year: String = "",
    val km: String = "",
    val lastServiceEpochDay: Long? = null,
    val showErrors: Boolean = false,
    val saving: Boolean = false,
    val saved: Boolean = false,
    val currentYear: Int = LocalDate.now().year,
    val todayEpochDay: Long = LocalDate.now().toEpochDay(),
) {
    val brands: List<Brand>
        get() = catalogue?.brandsFor(type ?: VehicleType.CAR).orEmpty()
            .filter { brandQuery.isBlank() || it.name.contains(brandQuery.trim(), ignoreCase = true) }
    val models: List<VehicleModel>
        get() = brand?.models.orEmpty().filter { modelQuery.isBlank() || it.name.contains(modelQuery.trim(), ignoreCase = true) }
    val yearValid: Boolean get() = VehicleValidation.isValidYear(year.toIntOrNull(), currentYear)
    val kmValid: Boolean get() = VehicleValidation.isValidKm(km.toIntOrNull())
    val lastServiceValid: Boolean
        get() = VehicleValidation.isValidLastService(
            lastServiceEpochDay, todayEpochDay,
            LocalDate.of(year.toIntOrNull()?.coerceIn(VehicleValidation.MIN_YEAR, currentYear) ?: VehicleValidation.MIN_YEAR, 1, 1).toEpochDay(),
        )
    val detailsValid: Boolean get() = RegistrationNumber.isValid(registration) && yearValid && kmValid && lastServiceValid
}

@HiltViewModel
class AddVehicleViewModel @Inject constructor(
    private val catalogueRepo: VehicleCatalogueRepository,
    private val vehicles: VehicleRepository,
    clock: Clock,
) : ViewModel() {
    private val _state = MutableStateFlow(AddVehicleUiState(todayEpochDay = clock.todayEpochDay()))
    val state: StateFlow<AddVehicleUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            runCatching { catalogueRepo.catalogue() }
                .onSuccess { c -> _state.update { it.copy(catalogue = c, loadError = false) } }
                .onFailure { _state.update { it.copy(loadError = true) } }
        }
    }

    fun selectType(t: VehicleType) = _state.update { it.copy(type = t, brand = null, model = null, fuel = null, brandQuery = "", step = AddVehicleStep.BRAND) }
    fun onBrandQuery(q: String) = _state.update { it.copy(brandQuery = q) }
    fun selectBrand(b: Brand) = _state.update { it.copy(brand = b, model = null, fuel = null, modelQuery = "", step = AddVehicleStep.MODEL) }
    fun onModelQuery(q: String) = _state.update { it.copy(modelQuery = q) }

    fun selectModel(m: VehicleModel) = _state.update {
        // Single-fuel models skip the fuel step.
        if (m.fuels.size == 1) it.copy(model = m, fuel = m.fuels.first(), step = AddVehicleStep.DETAILS)
        else it.copy(model = m, fuel = null, step = AddVehicleStep.FUEL)
    }

    fun selectFuel(f: FuelType) = _state.update { it.copy(fuel = f, step = AddVehicleStep.DETAILS) }

    fun onRegistration(v: String) = _state.update {
        val r = RegistrationNumber.validate(v)
        it.copy(registration = v.uppercase().take(16), registrationError = (r as? RegistrationNumber.Result.Invalid)?.reason)
    }
    fun onYear(v: String) = _state.update { it.copy(year = v.filter(Char::isDigit).take(4)) }
    fun onKm(v: String) = _state.update { it.copy(km = v.filter(Char::isDigit).take(6)) }
    fun onLastService(epochDay: Long?) = _state.update { it.copy(lastServiceEpochDay = epochDay) }

    /** Returns false when already at the first step (caller should close the screen). */
    fun back(): Boolean {
        val s = _state.value
        val prev = when (s.step) {
            AddVehicleStep.TYPE -> return false
            AddVehicleStep.BRAND -> AddVehicleStep.TYPE
            AddVehicleStep.MODEL -> AddVehicleStep.BRAND
            AddVehicleStep.FUEL -> AddVehicleStep.MODEL
            AddVehicleStep.DETAILS -> if ((s.model?.fuels?.size ?: 0) > 1) AddVehicleStep.FUEL else AddVehicleStep.MODEL
        }
        _state.update { it.copy(step = prev) }
        return true
    }

    fun save() {
        val s = _state.value
        if (!s.detailsValid) { _state.update { it.copy(showErrors = true, registrationError = (RegistrationNumber.validate(s.registration) as? RegistrationNumber.Result.Invalid)?.reason) }; return }
        val type = s.type ?: return
        val brand = s.brand ?: return
        val model = s.model ?: return
        val fuel = s.fuel ?: return
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            vehicles.addVehicle(
                Vehicle(
                    id = Ids.new(), type = type, brandId = brand.id, brandName = brand.name, modelId = model.id, modelName = model.name,
                    fuel = fuel, registrationNumber = RegistrationNumber.normalize(s.registration), year = s.year.toInt(),
                    kmDriven = s.km.toInt(), lastServiceEpochDay = s.lastServiceEpochDay,
                ),
            )
            _state.update { it.copy(saving = false, saved = true) }
        }
    }
}

data class VehiclesUiState(val loading: Boolean = true, val vehicles: List<Vehicle> = emptyList(), val selectedId: String? = null)

@HiltViewModel
class VehiclesViewModel @Inject constructor(private val repo: VehicleRepository) : ViewModel() {
    val state: StateFlow<VehiclesUiState> = combine(repo.observeVehicles(), repo.observeSelectedVehicleId()) { v, sel ->
        VehiclesUiState(false, v, sel)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), VehiclesUiState())

    fun select(id: String) = viewModelScope.launch { repo.selectVehicle(id) }
    fun delete(id: String) = viewModelScope.launch { repo.deleteVehicle(id) }
}
