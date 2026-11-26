@file:OptIn(ExperimentalMaterial3Api::class)

package com.autobridge.app.feature.vehicle

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autobridge.app.R
import com.autobridge.app.core.ui.*
import com.autobridge.app.core.ui.components.*
import com.autobridge.core.model.*

@Composable
fun VehiclesScreen(onBack: () -> Unit, onAddVehicle: () -> Unit, vm: VehiclesViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf<Vehicle?>(null) }
    Scaffold(
        topBar = { AppTopBar(stringResource(R.string.vehicles_title), onBack) },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = onAddVehicle, icon = { Icon(Icons.Filled.Add, null) }, text = { Text(stringResource(R.string.vehicle_add)) })
        },
    ) { p ->
        when {
            s.loading -> LoadingState(Modifier.padding(p))
            s.vehicles.isEmpty() -> EmptyState(Icons.Filled.DirectionsCar, stringResource(R.string.vehicles_empty_title), stringResource(R.string.vehicles_empty_body), Modifier.padding(p), stringResource(R.string.vehicle_add), onAddVehicle)
            else -> LazyColumn(Modifier.padding(p), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(s.vehicles, key = { it.id }) { v ->
                    VehicleRow(v, selected = v.id == s.selectedId, onClick = { vm.select(v.id) }, onDelete = { confirmDelete = v })
                }
            }
        }
    }
    confirmDelete?.let { v ->
        ConfirmDialog(stringResource(R.string.vehicle_delete_title), v.displayName, stringResource(R.string.delete), { vm.delete(v.id); confirmDelete = null }, { confirmDelete = null })
    }
}

@Composable
private fun VehicleRow(v: Vehicle, selected: Boolean, onClick: () -> Unit, onDelete: () -> Unit) {
    OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(vehicleTypeIcon(v.type), null)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(v.displayName, fontWeight = FontWeight.SemiBold)
                Text("${v.displayRegistration} · ${stringResource(fuelLabel(v.fuel))} · ${v.year}", style = MaterialTheme.typography.bodySmall)
                if (selected) InfoPill(stringResource(R.string.vehicle_selected))
            }
            IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, stringResource(R.string.delete)) }
        }
    }
}

@Composable
fun AddVehicleScreen(onBack: () -> Unit, onSaved: () -> Unit, vm: AddVehicleViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.saved) { if (s.saved) onSaved() }
    val goBack = { if (!vm.back()) onBack() }
    BackHandler { goBack() }
    Scaffold(topBar = { AppTopBar(stringResource(R.string.vehicle_add), goBack) }) { p ->
        Column(Modifier.padding(p).fillMaxSize()) {
            LinearProgressIndicator(progress = { (s.step.ordinal + 1f) / AddVehicleStep.entries.size }, modifier = Modifier.fillMaxWidth())
            when {
                s.loadError -> ErrorState(null, vm::load)
                s.catalogue == null -> LoadingState()
                else -> when (s.step) {
                    AddVehicleStep.TYPE -> TypeStep(vm::selectType)
                    AddVehicleStep.BRAND -> SearchList(
                        title = stringResource(R.string.vehicle_pick_brand), query = s.brandQuery, onQuery = vm::onBrandQuery,
                        items = s.brands, label = { it.name }, sub = { if (it.evOnly) stringResource(R.string.vehicle_ev_brand) else null },
                        onPick = vm::selectBrand, tag = "brand",
                    )
                    AddVehicleStep.MODEL -> SearchList(
                        title = stringResource(R.string.vehicle_pick_model, s.brand?.name.orEmpty()), query = s.modelQuery, onQuery = vm::onModelQuery,
                        items = s.models, label = { it.name }, sub = { m -> m.fuels.map { stringResource(fuelLabel(it)) }.joinToString(" · ") },
                        onPick = vm::selectModel, tag = "model",
                    )
                    AddVehicleStep.FUEL -> FuelStep(s.model?.fuels.orEmpty(), vm::selectFuel)
                    AddVehicleStep.DETAILS -> DetailsStep(s, vm)
                }
            }
        }
    }
}

