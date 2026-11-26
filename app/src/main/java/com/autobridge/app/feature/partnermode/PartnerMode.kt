@file:OptIn(ExperimentalMaterial3Api::class)

package com.autobridge.app.feature.partnermode

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
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
import com.autobridge.app.core.ui.*
import com.autobridge.app.core.ui.components.*
import com.autobridge.core.data.Ids
import com.autobridge.core.domain.repository.AuthRepository
import com.autobridge.core.domain.repository.BookingRepository
import com.autobridge.core.domain.repository.PartnerRepository
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class Earnings(val completedCount: Int, val gross: Int, val commission: Int) {
    val net: Int get() = gross - commission
}

data class PartnerHomeUiState(
    val loading: Boolean = true,
    val partner: Partner? = null,
    val newRequests: List<Booking> = emptyList(),
    val active: List<Booking> = emptyList(),
    val completed: List<Booking> = emptyList(),
    val packages: List<ServicePackage> = emptyList(),
    val earnings: Earnings = Earnings(0, 0, 0),
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class PartnerHomeViewModel @Inject constructor(
    auth: AuthRepository,
    private val partners: PartnerRepository,
    bookings: BookingRepository,
) : ViewModel() {
    private val partnerId = auth.currentUser.map { it?.partnerId }.distinctUntilChanged()

    val state: StateFlow<PartnerHomeUiState> = partnerId.flatMapLatest { pid ->
        if (pid == null) flowOf(PartnerHomeUiState(loading = false))
        else combine(partners.observePartners(), partners.observePackages(), bookings.observePartnerBookings(pid)) { p, k, b ->
            val done = b.filter { it.status == BookingStatus.COMPLETED }
            PartnerHomeUiState(
                loading = false,
                partner = p.firstOrNull { it.id == pid },
                newRequests = b.filter { it.status == BookingStatus.REQUESTED },
                active = b.filter { it.isActive && it.status != BookingStatus.REQUESTED },
                completed = done,
                packages = k.filter { it.partnerId == pid },
                // Partner earnings = service amount (package + approved extras) minus AutoBridge commission.
                earnings = done.fold(Earnings(0, 0, 0)) { acc, x ->
                    val service = (x.servicePackage?.price ?: 0) + (x.estimate?.approvedTotal ?: 0)
                    Earnings(acc.completedCount + 1, acc.gross + service, acc.commission + x.commissionAmount)
                },
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PartnerHomeUiState())

    fun savePackage(pkg: ServicePackage) = viewModelScope.launch { partners.savePackage(pkg) }
    fun deletePackage(id: String) = viewModelScope.launch { partners.deletePackage(id) }
    fun saveHours(open: Int, close: Int, closedOn: Set<Int>) = viewModelScope.launch {
        state.value.partner?.let { partners.savePartner(it.copy(hours = OpeningHours.everyDay(open, close, closedOn))) }
    }
}

private enum class PartnerTab(val label: Int) { BOOKINGS(R.string.partner_tab_bookings), PACKAGES(R.string.partner_tab_packages), HOURS(R.string.partner_tab_hours), EARNINGS(R.string.partner_tab_earnings) }

@Composable
fun PartnerHomeScreen(onOpenJob: (String) -> Unit, onOpenProfile: () -> Unit, vm: PartnerHomeViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(PartnerTab.BOOKINGS) }
    Scaffold(topBar = {
        AppTopBar(s.partner?.name ?: stringResource(R.string.role_partner)) {
            IconButton(onClick = onOpenProfile, modifier = Modifier.testTag("open_profile")) { Icon(Icons.Filled.AccountCircle, stringResource(R.string.tab_profile)) }
        }
    }) { p ->
        Column(Modifier.padding(p)) {
            PrimaryTabRow(selectedTabIndex = tab.ordinal) {
                PartnerTab.entries.forEach { t -> Tab(selected = t == tab, onClick = { tab = t }, text = { Text(stringResource(t.label)) }) }
            }
            when {
                s.loading -> LoadingState()
                s.partner == null -> EmptyState(Icons.Filled.Store, stringResource(R.string.partner_not_linked), stringResource(R.string.partner_not_linked_body))
                else -> when (tab) {
                    PartnerTab.BOOKINGS -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { SectionHeader(stringResource(R.string.partner_new_requests, s.newRequests.size)) }
                        if (s.newRequests.isEmpty()) item { Text(stringResource(R.string.partner_no_requests)) }
                        items(s.newRequests, key = { it.id }) { b -> BookingSummaryCard(b, { onOpenJob(b.id) }, Modifier.testTag("partner_job_${b.id}")) }
                        item { SectionHeader(stringResource(R.string.partner_active, s.active.size)) }
                        items(s.active, key = { it.id }) { b -> BookingSummaryCard(b, { onOpenJob(b.id) }, Modifier.testTag("partner_job_${b.id}")) }
                    }
                    PartnerTab.PACKAGES -> PackagesEditor(s.partner!!, s.packages, vm::savePackage, vm::deletePackage)
                    PartnerTab.HOURS -> HoursEditor(s.partner!!.hours, vm::saveHours)
                    PartnerTab.EARNINGS -> EarningsTab(s)
                }
            }
        }
    }
}

@Composable
private fun PackagesEditor(partner: Partner, packages: List<ServicePackage>, onSave: (ServicePackage) -> Unit, onDelete: (String) -> Unit) {
    var editing by remember { mutableStateOf<ServicePackage?>(null) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(packages, key = { it.id }) { pkg ->
            PackageCard(pkg, onSelect = { editing = pkg }, actionLabel = stringResource(R.string.edit))
        }
        item {
            OutlinedButton(onClick = {
                editing = ServicePackage(Ids.new(), partner.id, "", category = partner.primaryCategory, vehicleType = partner.vehicleTypes.first(), priceType = PriceType.FIXED, price = 0)
            }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Filled.Add, null); Text(stringResource(R.string.partner_add_package)) }
        }
    }
    editing?.let { pkg -> PackageDialog(pkg, partner, onSave = { onSave(it); editing = null }, onDelete = { onDelete(pkg.id); editing = null }, onDismiss = { editing = null }) }
}

