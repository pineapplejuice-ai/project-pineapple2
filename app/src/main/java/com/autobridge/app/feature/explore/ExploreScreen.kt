@file:OptIn(ExperimentalMaterial3Api::class)

package com.autobridge.app.feature.explore

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.autobridge.app.R
import com.autobridge.app.core.ui.components.*
import com.autobridge.app.core.ui.sortLabel
import com.autobridge.core.domain.partner.PartnerFilter
import com.autobridge.core.domain.partner.PartnerSort

@Composable
fun ExploreScreen(onOpenPartner: (String) -> Unit, vm: ExploreViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    var sortMenu by remember { mutableStateOf(false) }
    Scaffold(topBar = { AppTopBar(stringResource(R.string.explore_title, s.locationTitle ?: stringResource(R.string.location_current))) }) { p ->
        LazyColumn(Modifier.padding(p).fillMaxSize().testTag("explore_list"), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                OutlinedTextField(
                    value = s.filter.query, onValueChange = vm::onQuery, singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, null) },
                    trailingIcon = { if (s.filter.query.isNotEmpty()) IconButton(onClick = { vm.onQuery("") }) { Icon(Icons.Filled.Close, stringResource(R.string.clear)) } },
                    placeholder = { Text(stringResource(R.string.explore_search_hint)) },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag("explore_search"),
                )
            }
            item { CategoryRow(s.filter.category, vm::onCategory, showAll = true) }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box {
                        AssistChip(onClick = { sortMenu = true }, label = { Text(stringResource(sortLabel(s.filter.sort))) }, leadingIcon = { Icon(Icons.Filled.Sort, null, Modifier.size(18.dp)) })
                        DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                            PartnerSort.entries.forEach { o -> DropdownMenuItem(text = { Text(stringResource(sortLabel(o))) }, onClick = { vm.onSort(o); sortMenu = false }) }
                        }
                    }
                    PartnerFilter.RADIUS_OPTIONS.forEach { r ->
                        FilterChip(selected = s.filter.radiusKm == r, onClick = { vm.onRadius(r) }, label = { Text(stringResource(R.string.explore_radius, r.toInt())) })
                    }
                    FilterChip(selected = s.filter.openNowOnly, onClick = vm::toggleOpenNow, label = { Text(stringResource(R.string.open_now)) })
                    FilterChip(selected = s.filter.verifiedOnly, onClick = vm::toggleVerified, label = { Text(stringResource(R.string.explore_verified)) })
                    if (s.vehicle != null) FilterChip(
                        selected = s.filter.brandCompatibleOnly, onClick = vm::toggleBrandCompatible,
                        label = { Text(stringResource(R.string.explore_fits_vehicle, s.vehicle?.displayName.orEmpty())) },
                    )
                }
            }
            when {
                s.loading -> item { Box(Modifier.fillParentMaxHeight(0.6f)) { LoadingState() } }
                s.error != null -> item { ErrorState(s.error, { vm.onQuery(s.filter.query) }) }
                s.results.isEmpty() -> item { EmptyState(Icons.Filled.Explore, stringResource(R.string.explore_empty_title), stringResource(R.string.explore_empty_body)) }
                else -> {
                    item { Text(stringResource(R.string.explore_count, s.results.size), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 16.dp)) }
                    items(s.results, key = { it.partner.id }) { rp ->
                        PartnerListCard(rp, rp.partner.id in s.favouriteIds, { vm.toggleFavourite(rp.partner.id) }, { onOpenPartner(rp.partner.id) }, Modifier.testTag("partner_${rp.partner.id}"))
                    }
                }
            }
            if (s.placesEnabled && s.suggestions.isNotEmpty()) {
                item {
                    SectionHeader(stringResource(R.string.explore_suggestions))
                    Text(stringResource(R.string.explore_suggestions_body), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp))
                }
                items(s.suggestions, key = { it.partner.id }) { rp ->
                    val requested = (rp.partner.placeId ?: rp.partner.id) in s.requestedPlaceIds
                    Column {
                        PartnerListCard(rp, false, {}, {})
                        OutlinedButton(onClick = { vm.requestShop(rp.partner) }, enabled = !requested, modifier = Modifier.padding(horizontal = 16.dp)) {
                            Text(stringResource(if (requested) R.string.explore_requested else R.string.explore_request_shop))
                        }
                    }
                }
            }
        }
    }
}
