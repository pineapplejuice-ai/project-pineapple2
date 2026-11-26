@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.autobridge.app.feature.location

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autobridge.app.R
import com.autobridge.app.core.ui.addressIcon
import com.autobridge.app.core.ui.addressLabel
import com.autobridge.app.core.ui.components.*
import com.autobridge.core.model.AddressLabel
import com.autobridge.core.model.SavedAddress

private val LOCATION_PERMISSIONS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

/** Remembers a launcher that asks for location permission (only on tap) and then runs [onResult]. */
@Composable
fun rememberLocationPermissionRequest(onResult: (granted: Boolean) -> Unit) =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res -> onResult(res.values.any { it }) }

@Composable
fun addressTitle(a: SavedAddress): String = if (a.label == AddressLabel.OTHER && a.customLabel.isNotBlank()) a.customLabel else stringResource(addressLabel(a.label))

@Composable
private fun LocateStatusText(status: LocateStatus) {
    when (status) {
        LocateStatus.LOCATING -> LinearProgressIndicator(Modifier.fillMaxWidth())
        LocateStatus.DENIED -> Text(stringResource(R.string.location_denied), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        LocateStatus.UNAVAILABLE -> Text(stringResource(R.string.location_unavailable), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        LocateStatus.IDLE -> Unit
    }
}

/** Bottom sheet behind the Home location chip. */
@Composable
fun LocationPickerSheet(onDismiss: () -> Unit, onAddAddress: () -> Unit, vm: LocationViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val currentTitle = stringResource(R.string.location_current)
    val permission = rememberLocationPermissionRequest { granted -> if (granted) vm.useCurrentLocation(currentTitle) else vm.permissionDenied() }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Text(stringResource(R.string.location_choose), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(16.dp))
            ListItem(
                headlineContent = { Text(stringResource(R.string.location_use_current)) },
                supportingContent = { Text(stringResource(R.string.location_use_current_body)) },
                leadingContent = { Icon(Icons.Filled.MyLocation, null, tint = MaterialTheme.colorScheme.primary) },
                modifier = Modifier.clickable(role = Role.Button) {
                    if (s.needsPermission) permission.launch(LOCATION_PERMISSIONS) else vm.useCurrentLocation(currentTitle)
                },
            )
            Box(Modifier.padding(horizontal = 16.dp)) { LocateStatusText(s.locate) }
            HorizontalDivider()
            if (s.addresses.isNotEmpty()) SectionHeader(stringResource(R.string.location_saved))
            s.addresses.forEach { a ->
                val title = addressTitle(a)
                ListItem(
                    headlineContent = { Text(title) },
                    supportingContent = { Text(a.shortText) },
                    leadingContent = { Icon(addressIcon(a.label), null) },
                    trailingContent = { if (s.current?.addressId == a.id) Icon(Icons.Filled.Check, stringResource(R.string.selected)) },
                    modifier = Modifier.clickable(role = Role.Button) { vm.useAddress(a, title); onDismiss() },
                )
            }
            ListItem(
                headlineContent = { Text(stringResource(R.string.address_add)) },
                leadingContent = { Icon(Icons.Filled.AddLocation, null) },
                modifier = Modifier.clickable(role = Role.Button) { onDismiss(); onAddAddress() },
            )
            HorizontalDivider()
            SectionHeader(stringResource(R.string.location_localities))
            FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QUICK_LOCALITIES.forEach { (name, point) ->
                    AssistChip(onClick = { vm.useLocality(name, point); onDismiss() }, label = { Text(name) })
                }
            }
        }
    }
}

@Composable
fun AddressesScreen(onBack: () -> Unit, onAddAddress: () -> Unit, vm: LocationViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    Scaffold(
        topBar = { AppTopBar(stringResource(R.string.addresses_title), onBack) },
        floatingActionButton = { ExtendedFloatingActionButton(onClick = onAddAddress, icon = { Icon(Icons.Filled.Add, null) }, text = { Text(stringResource(R.string.address_add)) }) },
    ) { p ->
        if (s.addresses.isEmpty()) {
            EmptyState(Icons.Filled.Place, stringResource(R.string.addresses_empty_title), stringResource(R.string.addresses_empty_body), Modifier.padding(p))
        } else LazyColumn(Modifier.padding(p)) {
            items(s.addresses, key = { it.id }) { a ->
                ListItem(
                    headlineContent = { Text(addressTitle(a)) },
                    supportingContent = { Text(listOf(a.shortText, a.landmark).filter { it.isNotBlank() }.joinToString(" · ")) },
                    leadingContent = { Icon(addressIcon(a.label), null) },
                    trailingContent = { IconButton(onClick = { vm.delete(a.id) }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete)) } },
                )
                HorizontalDivider()
            }
        }
    }
}

@Composable
fun AddAddressScreen(onBack: () -> Unit, onSaved: () -> Unit, vm: AddAddressViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.saved) { if (s.saved) onSaved() }
    val permission = rememberLocationPermissionRequest { granted -> if (granted) vm.locate() else vm.permissionDenied() }
    Scaffold(topBar = { AppTopBar(stringResource(R.string.address_add), onBack) }) { p ->
        Column(Modifier.padding(p).verticalScroll(rememberScrollState()).padding(16.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AddressLabel.entries.forEach { l ->
                    FilterChip(selected = s.label == l, onClick = { vm.onLabel(l) }, label = { Text(stringResource(addressLabel(l))) }, leadingIcon = { Icon(addressIcon(l), null, Modifier.size(18.dp)) })
                }
            }
            if (s.label == AddressLabel.OTHER) OutlinedTextField(s.customLabel, vm::onCustomLabel, label = { Text(stringResource(R.string.address_custom_label)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                s.line1, vm::onLine1, label = { Text(stringResource(R.string.address_line1)) }, modifier = Modifier.fillMaxWidth().testTag("address_line1"),
                isError = s.showErrors && s.line1.isBlank(),
            )
            OutlinedTextField(s.area, vm::onArea, label = { Text(stringResource(R.string.address_area)) }, singleLine = true, modifier = Modifier.fillMaxWidth(), isError = s.showErrors && s.area.isBlank())
            OutlinedTextField(s.landmark, vm::onLandmark, label = { Text(stringResource(R.string.address_landmark)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Text(stringResource(R.string.address_pin), style = MaterialTheme.typography.titleSmall)
            OutlinedButton(onClick = { if (vm.needsPermission) permission.launch(LOCATION_PERMISSIONS) else vm.locate() }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.MyLocation, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.location_use_current))
            }
            LocateStatusText(s.locate)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QUICK_LOCALITIES.forEach { (name, point) ->
                    FilterChip(selected = s.pointLabel == name, onClick = { vm.onLocality(name, point) }, label = { Text(name) })
                }
            }
            if (s.point != null) Text(stringResource(R.string.address_pinned, s.pointLabel), style = MaterialTheme.typography.bodySmall)
            else if (s.showErrors) Text(stringResource(R.string.address_pin_required), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Button(onClick = vm::save, modifier = Modifier.fillMaxWidth().testTag("save_address")) { Text(stringResource(R.string.save)) }
        }
    }
}
