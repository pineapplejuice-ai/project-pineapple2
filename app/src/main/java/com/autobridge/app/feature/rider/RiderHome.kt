package com.autobridge.app.feature.rider

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Motorcycle
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.autobridge.app.R
import com.autobridge.app.core.ui.components.*
import com.autobridge.app.core.ui.statusTitleRes
import com.autobridge.core.domain.repository.AuthRepository
import com.autobridge.core.domain.repository.BookingRepository
import com.autobridge.core.domain.repository.Clock
import com.autobridge.core.model.Actor
import com.autobridge.core.model.Booking
import com.autobridge.core.model.TripFlow
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import javax.inject.Inject

data class RiderHomeUiState(val loading: Boolean = true, val today: List<Booking> = emptyList(), val upcoming: List<Booking> = emptyList(), val linked: Boolean = true)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class RiderHomeViewModel @Inject constructor(auth: AuthRepository, bookings: BookingRepository, clock: Clock) : ViewModel() {
    val state: StateFlow<RiderHomeUiState> = auth.currentUser.map { it?.riderId }.distinctUntilChanged().flatMapLatest { rid ->
        if (rid == null) flowOf(RiderHomeUiState(loading = false, linked = false))
        else bookings.observeRiderBookings(rid).map { list ->
            val active = list.filter { it.isActive }
            val today = clock.todayEpochDay()
            // Overdue jobs from earlier days stay in "today" until they're finished.
            RiderHomeUiState(false, active.filter { it.slot.epochDay <= today }, active.filter { it.slot.epochDay > today })
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), RiderHomeUiState())
}

@Composable
fun RiderHomeScreen(onOpenJob: (String) -> Unit, onOpenProfile: () -> Unit, vm: RiderHomeViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        AppTopBar(stringResource(R.string.rider_title)) {
            IconButton(onClick = onOpenProfile, modifier = Modifier.testTag("open_profile")) { Icon(Icons.Filled.AccountCircle, stringResource(R.string.tab_profile)) }
        }
    }) { p ->
        when {
            s.loading -> LoadingState(Modifier.padding(p))
            !s.linked -> EmptyState(Icons.Filled.Motorcycle, stringResource(R.string.rider_not_linked), "", Modifier.padding(p))
            s.today.isEmpty() && s.upcoming.isEmpty() -> EmptyState(Icons.Filled.Motorcycle, stringResource(R.string.rider_no_jobs), stringResource(R.string.rider_no_jobs_body), Modifier.padding(p))
            else -> LazyColumn(Modifier.padding(p), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { SectionHeader(stringResource(R.string.rider_today, s.today.size)) }
                items(s.today, key = { it.id }) { b -> RiderJobCard(b, onOpenJob) }
                if (s.upcoming.isNotEmpty()) item { SectionHeader(stringResource(R.string.rider_upcoming)) }
                items(s.upcoming, key = { it.id }) { b -> RiderJobCard(b, onOpenJob) }
            }
        }
    }
}

@Composable
private fun RiderJobCard(b: Booking, onOpenJob: (String) -> Unit) {
    val next = TripFlow.next(b)
    BookingSummaryCard(b, { onOpenJob(b.id) }, Modifier.testTag("rider_job_${b.id}")) {
        if (next != null && TripFlow.actorFor(b.tripType, next) == Actor.RIDER) {
            Text(stringResource(R.string.rider_next, stringResource(statusTitleRes(next, b.tripType))), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        }
    }
}
