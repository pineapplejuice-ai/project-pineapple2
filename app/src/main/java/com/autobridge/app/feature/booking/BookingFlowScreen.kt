@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.autobridge.app.feature.booking

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.autobridge.app.R
import com.autobridge.app.core.ui.*
import com.autobridge.app.core.ui.components.*
import com.autobridge.app.feature.location.addressTitle
import com.autobridge.core.domain.booking.BookingDraftValidator
import com.autobridge.core.domain.booking.BookingStep
import com.autobridge.core.model.*

@androidx.annotation.StringRes
private fun stepTitle(s: BookingStep): Int = when (s) {
    BookingStep.VEHICLE -> R.string.step_vehicle
    BookingStep.PARTNER -> R.string.step_partner
    BookingStep.SERVICE -> R.string.step_service
    BookingStep.TRIP -> R.string.step_trip
    BookingStep.SLOT -> R.string.step_slot
    BookingStep.REVIEW -> R.string.step_review
}

@Composable
fun BookingFlowScreen(
    onBack: () -> Unit,
    onBooked: (String) -> Unit,
    onAddVehicle: () -> Unit,
    onAddAddress: () -> Unit,
    vm: BookingFlowViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.bookedId) { s.bookedId?.let(onBooked) }
    val goBack = { if (!vm.back()) onBack() }
    BackHandler { goBack() }

    Scaffold(
        topBar = { AppTopBar(stringResource(R.string.book_title), goBack) },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Column(Modifier.navigationBarsPadding().padding(16.dp)) {
                    s.visibleErrors.firstOrNull()?.let { Text(stringResource(draftErrorLabel(it)), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    s.submitError?.let { Text(stringResource(R.string.book_failed), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        s.quote?.takeIf { s.step.ordinal >= BookingStep.SERVICE.ordinal }?.let { q ->
                            Column(Modifier.weight(1f)) {
                                Text(rupees(q.breakdown.total), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Text(stringResource(if (q.breakdown.isEstimate) R.string.price_total_estimate else R.string.price_total), style = MaterialTheme.typography.labelSmall)
                            }
                        } ?: Spacer(Modifier.weight(1f))
                        if (s.step == BookingStep.REVIEW) {
                            Button(onClick = vm::confirm, enabled = !s.submitting, modifier = Modifier.testTag("confirm_booking")) {
                                if (s.submitting) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text(stringResource(R.string.book_confirm))
                            }
                        } else Button(onClick = vm::next, modifier = Modifier.testTag("step_next")) { Text(stringResource(R.string.next)) }
                    }
                }
            }
        },
    ) { p ->
        Column(Modifier.padding(p).fillMaxSize()) {
            LinearProgressIndicator(progress = { (s.step.ordinal + 1f) / BookingStep.entries.size }, modifier = Modifier.fillMaxWidth())
            Text(
                stringResource(R.string.book_step_of, s.step.ordinal + 1, BookingStep.entries.size, stringResource(stepTitle(s.step))),
                style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            if (s.loading) { LoadingState(); return@Column }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (s.step) {
                    BookingStep.VEHICLE -> VehicleStep(s, vm, onAddVehicle)
                    BookingStep.PARTNER -> PartnerStep(s, vm)
                    BookingStep.SERVICE -> ServiceStep(s, vm)
                    BookingStep.TRIP -> TripStep(s, vm, onAddAddress)
                    BookingStep.SLOT -> SlotStep(s, vm)
                    BookingStep.REVIEW -> ReviewStep(s, vm)
                }
            }
        }
    }
}

@Composable
private fun SelectableCard(selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    OutlinedCard(
        modifier = modifier.fillMaxWidth().selectable(selected = selected, onClick = onClick, role = Role.RadioButton),
        colors = if (selected) CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.primaryContainer) else CardDefaults.outlinedCardColors(),
    ) { Column(Modifier.padding(14.dp), content = content) }
}

