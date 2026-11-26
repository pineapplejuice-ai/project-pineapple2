@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.autobridge.app.feature.jobs

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autobridge.app.R
import com.autobridge.app.core.ui.*
import com.autobridge.app.core.ui.components.*
import com.autobridge.app.feature.bookings.WalkaroundThumb
import com.autobridge.core.model.*
import java.io.File

private fun newPhotoUri(context: Context): Uri {
    val dir = File(context.cacheDir, "walkaround").apply { mkdirs() }
    val file = File.createTempFile("walk_", ".jpg", dir)
    return FileProvider.getUriForFile(context, context.packageName + ".files", file)
}

@Composable
fun JobScreen(onBack: () -> Unit, vm: JobViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val messages = mapOf(
        "not_allowed" to stringResource(R.string.booking_action_not_allowed),
        "walkaround" to stringResource(R.string.job_need_walkaround),
        "checklist" to stringResource(R.string.job_need_checklist),
        "estimate_invalid" to stringResource(R.string.job_estimate_invalid),
    )
    LaunchedEffect(s.message) { s.message?.let { snackbar.showSnackbar(messages[it] ?: it); vm.clearMessage() } }

    Scaffold(topBar = { AppTopBar(s.booking?.id ?: "", onBack) }, snackbarHost = { SnackbarHost(snackbar) }) { p ->
        val b = s.booking
        when {
            s.loading -> LoadingState(Modifier.padding(p))
            b == null -> EmptyState(Icons.Filled.Search, stringResource(R.string.booking_not_found), "", Modifier.padding(p))
            else -> Column(Modifier.padding(p).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(statusTitleRes(b.status, b.tripType)), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f).testTag("job_status"))
                    InfoPill(stringResource(tripTypeLabel(b.tripType)))
                }
                JobSummary(b, s.actor, context)

                // Primary action for this role.
                if (s.canDecline) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = vm::advance, modifier = Modifier.weight(1f).testTag("job_accept")) { Text(stringResource(R.string.job_accept)) }
                    OutlinedButton(onClick = vm::decline, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.job_decline)) }
                } else if (s.canAdvance && s.next != null) {
                    s.walkaroundStage?.let { stage -> WalkaroundCapture(b, stage, vm) }
                    if (s.checklistRequired) ChecklistCard(b, vm::setChecklist)
                    Button(
                        onClick = vm::advance, enabled = s.walkaroundComplete && s.checklistComplete,
                        modifier = Modifier.fillMaxWidth().testTag("job_next"),
                    ) { Text(stringResource(R.string.job_mark, stringResource(statusTitleRes(s.next!!, b.tripType)))) }
                } else if (b.isActive && s.actor != Actor.OPS && !s.canShareEstimate) {
                    Text(stringResource(R.string.job_waiting, stringResource(statusTitleRes(s.next ?: b.status, b.tripType))), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (s.canShareEstimate) EstimateEditor(s, b, vm)

                if (s.actor == Actor.OPS && b.isActive) OpsControls(b, s.riders, vm::assignRider, vm::overrideStatus)

                if (b.checklist.isNotEmpty() && !s.checklistRequired && b.status.ordinal >= BookingStatus.AT_WORKSHOP.ordinal) ChecklistCard(b, null)
                b.estimate?.let { est ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(stringResource(R.string.estimate_title), fontWeight = FontWeight.Bold)
                            if (est.lines.isEmpty()) Text(est.note.ifBlank { "—" })
                            est.lines.forEach { l ->
                                Row {
                                    Text(l.description, Modifier.weight(1f))
                                    Text(rupees(l.amount) + " · " + when (l.approved) {
                                        true -> stringResource(R.string.estimate_approved)
                                        false -> stringResource(R.string.estimate_declined)
                                        null -> stringResource(R.string.job_estimate_pending)
                                    })
                                }
                            }
                        }
                    }
                }
                Card(Modifier.fillMaxWidth()) { StatusTimeline(b, Modifier.padding(16.dp)) }
                PriceBreakdownCard(b.price)
                if (s.actor != Actor.CUSTOMER && s.actor != Actor.RIDER) {
                    Text(stringResource(R.string.job_commission, b.commissionPercent.toString(), rupees(b.commissionAmount)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun JobSummary(b: Booking, actor: Actor, context: Context) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${b.vehicle.name} · ${RegistrationNumber.format(b.vehicle.registrationNumber)}", fontWeight = FontWeight.SemiBold)
            Text(stringResource(R.string.job_customer, b.customerName.ifBlank { b.customerPhone }))
            Text("${epochDayLabel(b.slot.epochDay)} · ${b.slot.slot?.label.orEmpty()}")
            b.servicePackage?.let { Text(stringResource(R.string.booking_package, it.name)) }
            if (b.issues.isNotEmpty()) Text(stringResource(R.string.booking_issues, b.issues.joinToString()))
            if (b.notes.isNotBlank()) Text(stringResource(R.string.booking_notes, b.notes))
            b.jobCardNumber?.let { Text(stringResource(R.string.book_job_card_short, it)) }
            b.pickupAddress?.let { Text(stringResource(R.string.book_pickup_short, it.shortText)) }
            b.dropAddress?.let { Text(stringResource(R.string.book_drop_short, it.shortText)) }
            Text(stringResource(R.string.job_partner, b.partner.name))
            b.riderName?.let { Text(stringResource(R.string.booking_rider, it)) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (actor != Actor.CUSTOMER) AssistChip(onClick = { Intents.dial(context, b.customerPhone) }, label = { Text(stringResource(R.string.job_call_customer)) }, leadingIcon = { Icon(Icons.Filled.Call, null, Modifier.size(18.dp)) })
                if (actor == Actor.RIDER || actor == Actor.OPS) AssistChip(onClick = { Intents.dial(context, b.partner.phone) }, label = { Text(stringResource(R.string.contact_call_partner)) }, leadingIcon = { Icon(Icons.Filled.Store, null, Modifier.size(18.dp)) })
                val target = when {
                    b.status.ordinal < BookingStatus.PICKED_UP.ordinal && b.pickupAddress != null -> b.pickupAddress!!.location to b.pickupAddress!!.shortText
                    b.status == BookingStatus.DROP_EN_ROUTE && b.dropAddress != null -> b.dropAddress!!.location to b.dropAddress!!.shortText
                    else -> b.partner.location to b.partner.name
                }
                AssistChip(onClick = { Intents.directions(context, target.first, target.second) }, label = { Text(stringResource(R.string.job_open_maps)) }, leadingIcon = { Icon(Icons.Filled.Map, null, Modifier.size(18.dp)) })
            }
        }
    }
}

