@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.autobridge.app.feature.bookings

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
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
import com.autobridge.core.model.*

@androidx.annotation.StringRes
private fun filterLabel(f: HistoryFilter): Int = when (f) {
    HistoryFilter.ACTIVE -> R.string.history_active
    HistoryFilter.COMPLETED -> R.string.history_completed
    HistoryFilter.CANCELLED -> R.string.history_cancelled
    HistoryFilter.ALL -> R.string.history_all
}

@Composable
fun BookingsScreen(onOpenBooking: (String) -> Unit, onExplore: () -> Unit, vm: BookingsViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    Scaffold(topBar = { AppTopBar(stringResource(R.string.tab_bookings)) }) { p ->
        Column(Modifier.padding(p).fillMaxSize()) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HistoryFilter.entries.forEach { f ->
                    FilterChip(selected = s.filter == f, onClick = { vm.setFilter(f) }, label = { Text("${stringResource(filterLabel(f))} (${s.counts[f] ?: 0})") })
                }
            }
            when {
                s.loading -> LoadingState()
                s.bookings.isEmpty() -> EmptyState(Icons.AutoMirrored.Filled.ReceiptLong, stringResource(R.string.bookings_empty_title), stringResource(R.string.bookings_empty_body), actionLabel = stringResource(R.string.tab_explore), onAction = onExplore)
                else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.testTag("bookings_list")) {
                    items(s.bookings, key = { it.id }) { b -> BookingSummaryCard(b, onClick = { onOpenBooking(b.id) }) }
                }
            }
        }
    }
}

@Composable
fun BookingDetailScreen(onBack: () -> Unit, onBookAgain: (partnerId: String, rebookId: String) -> Unit, onOpenPartner: (String) -> Unit, vm: BookingDetailViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var showCancel by remember { mutableStateOf(false) }
    val notifPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { vm.notificationPromptHandled() }
    val snackbar = remember { SnackbarHostState() }
    val notAllowed = stringResource(R.string.booking_action_not_allowed)
    LaunchedEffect(s.message) { s.message?.let { snackbar.showSnackbar(if (it == "not_allowed") notAllowed else it); vm.clearMessage() } }

    Scaffold(topBar = { AppTopBar(s.booking?.id ?: "", onBack) }, snackbarHost = { SnackbarHost(snackbar) }) { p ->
        val b = s.booking
        when {
            s.loading -> LoadingState(Modifier.padding(p))
            b == null -> EmptyState(Icons.AutoMirrored.Filled.ReceiptLong, stringResource(R.string.booking_not_found), "", Modifier.padding(p))
            else -> Column(Modifier.padding(p).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(stringResource(statusTitleRes(b.status, b.tripType)), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.testTag("booking_status"))
                Text("${b.partner.name} · ${b.vehicle.name} · ${RegistrationNumber.format(b.vehicle.registrationNumber)}", style = MaterialTheme.typography.bodyMedium)
                Text("${epochDayLabel(b.slot.epochDay)} · ${b.slot.slot?.label.orEmpty()} · ${stringResource(tripTypeLabel(b.tripType))}", style = MaterialTheme.typography.bodyMedium)

                if (s.canApproveEstimate) EstimateCard(b, vm::decideLine, vm::approveAll)

                ContactRow(b, context)

                Card(Modifier.fillMaxWidth()) { StatusTimeline(b, Modifier.padding(16.dp)) }

                if (b.walkaround.isNotEmpty()) WalkaroundGallery(b)

                DetailsCard(b)
                PriceBreakdownCard(b.price)
                b.estimate?.takeIf { !s.canApproveEstimate }?.let { est ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(stringResource(R.string.estimate_title), fontWeight = FontWeight.Bold)
                            est.lines.forEach { l ->
                                Row { Text(l.description, Modifier.weight(1f)); Text(rupees(l.amount) + " · " + stringResource(if (l.approved == true) R.string.estimate_approved else R.string.estimate_declined)) }
                            }
                        }
                    }
                }
                b.cancellation?.let { c -> Text(stringResource(R.string.booking_cancelled_reason, c.reason, rupees(c.fee)), style = MaterialTheme.typography.bodyMedium) }

                if (s.canRate) RatingCard(b, vm::rate)
                if (b.status == BookingStatus.COMPLETED && !s.canRate) Text(stringResource(R.string.rating_thanks), style = MaterialTheme.typography.bodyMedium)

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (s.canReschedule) OutlinedButton(onClick = vm::openReschedule, modifier = Modifier.testTag("reschedule")) { Text(stringResource(R.string.booking_reschedule)) }
                    if (s.canCancel) OutlinedButton(onClick = { showCancel = true }, modifier = Modifier.testTag("cancel_booking")) { Text(stringResource(R.string.booking_cancel)) }
                    if (b.status.isTerminal) Button(onClick = { onBookAgain(b.partner.partnerId, b.id) }, modifier = Modifier.testTag("book_again")) { Text(stringResource(R.string.booking_book_again)) }
                }
                TextButton(onClick = { onOpenPartner(b.partner.partnerId) }) { Text(stringResource(R.string.booking_view_partner)) }
            }
        }
    }

    if (showCancel) s.booking?.let { b -> CancelDialog(s.cancellationFee, onConfirm = { reason -> vm.cancel(reason); showCancel = false }, onDismiss = { showCancel = false }) }
    s.reschedule?.let { r -> RescheduleDialog(r, vm::rescheduleDay, vm::rescheduleSlot, vm::confirmReschedule, vm::closeReschedule) }
    if (s.showNotificationPrompt) {
        AlertDialog(
            onDismissRequest = vm::notificationPromptHandled,
            icon = { Icon(Icons.Filled.NotificationsActive, null) },
            title = { Text(stringResource(R.string.notif_prompt_title)) },
            text = { Text(stringResource(R.string.notif_prompt_body)) },
            confirmButton = {
                TextButton(onClick = {
                    if (Build.VERSION.SDK_INT >= 33) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS) else vm.notificationPromptHandled()
                }) { Text(stringResource(R.string.notif_prompt_allow)) }
            },
            dismissButton = { TextButton(onClick = vm::notificationPromptHandled) { Text(stringResource(R.string.notif_prompt_later)) } },
        )
    }
}

