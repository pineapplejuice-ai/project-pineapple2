package com.autobridge.app.core.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.autobridge.app.R
import com.autobridge.app.core.ui.*
import com.autobridge.app.core.ui.theme.SuccessGreen
import com.autobridge.core.domain.partner.RankedPartner
import com.autobridge.core.model.*

@Composable
fun FavouriteButton(isFavourite: Boolean, onToggle: () -> Unit) {
    IconButton(onClick = onToggle) {
        Icon(
            if (isFavourite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            contentDescription = stringResource(if (isFavourite) R.string.favourite_remove else R.string.favourite_add),
            tint = if (isFavourite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun PartnerMeta(p: RankedPartner) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (p.partner.source == PartnerSource.AUTOBRIDGE) RatingBadge(p.partner.rating, p.partner.reviewCount)
        Text(distance(p.distanceKm), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            stringResource(if (p.isOpenNow) R.string.open_now else R.string.closed_now),
            style = MaterialTheme.typography.labelMedium,
            color = if (p.isOpenNow) SuccessGreen else MaterialTheme.colorScheme.error,
        )
    }
}

/** Full-width partner row for lists (Explore, favourites, brand centres). */
@Composable
fun PartnerListCard(p: RankedPartner, isFavourite: Boolean, onToggleFavourite: () -> Unit, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(onClick = onClick, modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Row(Modifier.padding(12.dp)) {
            PhotoPlaceholder(categoryIcon(p.partner.primaryCategory), Modifier.size(84.dp).clip(RoundedCornerShape(12.dp)), p.partner.id.hashCode())
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.partner.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
                        maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (p.partner.verified) Icon(Icons.Filled.Verified, stringResource(R.string.verified), tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(18.dp))
                }
                Text(
                    categoriesText(p.partner.categories),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                )
                Spacer(Modifier.height(4.dp))
                PartnerMeta(p)
                if (p.partner.source == PartnerSource.GOOGLE_PLACES) {
                    Spacer(Modifier.height(4.dp))
                    InfoPill(stringResource(R.string.not_on_autobridge))
                    GoogleRatingLabel(p.partner.googleRating, p.partner.googleReviewCount)
                } else p.startingPrice?.let {
                    Spacer(Modifier.height(2.dp))
                    Text(stringResource(R.string.from_price, rupees(it)), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
            }
            if (p.partner.source == PartnerSource.AUTOBRIDGE) FavouriteButton(isFavourite, onToggleFavourite)
        }
    }
}

@Composable
fun categoriesText(categories: List<PartnerCategory>): String = categories.map { stringResource(categoryLabel(it)) }.joinToString(" · ")

/** Compact card for horizontal storefront carousels. */
@Composable
fun PartnerCarouselCard(p: RankedPartner, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.width(220.dp)) {
        Column {
            PhotoPlaceholder(categoryIcon(p.partner.primaryCategory), Modifier.fillMaxWidth().height(100.dp), p.partner.id.hashCode())
            Column(Modifier.padding(10.dp)) {
                Text(p.partner.name, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                PartnerMeta(p)
                p.startingPrice?.let {
                    Text(stringResource(R.string.from_price, rupees(it)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
fun CategoryRow(selected: PartnerCategory?, onSelect: (PartnerCategory?) -> Unit, modifier: Modifier = Modifier, showAll: Boolean = false) {
    Row(modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (showAll) FilterChip(selected = selected == null, onClick = { onSelect(null) }, label = { Text(stringResource(R.string.all)) })
        PartnerCategory.entries.forEach { c ->
            FilterChip(
                selected = selected == c,
                onClick = { onSelect(if (selected == c && showAll) null else c) },
                label = { Text(stringResource(categoryLabel(c))) },
                leadingIcon = { Icon(categoryIcon(c), null, Modifier.size(18.dp)) },
            )
        }
    }
}

/** Big tappable category tiles for the Home storefront. */
@Composable
fun CategoryTiles(onSelect: (PartnerCategory) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        PartnerCategory.entries.forEach { c ->
            Column(
                Modifier.width(76.dp).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button) { onSelect(c) }.padding(4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(56.dp)) {
                    Box(contentAlignment = Alignment.Center) { Icon(categoryIcon(c), null, tint = MaterialTheme.colorScheme.onPrimaryContainer) }
                }
                Spacer(Modifier.height(4.dp))
                Text(stringResource(categoryLabel(c)), style = MaterialTheme.typography.labelSmall, maxLines = 2, minLines = 2)
            }
        }
    }
}

@Composable
fun PackageCard(pkg: ServicePackage, onSelect: (() -> Unit)?, modifier: Modifier = Modifier, selected: Boolean = false, actionLabel: String? = null) {
    OutlinedCard(
        modifier = modifier.fillMaxWidth(),
        colors = if (selected) CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.primaryContainer) else CardDefaults.outlinedCardColors(),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(pkg.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f, fill = false))
                    if (pkg.popular) { Spacer(Modifier.width(6.dp)); InfoPill(stringResource(R.string.popular), maxLines = 1) }
                }
                Text(
                    if (pkg.priceType == PriceType.FIXED) rupees(pkg.price) else stringResource(R.string.from_price, rupees(pkg.price)),
                    style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold,
                )
                Text(
                    durationLabel(pkg.durationMinutes) + if (pkg.priceType == PriceType.FIXED) " · " + stringResource(R.string.fixed_price) else " · " + stringResource(R.string.final_after_inspection),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (pkg.inclusions.isNotEmpty()) Text(pkg.inclusions.joinToString(" · "), style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (onSelect != null) {
                Spacer(Modifier.width(8.dp))
                if (selected) Icon(Icons.Filled.CheckCircle, stringResource(R.string.selected), tint = MaterialTheme.colorScheme.primary)
                else FilledTonalButton(onClick = onSelect) { Text(actionLabel ?: stringResource(R.string.book)) }
            }
        }
    }
}

@Composable
fun PriceBreakdownCard(breakdown: PriceBreakdown, modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(stringResource(R.string.price_breakdown), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            breakdown.lines.forEach { line ->
                Row {
                    val qty = when (line.kind) {
                        PriceLine.Kind.EXTRA_DISTANCE -> " · " + stringResource(R.string.price_extra_km_qty, line.quantity)
                        PriceLine.Kind.LOGISTICS -> " · " + stringResource(R.string.price_legs_qty, line.quantity)
                        else -> ""
                    }
                    Text(stringResource(priceLineLabel(line.kind)) + qty, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Text(rupees(line.amount), style = MaterialTheme.typography.bodyMedium)
                }
            }
            HorizontalDivider()
            Row {
                Text(stringResource(if (breakdown.isEstimate) R.string.price_total_estimate else R.string.price_total), Modifier.weight(1f), fontWeight = FontWeight.Bold)
                Text(rupees(breakdown.total), fontWeight = FontWeight.Bold)
            }
            if (breakdown.isEstimate) Text(stringResource(R.string.price_estimate_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Vertical timeline of the booking's flow; done steps show their time. */
@Composable
fun StatusTimeline(booking: Booking, modifier: Modifier = Modifier) {
    val steps = TripFlow.steps(booking)
    val currentIndex = steps.indexOf(booking.status)
    Column(modifier) {
        if (booking.status == BookingStatus.CANCELLED || booking.status == BookingStatus.DECLINED) {
            TimelineRow(stringResource(statusTitleRes(booking.status, booking.tripType)), booking.history.lastOrNull()?.atMillis, done = true, current = true, isLast = true, error = true)
            return@Column
        }
        steps.forEachIndexed { i, s ->
            val event = booking.history.lastOrNull { it.status == s }
            TimelineRow(stringResource(statusTitleRes(s, booking.tripType)), event?.atMillis, done = i <= currentIndex, current = i == currentIndex, isLast = i == steps.lastIndex)
        }
    }
}

@Composable
private fun TimelineRow(title: String, atMillis: Long?, done: Boolean, current: Boolean, isLast: Boolean, error: Boolean = false) {
    val color = when {
        error -> MaterialTheme.colorScheme.error
        done -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.outlineVariant
    }
    Row(Modifier.height(IntrinsicSize.Min)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(24.dp)) {
            Icon(if (done) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked, null, tint = color, modifier = Modifier.size(20.dp))
            if (!isLast) VerticalDivider(Modifier.weight(1f).padding(vertical = 2.dp), color = color)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.padding(bottom = 14.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = if (current) FontWeight.Bold else FontWeight.Normal,
                color = if (done) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            if (atMillis != null && done) Text(dateTime(atMillis), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun BookingStatusChip(booking: Booking) {
    val (container, content) = when {
        booking.status == BookingStatus.CANCELLED || booking.status == BookingStatus.DECLINED -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
        booking.status == BookingStatus.COMPLETED -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
        else -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
    }
    InfoPill(stringResource(statusTitleRes(booking.status, booking.tripType)), container = container, content = content)
}

/** Compact booking summary used in lists and the Home "ongoing booking" card. */
@Composable
fun BookingSummaryCard(booking: Booking, onClick: () -> Unit, modifier: Modifier = Modifier, trailing: @Composable (() -> Unit)? = null) {
    Card(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(vehicleTypeIcon(booking.vehicle.type), null, Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(booking.partner.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                BookingStatusChip(booking)
            }
            Text(
                "${booking.vehicle.name} · ${RegistrationNumber.format(booking.vehicle.registrationNumber)}",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "${epochDayLabel(booking.slot.epochDay)} · ${booking.slot.slot?.label.orEmpty()} · ${stringResource(tripTypeLabel(booking.tripType))}",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(booking.id, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                Text(rupees(booking.price.total), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }
            trailing?.invoke()
        }
    }
}