@Composable
private fun PackageDialog(pkg: ServicePackage, partner: Partner, onSave: (ServicePackage) -> Unit, onDelete: () -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(pkg.name) }
    var price by remember { mutableStateOf(if (pkg.price > 0) pkg.price.toString() else "") }
    var fixed by remember { mutableStateOf(pkg.priceType == PriceType.FIXED) }
    var type by remember { mutableStateOf(pkg.vehicleType) }
    val valid = name.isNotBlank() && (price.toIntOrNull() ?: 0) > 0
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.partner_package)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it.take(60) }, label = { Text(stringResource(R.string.partner_package_name)) }, singleLine = true)
                OutlinedTextField(price, { price = it.filter(Char::isDigit).take(6) }, label = { Text(stringResource(R.string.partner_package_price)) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = fixed, onCheckedChange = { fixed = it })
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(if (fixed) R.string.fixed_price else R.string.partner_from_price))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    partner.vehicleTypes.forEach { t -> FilterChip(selected = type == t, onClick = { type = t }, label = { Text(stringResource(vehicleTypeLabel(t))) }) }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(pkg.copy(name = name.trim(), price = price.toInt(), priceType = if (fixed) PriceType.FIXED else PriceType.FROM, vehicleType = type)) }, enabled = valid) { Text(stringResource(R.string.save)) }
        },
        dismissButton = { Row { if (pkg.name.isNotBlank()) TextButton(onClick = onDelete) { Text(stringResource(R.string.delete)) }; TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } } },
    )
}

@Composable
private fun HoursEditor(hours: OpeningHours, onSave: (Int, Int, Set<Int>) -> Unit) {
    val first = hours.days.firstOrNull()
    var open by remember { mutableIntStateOf((first?.openMinute ?: 540) / 60) }
    var close by remember { mutableIntStateOf((first?.closeMinute ?: 1140) / 60) }
    var closed by remember { mutableStateOf((1..7).filter { hours.forDay(it) == null }.toSet()) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.partner_hours_open, minutesLabel(open * 60)))
        Slider(value = open.toFloat(), onValueChange = { open = it.toInt().coerceAtMost(close - 1) }, valueRange = 0f..23f, steps = 22)
        Text(stringResource(R.string.partner_hours_close, minutesLabel(close * 60)))
        Slider(value = close.toFloat(), onValueChange = { close = it.toInt().coerceAtLeast(open + 1) }, valueRange = 1f..24f, steps = 22)
        Text(stringResource(R.string.partner_hours_closed_on))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            (1..7).forEach { d ->
                FilterChip(selected = d in closed, onClick = { closed = if (d in closed) closed - d else closed + d },
                    label = { Text(java.time.DayOfWeek.of(d).getDisplayName(java.time.format.TextStyle.NARROW, java.util.Locale.getDefault())) })
            }
        }
        Button(onClick = { onSave(open * 60, close * 60, closed) }) { Text(stringResource(R.string.save)) }
    }
}

@Composable
private fun EarningsTab(s: PartnerHomeUiState) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(stringResource(R.string.partner_earnings_net, rupees(s.earnings.net)), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(stringResource(R.string.partner_earnings_detail, s.earnings.completedCount, rupees(s.earnings.gross), rupees(s.earnings.commission)))
                    Text(stringResource(R.string.partner_commission_rate, s.partner?.commissionPercent?.toString().orEmpty()), style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        if (s.completed.isEmpty()) item { EmptyState(Icons.AutoMirrored.Filled.ReceiptLong, stringResource(R.string.partner_no_completed), "") }
        items(s.completed, key = { it.id }) { b -> BookingSummaryCard(b, {}) }
    }
}