@Composable
private fun VehicleStep(s: BookingFlowUiState, vm: BookingFlowViewModel, onAddVehicle: () -> Unit) {
    s.vehicles.forEach { v ->
        SelectableCard(v.id == s.selection.vehicleId, { vm.selectVehicle(v.id) }, Modifier.testTag("pick_vehicle_${v.id}")) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(vehicleTypeIcon(v.type), null)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(v.displayName, fontWeight = FontWeight.SemiBold)
                    Text("${v.displayRegistration} · ${stringResource(fuelLabel(v.fuel))}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    OutlinedButton(onClick = onAddVehicle, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Filled.Add, null); Text(stringResource(R.string.vehicle_add)) }
}

@Composable
private fun PartnerStep(s: BookingFlowUiState, vm: BookingFlowViewModel) {
    OutlinedTextField(
        s.selection.partnerQuery, vm::onPartnerQuery, singleLine = true, modifier = Modifier.fillMaxWidth(),
        leadingIcon = { Icon(Icons.Filled.Search, null) }, placeholder = { Text(stringResource(R.string.explore_search_hint)) },
    )
    if (s.partners.isEmpty()) EmptyState(Icons.Filled.Explore, stringResource(R.string.explore_empty_title), stringResource(R.string.explore_empty_body))
    s.partners.take(30).forEach { rp ->
        SelectableCard(rp.partner.id == s.selection.partnerId, { vm.selectPartner(rp.partner.id) }) {
            Text(rp.partner.name, fontWeight = FontWeight.SemiBold)
            Text(categoriesText(rp.partner.categories), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                RatingBadge(rp.partner.rating, rp.partner.reviewCount)
                Text(distance(rp.distanceKm), style = MaterialTheme.typography.labelMedium)
                rp.startingPrice?.let { Text(stringResource(R.string.from_price, rupees(it)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
            }
        }
    }
}

@Composable
private fun ServiceStep(s: BookingFlowUiState, vm: BookingFlowViewModel) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(BookingDraftValidator.MAX_PHOTOS)) { uris ->
        vm.addPhotos(uris.map { it.toString() })
    }
    Text(s.draft.partner?.name.orEmpty(), style = MaterialTheme.typography.titleMedium)
    if (s.selection.tripType == TripType.DROP_ONLY) Text(stringResource(R.string.book_drop_only_service_note), style = MaterialTheme.typography.bodySmall)
    Text(stringResource(R.string.book_choose_package), style = MaterialTheme.typography.titleSmall)
    if (s.packages.isEmpty()) Text(stringResource(R.string.partner_no_packages), style = MaterialTheme.typography.bodySmall)
    s.packages.forEach { pkg ->
        PackageCard(pkg, onSelect = { vm.selectPackage(pkg.id) }, selected = pkg.id == s.selection.packageId, actionLabel = stringResource(R.string.select), modifier = Modifier.clickable { vm.selectPackage(pkg.id) }.testTag("select_package_${pkg.id}"))
    }
    Text(stringResource(R.string.book_issues), style = MaterialTheme.typography.titleSmall)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        s.issueOptions.forEach { issue ->
            FilterChip(selected = issue in s.selection.issues, onClick = { vm.toggleIssue(issue) }, label = { Text(issue) })
        }
    }
    OutlinedTextField(
        s.selection.notes, vm::onNotes, modifier = Modifier.fillMaxWidth(), minLines = 2,
        label = { Text(stringResource(R.string.book_notes)) },
    )
    Text(stringResource(R.string.book_photos, s.selection.photoUris.size, BookingDraftValidator.MAX_PHOTOS), style = MaterialTheme.typography.titleSmall)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        s.selection.photoUris.forEach { uri ->
            Box {
                AsyncImage(model = uri, contentDescription = stringResource(R.string.book_photo_cd), modifier = Modifier.size(88.dp).clip(RoundedCornerShape(8.dp)))
                IconButton(onClick = { vm.removePhoto(uri) }, modifier = Modifier.align(Alignment.TopEnd).size(28.dp)) {
                    Icon(Icons.Filled.Cancel, stringResource(R.string.delete))
                }
            }
        }
        if (s.selection.photoUris.size < BookingDraftValidator.MAX_PHOTOS) {
            OutlinedButton(onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, modifier = Modifier.height(88.dp)) {
                Icon(Icons.Filled.AddAPhoto, null); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.book_add_photo))
            }
        }
    }
}

@Composable
private fun AddressPicker(title: String, addresses: List<SavedAddress>, selectedId: String?, onSelect: (String) -> Unit, onAdd: () -> Unit, tag: String) {
    Text(title, style = MaterialTheme.typography.titleSmall)
    addresses.forEach { a ->
        SelectableCard(a.id == selectedId, { onSelect(a.id) }, Modifier.testTag("${tag}_${a.id}")) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(addressIcon(a.label), null)
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(addressTitle(a), fontWeight = FontWeight.SemiBold)
                    Text(a.shortText, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    TextButton(onClick = onAdd) { Icon(Icons.Filled.AddLocation, null); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.address_add)) }
}