@Composable
private fun ContactRow(b: Booking, context: android.content.Context) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (b.partner.phone.isNotBlank()) AssistChip(onClick = { Intents.dial(context, b.partner.phone) }, label = { Text(stringResource(R.string.contact_call_partner)) }, leadingIcon = { Icon(Icons.Filled.Call, null, Modifier.size(18.dp)) })
        if (b.partner.whatsapp.isNotBlank()) AssistChip(onClick = { Intents.whatsApp(context, b.partner.whatsapp, b.id) }, label = { Text(stringResource(R.string.contact_whatsapp_partner)) }, leadingIcon = { Icon(Icons.Filled.Chat, null, Modifier.size(18.dp)) })
        b.riderPhone?.takeIf { b.isActive }?.let { phone ->
            AssistChip(onClick = { Intents.dial(context, phone) }, label = { Text(stringResource(R.string.contact_call_rider, b.riderName.orEmpty())) }, leadingIcon = { Icon(Icons.Filled.Motorcycle, null, Modifier.size(18.dp)) })
            AssistChip(onClick = { Intents.whatsApp(context, phone, b.id) }, label = { Text(stringResource(R.string.contact_whatsapp_rider)) }, leadingIcon = { Icon(Icons.Filled.Chat, null, Modifier.size(18.dp)) })
        }
        AssistChip(onClick = { Intents.directions(context, b.partner.location, b.partner.name) }, label = { Text(stringResource(R.string.directions)) }, leadingIcon = { Icon(Icons.Filled.Directions, null, Modifier.size(18.dp)) })
    }
}

@Composable
private fun EstimateCard(b: Booking, onDecide: (String, Boolean) -> Unit, onApproveAll: () -> Unit) {
    val est = b.estimate ?: return
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), modifier = Modifier.fillMaxWidth().testTag("estimate_card")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.estimate_review_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(stringResource(R.string.estimate_review_body), style = MaterialTheme.typography.bodySmall)
            if (est.note.isNotBlank()) Text(est.note, style = MaterialTheme.typography.bodyMedium)
            est.lines.forEach { l ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(l.description, fontWeight = FontWeight.SemiBold)
                        Text(rupees(l.amount), style = MaterialTheme.typography.bodySmall)
                    }
                    when (l.approved) {
                        true -> InfoPill(stringResource(R.string.estimate_approved))
                        false -> InfoPill(stringResource(R.string.estimate_declined))
                        null -> {
                            TextButton(onClick = { onDecide(l.id, false) }) { Text(stringResource(R.string.estimate_decline)) }
                            FilledTonalButton(onClick = { onDecide(l.id, true) }, modifier = Modifier.testTag("approve_${l.id}")) { Text(stringResource(R.string.estimate_approve)) }
                        }
                    }
                }
            }
            HorizontalDivider()
            Text(stringResource(R.string.estimate_approved_total, rupees(est.approvedTotal)), fontWeight = FontWeight.Bold)
            if (est.pendingCount != 1) Button(onClick = onApproveAll, modifier = Modifier.fillMaxWidth().testTag("approve_all")) { Text(stringResource(if (est.lines.isEmpty()) R.string.estimate_approve_as_is else R.string.estimate_approve_all)) }
        }
    }
}

