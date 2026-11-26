package com.autobridge.app.feature.bookings

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.core.domain.booking.BookingActions
import com.autobridge.core.domain.booking.SlotRules
import com.autobridge.core.domain.pricing.PricingEngine
import com.autobridge.core.domain.repository.*
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class HistoryFilter { ACTIVE, COMPLETED, CANCELLED, ALL }

data class BookingsUiState(val loading: Boolean = true, val filter: HistoryFilter = HistoryFilter.ACTIVE, val bookings: List<Booking> = emptyList(), val counts: Map<HistoryFilter, Int> = emptyMap())

fun HistoryFilter.matches(b: Booking): Boolean = when (this) {
    HistoryFilter.ACTIVE -> b.isActive
    HistoryFilter.COMPLETED -> b.status == BookingStatus.COMPLETED
    HistoryFilter.CANCELLED -> b.status == BookingStatus.CANCELLED || b.status == BookingStatus.DECLINED
    HistoryFilter.ALL -> true
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class BookingsViewModel @Inject constructor(auth: AuthRepository, repo: BookingRepository) : ViewModel() {
    private val filter = MutableStateFlow(HistoryFilter.ACTIVE)
    val state: StateFlow<BookingsUiState> = combine(
        auth.currentUser.flatMapLatest { u -> if (u == null) flowOf(emptyList()) else repo.observeCustomerBookings(u.id) },
        filter,
    ) { list, f ->
        BookingsUiState(false, f, list.filter { f.matches(it) }, HistoryFilter.entries.associateWith { hf -> list.count { hf.matches(it) } })
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), BookingsUiState())

    fun setFilter(f: HistoryFilter) { filter.value = f }
}

data class RescheduleState(val days: List<Long>, val epochDay: Long, val slots: List<Pair<TimeSlot, Boolean>>, val slotId: String? = null)

data class BookingDetailUiState(
    val loading: Boolean = true,
    val booking: Booking? = null,
    val cancellationFee: Int = 0,
    val canCancel: Boolean = false,
    val canReschedule: Boolean = false,
    val canRate: Boolean = false,
    val canApproveEstimate: Boolean = false,
    val showNotificationPrompt: Boolean = false,
    val reschedule: RescheduleState? = null,
    val message: String? = null,
)

@HiltViewModel
class BookingDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: BookingRepository,
    private val actions: BookingActions,
    private val pricing: PricingEngine,
    private val settings: SettingsRepository,
    private val clock: Clock,
) : ViewModel() {
    private val bookingId: String = checkNotNull(savedState["bookingId"])
    private val justBooked: Boolean = savedState["justBooked"] ?: false
    private val reschedule = MutableStateFlow<RescheduleState?>(null)
    private val message = MutableStateFlow<String?>(null)
    private val promptDismissed = MutableStateFlow(false)

    val state: StateFlow<BookingDetailUiState> = combine(
        repo.observeBooking(bookingId), settings.observeNotificationPromptShown(), reschedule, message, promptDismissed,
    ) { b, promptShown, r, m, dismissed ->
        BookingDetailUiState(
            loading = false,
            booking = b,
            cancellationFee = b?.let { pricing.cancellationFee(it) } ?: 0,
            canCancel = b != null && BookingRules.canCancel(b),
            canReschedule = b != null && BookingRules.canReschedule(b),
            canRate = b != null && BookingRules.canRate(b),
            canApproveEstimate = b != null && BookingRules.canApproveEstimate(b),
            // Ask for notification permission right after the first booking only.
            showNotificationPrompt = justBooked && !promptShown && !dismissed,
            reschedule = r,
            message = m,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), BookingDetailUiState())

    private fun save(updated: Booking?) {
        if (updated == null) { message.value = "not_allowed"; return }
        viewModelScope.launch { repo.update(updated).onFailure { message.value = it.message } }
    }

    private val current: Booking? get() = state.value.booking

    fun cancel(reason: String) { current?.let { save(actions.cancel(it, reason, clock.nowMillis())) } }
    fun decideLine(lineId: String, approved: Boolean) { current?.let { save(actions.decideEstimateLine(it, lineId, approved, clock.nowMillis())) } }
    fun approveAll() { current?.let { save(actions.approveAll(it, clock.nowMillis())) } }
    fun rate(rider: Int?, partner: Int?, comment: String) { current?.let { save(actions.rate(it, rider, partner, comment, clock.nowMillis())) } }

    fun openReschedule() {
        val b = current ?: return
        loadSlots(b, b.slot.epochDay.coerceAtLeast(clock.todayEpochDay()))
    }

    fun rescheduleDay(day: Long) { current?.let { loadSlots(it, day) } }
    fun rescheduleSlot(id: String) = reschedule.update { it?.copy(slotId = id) }
    fun closeReschedule() { reschedule.value = null }

    private fun loadSlots(b: Booking, day: Long) {
        viewModelScope.launch {
            val counts = runCatching { repo.bookedCounts(b.partner.partnerId, day) }.getOrDefault(emptyMap())
                // Our own booking shouldn't block its current slot.
                .let { m -> if (day == b.slot.epochDay) m + (b.slot.slotId to ((m[b.slot.slotId] ?: 1) - 1)) else m }
            val full = SlotRules.fullSlots(counts, 3)
            val today = clock.todayEpochDay()
            val hour = clock.minuteOfDay() / 60
            reschedule.value = RescheduleState(
                SlotRules.days(today), day,
                TimeSlot.ALL.map { it to (it.id !in full && !SlotRules.isPast(day, it.id, today, hour)) },
            )
        }
    }

    fun confirmReschedule() {
        val r = reschedule.value ?: return
        val slot = r.slotId ?: return
        current?.let { save(actions.reschedule(it, BookingSlot(r.epochDay, slot), clock.nowMillis())) }
        reschedule.value = null
    }

    fun notificationPromptHandled() {
        promptDismissed.value = true
        viewModelScope.launch { settings.setNotificationPromptShown() }
    }

    fun clearMessage() { message.value = null }
}