@Composable
private fun WalkaroundCapture(b: Booking, stage: WalkaroundStage, vm: JobViewModel) {
    val context = LocalContext.current
    var pending by remember { mutableStateOf<Pair<PhotoAngle, Uri>?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val p = pending
        if (ok && p != null) vm.addPhoto(stage, p.first, p.second.toString())
        pending = null
    }
    val taken = b.photosFor(stage).associateBy { it.angle }
    Card(Modifier.fillMaxWidth().testTag("walkaround_card")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(walkaroundStageLabel(stage)), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(stringResource(R.string.job_walkaround_body), style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TripFlow.REQUIRED_ANGLES.forEach { angle ->
                    val label = stringResource(photoAngleLabel(angle))
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        val photo = taken[angle]
                        if (photo != null) WalkaroundThumb(photo.uri, label)
                        else OutlinedIconButton(onClick = {
                            val uri = newPhotoUri(context)
                            pending = angle to uri
                            camera.launch(uri)
                        }, modifier = Modifier.size(72.dp)) { Icon(Icons.Filled.AddAPhoto, stringResource(R.string.job_take_photo, label)) }
                        Text(label, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            TextButton(onClick = { vm.fillDemoPhotos(stage) }, modifier = Modifier.testTag("demo_photos")) { Text(stringResource(R.string.job_demo_photos)) }
        }
    }
}

@Composable
private fun ChecklistCard(b: Booking, onToggle: ((String, Boolean) -> Unit)?) {
    Card(Modifier.fillMaxWidth().testTag("checklist_card")) {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.job_checklist_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(stringResource(R.string.job_checklist_body), style = MaterialTheme.typography.bodySmall)
            b.checklist.forEach { item ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = item.checked, onCheckedChange = onToggle?.let { f -> { c: Boolean -> f(item.id, c) } }, enabled = onToggle != null, modifier = Modifier.testTag("check_${item.id}"))
                    Column {
                        Text(item.title)
                        if (item.reportedByCustomer) Text(stringResource(R.string.job_reported_by_customer), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
private fun EstimateEditor(s: JobUiState, b: Booking, vm: JobViewModel) {
    Card(Modifier.fillMaxWidth().testTag("estimate_editor")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.job_estimate_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(
                stringResource(if (b.requiresEstimate) R.string.job_estimate_required else R.string.job_estimate_optional),
                style = MaterialTheme.typography.bodySmall,
            )
            s.estimateDraft.forEachIndexed { i, line ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(line.description, { vm.onEstimateLine(line.id, description = it) }, label = { Text(stringResource(R.string.job_estimate_item)) }, singleLine = true, modifier = Modifier.weight(1.6f).testTag("estimate_desc_$i"))
                    OutlinedTextField(line.amount, { vm.onEstimateLine(line.id, amount = it) }, label = { Text("₹") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f).testTag("estimate_amount_$i"))
                    IconButton(onClick = { vm.removeEstimateLine(line.id) }) { Icon(Icons.Filled.Close, stringResource(R.string.delete)) }
                }
            }
            TextButton(onClick = vm::addEstimateLine) { Icon(Icons.Filled.Add, null); Text(stringResource(R.string.job_estimate_add_line)) }
            OutlinedTextField(s.estimateNote, vm::onEstimateNote, label = { Text(stringResource(R.string.job_estimate_note)) }, modifier = Modifier.fillMaxWidth())
            Button(onClick = vm::shareEstimate, modifier = Modifier.fillMaxWidth().testTag("share_estimate")) { Text(stringResource(R.string.job_estimate_share)) }
        }
    }
}

@Composable
private fun OpsControls(b: Booking, riders: List<Rider>, onAssign: (Rider) -> Unit, onOverride: (BookingStatus) -> Unit) {
    var riderMenu by remember { mutableStateOf(false) }
    var statusMenu by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.ops_controls), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Box {
                OutlinedButton(onClick = { riderMenu = true }, modifier = Modifier.testTag("assign_rider")) {
                    Text(b.riderName?.let { stringResource(R.string.ops_reassign_rider, it) } ?: stringResource(R.string.ops_assign_rider))
                }
                DropdownMenu(expanded = riderMenu, onDismissRequest = { riderMenu = false }) {
                    riders.forEach { r -> DropdownMenuItem(text = { Text(r.name) }, onClick = { onAssign(r); riderMenu = false }, modifier = Modifier.testTag("rider_${r.id}")) }
                }
            }
            Box {
                OutlinedButton(onClick = { statusMenu = true }) { Text(stringResource(R.string.ops_override_status)) }
                DropdownMenu(expanded = statusMenu, onDismissRequest = { statusMenu = false }) {
                    (TripFlow.steps(b) + BookingStatus.CANCELLED).filter { it != b.status && it != BookingStatus.REQUESTED }.forEach { st ->
                        DropdownMenuItem(text = { Text(stringResource(statusTitleRes(st, b.tripType))) }, onClick = { onOverride(st); statusMenu = false })
                    }
                }
            }
        }
    }
}