@Composable
private fun TypeStep(onPick: (VehicleType) -> Unit) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.vehicle_pick_type), style = MaterialTheme.typography.titleLarge)
        VehicleType.entries.forEach { t ->
            OutlinedCard(onClick = { onPick(t) }, modifier = Modifier.fillMaxWidth().testTag("type_${t.name}")) {
                Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(vehicleTypeIcon(t), null, Modifier.size(32.dp))
                    Spacer(Modifier.width(16.dp))
                    Text(stringResource(vehicleTypeLabel(t)), style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}

@Composable
private fun <T> SearchList(
    title: String, query: String, onQuery: (String) -> Unit, items: List<T>, label: (T) -> String,
    sub: @Composable (T) -> String?, onPick: (T) -> Unit, tag: String,
) {
    Column(Modifier.fillMaxSize()) {
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
        OutlinedTextField(
            value = query, onValueChange = onQuery, singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            placeholder = { Text(stringResource(R.string.search)) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("${tag}_search"),
        )
        if (items.isEmpty()) EmptyState(Icons.Filled.Search, stringResource(R.string.no_matches), stringResource(R.string.no_matches_body))
        LazyColumn(Modifier.weight(1f)) {
            items(items) { item ->
                val subText = sub(item)
                ListItem(
                    headlineContent = { Text(label(item)) },
                    supportingContent = if (subText != null) { { Text(subText) } } else null,
                    modifier = Modifier.clickable(role = Role.Button) { onPick(item) }.testTag("${tag}_${label(item)}"),
                )
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun FuelStep(fuels: List<FuelType>, onPick: (FuelType) -> Unit) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.vehicle_pick_fuel), style = MaterialTheme.typography.titleLarge)
        fuels.forEach { f ->
            OutlinedButton(onClick = { onPick(f) }, modifier = Modifier.fillMaxWidth().testTag("fuel_${f.name}")) { Text(stringResource(fuelLabel(f))) }
        }
    }
}

@Composable
private fun DetailsStep(s: AddVehicleUiState, vm: AddVehicleViewModel) {
    var showDatePicker by remember { mutableStateOf(false) }
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("${s.brand?.name} ${s.model?.name} · ${s.fuel?.let { stringResource(fuelLabel(it)) }}", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = s.registration, onValueChange = vm::onRegistration, singleLine = true,
            label = { Text(stringResource(R.string.vehicle_reg)) },
            placeholder = { Text("KA 01 AB 1234") },
            isError = s.registration.isNotEmpty() && s.registrationError != null || (s.showErrors && s.registrationError != null),
            supportingText = {
                val e = s.registrationError
                if (e != null && (s.registration.length >= 6 || s.showErrors)) Text(stringResource(registrationError(e)))
                else Text(stringResource(R.string.vehicle_reg_hint))
            },
            modifier = Modifier.fillMaxWidth().testTag("reg_input"),
        )
        OutlinedTextField(
            value = s.year, onValueChange = vm::onYear, singleLine = true,
            label = { Text(stringResource(R.string.vehicle_year)) },
            isError = s.showErrors && !s.yearValid,
            supportingText = { if (s.showErrors && !s.yearValid) Text(stringResource(R.string.vehicle_year_error, s.currentYear)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth().testTag("year_input"),
        )
        OutlinedTextField(
            value = s.km, onValueChange = vm::onKm, singleLine = true,
            label = { Text(stringResource(R.string.vehicle_km)) },
            isError = s.showErrors && !s.kmValid,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth().testTag("km_input"),
        )
        OutlinedButton(onClick = { showDatePicker = true }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Event, null)
            Spacer(Modifier.width(8.dp))
            Text(s.lastServiceEpochDay?.let { stringResource(R.string.vehicle_last_service_value, epochDayLabel(it)) } ?: stringResource(R.string.vehicle_last_service))
        }
        if (s.showErrors && !s.lastServiceValid) Text(stringResource(R.string.vehicle_last_service_error), color = MaterialTheme.colorScheme.error)
        Button(onClick = vm::save, enabled = !s.saving, modifier = Modifier.fillMaxWidth().testTag("save_vehicle")) { Text(stringResource(R.string.vehicle_save)) }
    }
    if (showDatePicker) {
        val dp = rememberDatePickerState(initialSelectedDateMillis = s.lastServiceEpochDay?.let { it * 86_400_000L })
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = { vm.onLastService(dp.selectedDateMillis?.let { it / 86_400_000L }); showDatePicker = false }) { Text(stringResource(R.string.done)) }
            },
            dismissButton = { TextButton(onClick = { vm.onLastService(null); showDatePicker = false }) { Text(stringResource(R.string.clear)) } },
        ) { DatePicker(state = dp) }
    }
}
