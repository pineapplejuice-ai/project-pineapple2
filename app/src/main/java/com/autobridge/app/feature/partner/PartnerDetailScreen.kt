package com.autobridge.app.feature.partner

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.autobridge.app.R
import com.autobridge.app.core.ui.*
import com.autobridge.app.core.ui.components.*
import com.autobridge.app.core.ui.theme.SuccessGreen
import java.time.DayOfWeek
import java.time.format.TextStyle
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PartnerDetailScreen(onBack: () -> Unit, onBook: (partnerId: String, packageId: String?) -> Unit, vm: PartnerDetailViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val p = s.partner
    Scaffold(
        topBar = {
            AppTopBar(p?.name ?: "", onBack) {
                if (p != null) FavouriteButton(s.isFavourite, vm::toggleFavourite)
            }
        },
        bottomBar = {
            if (p != null && p.canTakeBookings) Surface(tonalElevation = 3.dp) {
                Button(
                    onClick = { onBook(p.id, null) }, enabled = s.compatible,
                    modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp).testTag("book_partner"),
                ) { Text(stringResource(R.string.partner_book_pickup)) }
            }
        },
    ) { pad ->
        when {
            s.loading -> LoadingState(Modifier.padding(pad))
            p == null -> EmptyState(Icons.Filled.Storefront, stringResource(R.string.partner_not_found), "", Modifier.padding(pad))
            else -> LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    if (p.photoUrls.isEmpty()) {
                        PhotoPlaceholder(categoryIcon(p.primaryCategory), Modifier.fillMaxWidth().height(180.dp), p.id.hashCode())
                    } else LazyRow(contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(p.photoUrls) { url ->
                            AsyncImage(model = url, contentDescription = stringResource(R.string.partner_photo), modifier = Modifier.size(240.dp, 160.dp).clip(RoundedCornerShape(12.dp)))
                        }
                    }
                }
                item {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(p.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            if (p.verified) Icon(Icons.Filled.Verified, stringResource(R.string.verified), tint = MaterialTheme.colorScheme.secondary)
                        }
                        Text(categoriesText(p.categories), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            RatingBadge(p.rating, p.reviewCount)
                            s.distanceKm?.let { Text(distance(it), style = MaterialTheme.typography.labelLarge) }
                            Text(stringResource(if (s.isOpenNow) R.string.open_now else R.string.closed_now), color = if (s.isOpenNow) SuccessGreen else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelLarge)
                        }
                        Text(stringResource(R.string.partner_rating_source), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        GoogleRatingLabel(p.googleRating, p.googleReviewCount)
                        Text(p.address, style = MaterialTheme.typography.bodySmall)
                        if (p.description.isNotBlank()) Text(p.description, style = MaterialTheme.typography.bodyMedium)
                        if (!s.compatible) {
                            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                                Text(stringResource(R.string.partner_incompatible, s.vehicle?.displayName.orEmpty()), modifier = Modifier.padding(12.dp))
                            }
                        }
                        if (!p.canTakeBookings) InfoPill(stringResource(R.string.not_on_autobridge))
                    }
                }
                item {
                    FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { Intents.directions(context, p.location, p.name) }) { Icon(Icons.Filled.Directions, null); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.directions)) }
                        if (p.phone.isNotBlank()) OutlinedButton(onClick = { Intents.dial(context, p.phone) }) { Icon(Icons.Filled.Call, null); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.call)) }
                        if (p.whatsapp.isNotBlank()) OutlinedButton(onClick = { Intents.whatsApp(context, p.whatsapp) }) { Icon(Icons.Filled.Chat, null); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.whatsapp)) }
                    }
                }
                item { SectionHeader(stringResource(R.string.partner_packages)) }
                if (s.packages.isEmpty()) item {
                    Text(stringResource(R.string.partner_no_packages), modifier = Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodyMedium)
                }
                items(s.packages, key = { it.id }) { pkg ->
                    PackageCard(
                        pkg, onSelect = if (p.canTakeBookings && s.compatible) ({ onBook(p.id, pkg.id) }) else null,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp).testTag("package_${pkg.id}"),
                    )
                }
                item {
                    SectionHeader(stringResource(R.string.partner_hours))
                    Column(Modifier.padding(horizontal = 16.dp)) {
                        (1..7).forEach { d ->
                            val h = p.hours.forDay(d)
                            Row {
                                Text(
                                    DayOfWeek.of(d).getDisplayName(TextStyle.FULL, Locale.getDefault()), Modifier.weight(1f),
                                    fontWeight = if (d == s.todayDayOfWeek) FontWeight.Bold else FontWeight.Normal,
                                )
                                Text(
                                    when {
                                        h == null -> stringResource(R.string.partner_closed)
                                        h.openMinute == 0 && h.closeMinute >= 24 * 60 -> stringResource(R.string.partner_open_24h)
                                        else -> "${minutesLabel(h.openMinute)} – ${minutesLabel(h.closeMinute)}"
                                    },
                                    fontWeight = if (d == s.todayDayOfWeek) FontWeight.Bold else FontWeight.Normal,
                                )
                            }
                        }
                    }
                }
                item { SectionHeader(stringResource(R.string.partner_reviews)) }
                if (s.reviews.isEmpty()) item { Text(stringResource(R.string.partner_no_reviews), Modifier.padding(horizontal = 16.dp)) }
                items(s.reviews, key = { it.id }) { r ->
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(r.authorName, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            Text("★".repeat(r.rating), color = MaterialTheme.colorScheme.primary)
                        }
                        Text(r.text, style = MaterialTheme.typography.bodyMedium)
                        Text(dateTime(r.createdAtMillis), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