@Composable
private fun TripStep(s: BookingFlowUiState, vm: BookingFlowViewModel, onAddAddress: () -> Unit) {
    TripType.entries.forEach { t ->
        SelectableCard(t == s.selection.tripType, { vm.selectTripType(t) }, Modifier.testTag("trip_${t.name}")) {
            Text(stringResource(tripTypeLabel(t)), fontWeight = FontWeight.SemiBold)
            Text(stringResource(tripTypeDescription(t)), style = MaterialTheme.typography.bodySmall)
        }
    }
    val trip = s.selection.tripType
    if (trip.hasPickupLeg) AddressPicker(stringResource(R.string.book_pickup_from), s.addresses, s.selection.pickupAddressId, vm::selectPickup, onAddAddress, "pickup")
    if (trip.hasDropLeg) AddressPicker(stringResource(R.string.book_drop_to), s.addresses, s.selection.dropAddressId, vm::selectDrop, onAddAddress, "drop")
    if (trip == TripType.DROP_ONLY) {
        OutlinedTextField(
            s.selection.jobCardNumber, vm::onJobCard, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("job_card"),
            label = { Text(stringResource(R.string.book_job_card)) },
            supportingText = { Text(stringResource(R.string.book_job_card_hint)) },
        )
    }
}

@Composable
private fun SlotStep(s: BookingFlowUiState, vm: BookingFlowViewModel) {
    Text(stringResource(R.string.book_pick_day), style = MaterialTheme.typography.titleSmall)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        s.days.forEach { d ->
            FilterChip(selected = d == s.selection.epochDay, onClick = { vm.selectDay(d) }, label = { Text(epochDayLabel(d)) })
        }
    }
    Text(stringResource(R.string.book_pick_slot), style = MaterialTheme.typography.titleSmall)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        s.slots.forEach { o ->
            val selected = o.slot.id == s.selection.slotId
            val label = o.slot.label + when {
                o.full -> " · " + stringResource(R.string.book_slot_full)
                o.past -> " · " + stringResource(R.string.book_slot_past)
                o.slot.startHour == 8 -> " · +₹30"
                else -> ""
            }
            FilterChip(
                selected = selected, enabled = o.enabled, onClick = { vm.selectSlot(o.slot.id) },
                label = { Text(label) }, modifier = Modifier.testTag("slot_${o.slot.id}"),
            )
        }
    }
    Text(stringResource(R.string.book_slot_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun ReviewRow(label: String, value: String, onEdit: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onEdit).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyMedium)
        }
        Icon(Icons.Filled.Edit, stringResource(R.string.edit))
    }
}

@Composable
private fun ReviewStep(s: BookingFlowUiState, vm: BookingFlowViewModel) {
    val d = s.draft
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            ReviewRow(stringResource(R.string.step_vehicle), d.vehicle?.let { "${it.displayName} · ${it.displayRegistration}" }.orEmpty()) { vm.goTo(BookingStep.VEHICLE) }
            ReviewRow(stringResource(R.string.step_partner), d.partner?.name.orEmpty()) { vm.goTo(BookingStep.PARTNER) }
            ReviewRow(
                stringResource(R.string.step_service),
                listOfNotNull(d.servicePackage?.name, d.issues.takeIf { it.isNotEmpty() }?.joinToString(), d.notes.takeIf { it.isNotBlank() }).joinToString(" · ").ifBlank { "—" },
            ) { vm.goTo(BookingStep.SERVICE) }
            ReviewRow(
                stringResource(tripTypeLabel(d.tripType)),
                listOfNotNull(
                    d.pickupAddress?.takeIf { d.tripType.hasPickupLeg }?.let { stringResource(R.string.book_pickup_short, it.shortText) },
                    d.dropAddress?.takeIf { d.tripType.hasDropLeg }?.let { stringResource(R.string.book_drop_short, it.shortText) },
                    d.jobCardNumber.takeIf { d.tripType == TripType.DROP_ONLY }?.let { stringResource(R.string.book_job_card_short, it) },
                ).joinToString("\n"),
            ) { vm.goTo(BookingStep.TRIP) }
            ReviewRow(stringResource(R.string.step_slot), "${d.epochDay?.let { epochDayLabel(it) }.orEmpty()} · ${d.slotId?.let { TimeSlot.byId(it)?.label }.orEmpty()}") { vm.goTo(BookingStep.SLOT) }
        }
    }
    s.quote?.let { PriceBreakdownCard(it.breakdown) }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.book_trust_title), fontWeight = FontWeight.SemiBold)
            Text(stringResource(R.string.book_trust_walkaround), style = MaterialTheme.typography.bodySmall)
            Text(stringResource(R.string.book_trust_checklist), style = MaterialTheme.typography.bodySmall)
            Text(stringResource(R.string.book_trust_estimate), style = MaterialTheme.typography.bodySmall)
        }
    }
}
