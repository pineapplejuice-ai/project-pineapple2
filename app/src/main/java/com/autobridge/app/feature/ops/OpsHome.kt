package com.autobridge.app.feature.ops

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.autobridge.app.R
import com.autobridge.app.core.ui.categoryLabel
import com.autobridge.app.core.ui.components.*
import com.autobridge.app.core.ui.dateTime
import com.autobridge.core.domain.repository.BookingRepository
import com.autobridge.core.domain.repository.PartnerRepository
import com.autobridge.core.domain.repository.ShopRequestRepository
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OpsUiState(
    val loading: Boolean = true,
    val needsRider: List<Booking> = emptyList(),
    val active: List<Booking> = emptyList(),
    val partners: List<Partner> = emptyList(),
    val requests: List<ShopRequest> = emptyList(),
)

@HiltViewModel
class OpsViewModel @Inject constructor(
    bookings: BookingRepository,
    private val partners: PartnerRepository,
    private val requests: ShopRequestRepository,
) : ViewModel() {
    val state: StateFlow<OpsUiState> = combine(bookings.observeAllBookings(), partners.observePartners(), requests.observeRequests()) { b, p, r ->
        val active = b.filter { it.isActive }
        OpsUiState(
            loading = false,
            // Bookings whose next step is rider assignment (or that are active without a rider).
            needsRider = active.filter { TripFlow.next(it) == BookingStatus.RIDER_ASSIGNED || (it.riderId == null && it.status != BookingStatus.REQUESTED && it.tripType != TripType.DROP_ONLY) },
            active = active,
            partners = p.sortedBy { it.verified },
            requests = r.sortedByDescending { it.createdAtMillis },
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), OpsUiState())

    fun setVerified(p: Partner, verified: Boolean) = viewModelScope.launch { partners.savePartner(p.copy(verified = verified)) }
    fun setCommission(p: Partner, percent: Double) = viewModelScope.launch { partners.savePartner(p.copy(commissionPercent = percent.coerceIn(0.0, 50.0))) }
    fun setRequestStatus(id: String, status: ShopRequestStatus) = viewModelScope.launch { requests.updateStatus(id, status) }
}

private enum class OpsTab(val label: Int) { BOOKINGS(R.string.ops_tab_bookings), PARTNERS(R.string.ops_tab_partners), REQUESTS(R.string.ops_tab_requests) }

@Composable
fun OpsHomeScreen(onOpenJob: (String) -> Unit, onOpenProfile: () -> Unit, vm: OpsViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(OpsTab.BOOKINGS) }
    var commissionFor by remember { mutableStateOf<Partner?>(null) }
    Scaffold(topBar = {
        AppTopBar(stringResource(R.string.ops_title)) {
            IconButton(onClick = onOpenProfile, modifier = Modifier.testTag("open_profile")) { Icon(Icons.Filled.AccountCircle, stringResource(R.string.tab_profile)) }
        }
    }) { p ->
        Column(Modifier.padding(p)) {
            @OptIn(ExperimentalMaterial3Api::class)
            PrimaryTabRow(selectedTabIndex = tab.ordinal) {
                OpsTab.entries.forEach { t -> Tab(selected = t == tab, onClick = { tab = t }, text = { Text(stringResource(t.label)) }) }
            }
            if (s.loading) { LoadingState(); return@Column }
            when (tab) {
                OpsTab.BOOKINGS -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { SectionHeader(stringResource(R.string.ops_needs_rider, s.needsRider.size)) }
                    items(s.needsRider, key = { "nr-" + it.id }) { b -> BookingSummaryCard(b, { onOpenJob(b.id) }, Modifier.testTag("ops_job_${b.id}")) }
                    item { SectionHeader(stringResource(R.string.ops_all_active, s.active.size)) }
                    items(s.active, key = { it.id }) { b -> BookingSummaryCard(b, { onOpenJob(b.id) }) }
                }
                OpsTab.PARTNERS -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(s.partners, key = { it.id }) { partner ->
                        OutlinedCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text(partner.name, fontWeight = FontWeight.SemiBold)
                                Text(stringResource(R.string.ops_partner_meta, partner.area, partner.commissionPercent.toString()), style = MaterialTheme.typography.bodySmall)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Switch(checked = partner.verified, onCheckedChange = { vm.setVerified(partner, it) })
                                    Spacer(Modifier.width(8.dp))
                                    Text(stringResource(R.string.verified), Modifier.weight(1f))
                                    TextButton(onClick = { commissionFor = partner }) { Text(stringResource(R.string.ops_set_commission)) }
                                }
                            }
                        }
                    }
                }
                OpsTab.REQUESTS -> if (s.requests.isEmpty()) EmptyState(Icons.Filled.Inbox, stringResource(R.string.ops_no_requests), stringResource(R.string.ops_no_requests_body))
                else LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(s.requests, key = { it.id }) { r ->
                        OutlinedCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text(r.name, fontWeight = FontWeight.SemiBold)
                                Text("${stringResource(categoryLabel(r.category))} · ${r.address}", style = MaterialTheme.typography.bodySmall)
                                Text(dateTime(r.createdAtMillis), style = MaterialTheme.typography.labelSmall)
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    ShopRequestStatus.entries.forEach { st ->
                                        FilterChip(selected = r.status == st, onClick = { vm.setRequestStatus(r.id, st) }, label = { Text(st.name.lowercase().replaceFirstChar { it.uppercase() }) })
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    commissionFor?.let { partner ->
        var value by remember(partner.id) { mutableStateOf(partner.commissionPercent.toString()) }
        AlertDialog(
            onDismissRequest = { commissionFor = null },
            title = { Text(stringResource(R.string.ops_set_commission)) },
            text = { OutlinedTextField(value, { value = it.filter { c -> c.isDigit() || c == '.' }.take(5) }, label = { Text("%") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)) },
            confirmButton = { TextButton(onClick = { value.toDoubleOrNull()?.let { vm.setCommission(partner, it) }; commissionFor = null }) { Text(stringResource(R.string.save)) } },
            dismissButton = { TextButton(onClick = { commissionFor = null }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}
