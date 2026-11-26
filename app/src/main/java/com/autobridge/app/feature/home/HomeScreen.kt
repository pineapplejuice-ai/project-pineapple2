@file:OptIn(ExperimentalMaterial3Api::class)

package com.autobridge.app.feature.home

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autobridge.app.R
import com.autobridge.app.core.ui.*
import com.autobridge.app.core.ui.components.*
import com.autobridge.app.feature.location.LocationPickerSheet
import com.autobridge.core.model.PartnerCategory
import com.autobridge.core.model.PriceType

@Composable
fun HomeScreen(
    onOpenPartner: (String) -> Unit,
    onOpenCategory: (PartnerCategory) -> Unit,
    onOpenExplore: () -> Unit,
    onAddVehicle: () -> Unit,
    onOpenAddresses: () -> Unit,
    onOpenBooking: (String) -> Unit,
    onBookPackage: (partnerId: String, packageId: String) -> Unit,
    onBookService: () -> Unit,
    vm: HomeViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    var showLocation by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    TextButton(onClick = { showLocation = true }, modifier = Modifier.testTag("location_chip")) {
                        Icon(Icons.Filled.LocationOn, null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(4.dp))
                        Column {
                            Text(s.location?.title ?: stringResource(R.string.location_set), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1)
                            s.location?.subtitle?.takeIf { it.isNotBlank() }?.let {
                                Text(it, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Icon(Icons.Filled.ExpandMore, stringResource(R.string.location_choose))
                    }
                },
                actions = { if (s.isDemo) InfoPill(stringResource(R.string.demo_badge), Modifier.padding(end = 12.dp)) },
            )
        },
    ) { p ->
        when {
            s.loading -> LoadingState(Modifier.padding(p))
            s.error != null -> ErrorState(s.error, vm::retry, Modifier.padding(p))
            else -> LazyColumn(Modifier.padding(p).fillMaxSize().testTag("home_list"), contentPadding = PaddingValues(bottom = 24.dp)) {
                item { DemoBanner(s.isDemo) }
                item {
                    Text(
                        if (s.userName.isNotBlank()) stringResource(R.string.home_greeting, s.userName) else stringResource(R.string.home_greeting_anon),
                        style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                item { VehicleSwitcher(s, vm::selectVehicle, onAddVehicle) }
                s.ongoing?.let { b ->
                    item {
                        SectionHeader(stringResource(R.string.home_ongoing))
                        BookingSummaryCard(b, onClick = { onOpenBooking(b.id) }, modifier = Modifier.padding(horizontal = 16.dp).testTag("ongoing_booking"))
                    }
                }
                s.reminder?.let { r ->
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                        ) {
                            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.NotificationsActive, null)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(stringResource(R.string.home_reminder_title, r.vehicle.displayName), fontWeight = FontWeight.SemiBold)
                                    Text(
                                        when {
                                            r.neverServiced -> stringResource(R.string.home_reminder_unknown)
                                            r.daysOverdue > 0 -> stringResource(R.string.home_reminder_overdue, r.daysOverdue.toInt())
                                            else -> stringResource(R.string.home_reminder_soon)
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                FilledTonalButton(onClick = onBookService) { Text(stringResource(R.string.book)) }
                            }
                        }
                    }
                }
                item {
                    SectionHeader(stringResource(R.string.home_categories))
                    CategoryTiles(onOpenCategory)
                }
                if (s.brandCentres.isNotEmpty()) item {
                    SectionHeader(
                        stringResource(R.string.home_brand_centres, s.selectedVehicle?.brandName.orEmpty()),
                        actionLabel = stringResource(R.string.see_all), onAction = { onOpenCategory(PartnerCategory.AUTHORISED_SERVICE) },
                    )
                    s.brandCentres.forEach { rp -> PartnerListCard(rp, rp.partner.id in s.favouriteIds, { vm.toggleFavourite(rp.partner.id) }, { onOpenPartner(rp.partner.id) }) }
                }
                if (s.bestDetailing.isNotEmpty()) item {
                    SectionHeader(stringResource(R.string.home_best_detailing), actionLabel = stringResource(R.string.see_all), onAction = { onOpenCategory(PartnerCategory.DETAILING) })
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(s.bestDetailing, key = { it.partner.id }) { rp -> PartnerCarouselCard(rp) { onOpenPartner(rp.partner.id) } }
                    }
                }
                if (s.popularPackages.isNotEmpty()) item {
                    SectionHeader(stringResource(R.string.home_popular_packages))
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(s.popularPackages, key = { it.pkg.id }) { offer ->
                            Card(onClick = { onBookPackage(offer.partner.partner.id, offer.pkg.id) }, modifier = Modifier.width(200.dp)) {
                                Column(Modifier.padding(12.dp)) {
                                    Icon(categoryIcon(offer.pkg.category), null, tint = MaterialTheme.colorScheme.primary)
                                    Text(offer.pkg.name, fontWeight = FontWeight.SemiBold, maxLines = 2, minLines = 2)
                                    Text(offer.partner.partner.name, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        if (offer.pkg.priceType == PriceType.FIXED) rupees(offer.pkg.price) else stringResource(R.string.from_price, rupees(offer.pkg.price)),
                                        style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            }
                        }
                    }
                }
                item {
                    SectionHeader(stringResource(R.string.home_best_near_you), actionLabel = stringResource(R.string.see_all), onAction = onOpenExplore)
                }
                if (s.bestNearYou.isEmpty()) item {
                    EmptyState(Icons.Filled.Explore, stringResource(R.string.explore_empty_title), stringResource(R.string.explore_empty_body), actionLabel = stringResource(R.string.location_choose), onAction = { showLocation = true })
                }
                items(s.bestNearYou, key = { "best-" + it.partner.id }) { rp ->
                    PartnerListCard(rp, rp.partner.id in s.favouriteIds, { vm.toggleFavourite(rp.partner.id) }, { onOpenPartner(rp.partner.id) }, Modifier.testTag("best_${rp.partner.id}"))
                }
            }
        }
    }
    if (showLocation) LocationPickerSheet(onDismiss = { showLocation = false }, onAddAddress = onOpenAddresses)
}

@Composable
private fun VehicleSwitcher(s: HomeUiState, onSelect: (String) -> Unit, onAdd: () -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        s.vehicles.forEach { v ->
            FilterChip(
                selected = v.id == s.selectedVehicle?.id,
                onClick = { onSelect(v.id) },
                label = { Text("${v.displayName} · ${v.displayRegistration}") },
                leadingIcon = { Icon(vehicleTypeIcon(v.type), null, Modifier.size(18.dp)) },
            )
        }
        AssistChip(onClick = onAdd, label = { Text(stringResource(R.string.vehicle_add)) }, leadingIcon = { Icon(Icons.Filled.Add, null, Modifier.size(18.dp)) }, modifier = Modifier.testTag("add_vehicle_chip"))
    }
}