@Composable
private fun WalkaroundGallery(b: Booking) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            WalkaroundStage.entries.forEach { stage ->
                val photos = b.photosFor(stage)
                if (photos.isNotEmpty()) {
                    Text(stringResource(walkaroundStageLabel(stage)), fontWeight = FontWeight.SemiBold)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        photos.forEach { ph ->
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                WalkaroundThumb(ph.uri, stringResource(photoAngleLabel(ph.angle)))
                                Text(stringResource(photoAngleLabel(ph.angle)), style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Demo walkaround photos use a `demo://` placeholder URI; real ones are images. */
@Composable
fun WalkaroundThumb(uri: String, description: String) {
    if (uri.startsWith("demo://")) {
        Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp), modifier = Modifier.size(72.dp)) {
            Box(contentAlignment = Alignment.Center) { Icon(Icons.Filled.PhotoCamera, description) }
        }
    } else AsyncImage(model = uri, contentDescription = description, modifier = Modifier.size(72.dp).clip(RoundedCornerShape(8.dp)))
}

@Composable
private fun DetailsCard(b: Booking) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.booking_details), fontWeight = FontWeight.Bold)
            b.servicePackage?.let { Text(stringResource(R.string.booking_package, it.name)) }
            if (b.issues.isNotEmpty()) Text(stringResource(R.string.booking_issues, b.issues.joinToString()))
            if (b.notes.isNotBlank()) Text(stringResource(R.string.booking_notes, b.notes))
            b.pickupAddress?.let { Text(stringResource(R.string.book_pickup_short, it.shortText)) }
            b.dropAddress?.let { Text(stringResource(R.string.book_drop_short, it.shortText)) }
            b.jobCardNumber?.let { Text(stringResource(R.string.book_job_card_short, it)) }
            b.riderName?.let { Text(stringResource(R.string.booking_rider, it)) }
            if (b.photoUris.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                b.photoUris.forEach { AsyncImage(model = it, contentDescription = stringResource(R.string.book_photo_cd), modifier = Modifier.size(64.dp).clip(RoundedCornerShape(8.dp))) }
            }
        }
    }
}

@Composable
private fun RatingCard(b: Booking, onRate: (Int?, Int?, String) -> Unit) {
    var rider by remember { mutableIntStateOf(b.ratings.rider ?: 0) }
    var partner by remember { mutableIntStateOf(b.ratings.partner ?: 0) }
    var comment by remember { mutableStateOf("") }
    Card(Modifier.fillMaxWidth().testTag("rating_card")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.rating_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            if (b.riderName != null) StarRatingInput(rider, { rider = it }, stringResource(R.string.rating_rider, b.riderName.orEmpty()))
            StarRatingInput(partner, { partner = it }, stringResource(R.string.rating_partner, b.partner.name))
            OutlinedTextField(comment, { comment = it.take(300) }, label = { Text(stringResource(R.string.rating_comment)) }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { onRate(rider.takeIf { it > 0 }, partner.takeIf { it > 0 }, comment) }, enabled = rider > 0 || partner > 0) { Text(stringResource(R.string.rating_submit)) }
        }
    }
}

@Composable
private fun CancelDialog(fee: Int, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var reason by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.cancel_title)) },
        text = {
            Column {
                Text(if (fee > 0) stringResource(R.string.cancel_fee_notice, rupees(fee)) else stringResource(R.string.cancel_free_notice), style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                BookingRules.CANCEL_REASONS.forEach { r ->
                    Row(Modifier.fillMaxWidth().selectable(selected = reason == r, onClick = { reason = r }, role = Role.RadioButton), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = reason == r, onClick = null)
                        Text(r)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { reason?.let(onConfirm) }, enabled = reason != null, modifier = Modifier.testTag("confirm_cancel")) { Text(stringResource(R.string.booking_cancel)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel_keep)) } },
    )
}

@Composable
private fun RescheduleDialog(r: RescheduleState, onDay: (Long) -> Unit, onSlot: (String) -> Unit, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.booking_reschedule)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    r.days.forEach { d -> FilterChip(selected = d == r.epochDay, onClick = { onDay(d) }, label = { Text(epochDayLabel(d)) }) }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    r.slots.forEach { (slot, available) ->
                        FilterChip(selected = slot.id == r.slotId, enabled = available, onClick = { onSlot(slot.id) }, label = { Text(slot.label) })
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onConfirm, enabled = r.slotId != null) { Text(stringResource(R.string.save)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}
