package com.autobridge.app.feature.jobs

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.core.data.Ids
import com.autobridge.core.domain.booking.BookingActions
import com.autobridge.core.domain.repository.*
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class EstimateDraftLine(val id: String = Ids.new(), val description: String = "", val amount: String = "") {
    val amountValue: Int? get() = amount.toIntOrNull()?.takeIf { it > 0 }
    val isValid: Boolean get() = description.isNotBlank() && amountValue != null
}

data class JobUiState(
    val loading: Boolean = true,
    val booking: Booking? = null,
    val actor: Actor = Actor.OPS,
    /** Default next step in the trip flow and whether this role may perform it now. */
    val next: BookingStatus? = null,
    val canAdvance: Boolean = false,
    /** Walkaround stage that must be completed before [next], if any (rider only). */
    val walkaroundStage: WalkaroundStage? = null,
    val walkaroundComplete: Boolean = true,
    val checklistRequired: Boolean = false,
    val checklistComplete: Boolean = true,
    val canDecline: Boolean = false,
    val canShareEstimate: Boolean = false,
    val estimateDraft: List<EstimateDraftLine> = emptyList(),
    val estimateNote: String = "",
    val riders: List<Rider> = emptyList(),
    val message: String? = null,
)

/** Shared job screen for partner, rider and ops roles; the available actions come from TripFlow. */
@HiltViewModel
class JobViewModel @Inject constructor(
    savedState: SavedStateHandle,
    auth: AuthRepository,
    private val repo: BookingRepository,
    riders: RiderRepository,
    private val actions: BookingActions,
    private val photos: PhotoUploader,
    private val clock: Clock,
) : ViewModel() {
    private val bookingId: String = checkNotNull(savedState["bookingId"])
    private val estimate = MutableStateFlow(listOf(EstimateDraftLine()) to "")
    private val message = MutableStateFlow<String?>(null)

    private val actor: Flow<Actor> = auth.currentUser.map {
        when (it?.role) {
            UserRole.PARTNER -> Actor.PARTNER
            UserRole.RIDER -> Actor.RIDER
            UserRole.CUSTOMER -> Actor.CUSTOMER
            else -> Actor.OPS
        }
    }

    val state: StateFlow<JobUiState> = combine(repo.observeBooking(bookingId), actor, riders.observeRiders(), estimate, message) { b, a, r, (lines, note), m ->
        if (b == null) return@combine JobUiState(loading = false, actor = a, riders = r, message = m)
        val next = TripFlow.next(b)
        // ESTIMATE_SHARED is reached through the estimate editor, not the generic "next" button.
        val canAdvance = next != null && next != BookingStatus.ESTIMATE_SHARED && TripFlow.canTransition(b, next, a)
        val stage = next?.let { TripFlow.walkaroundRequiredFor(b.tripType, it) }?.takeIf { a == Actor.RIDER && canAdvance }
        val checklistRequired = next != null && TripFlow.checklistRequiredFor(next) && a == Actor.RIDER && canAdvance
        JobUiState(
            loading = false, booking = b, actor = a, next = next, canAdvance = canAdvance,
            walkaroundStage = stage, walkaroundComplete = stage == null || b.hasCompleteWalkaround(stage),
            checklistRequired = checklistRequired, checklistComplete = !checklistRequired || b.checklist.all { it.checked },
            canDecline = TripFlow.canTransition(b, BookingStatus.DECLINED, a),
            canShareEstimate = TripFlow.canTransition(b, BookingStatus.ESTIMATE_SHARED, a),
            estimateDraft = lines, estimateNote = note, riders = r, message = m,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), JobUiState())

    private val booking get() = state.value.booking

    private fun save(updated: Booking?, failMessage: String = "not_allowed") {
        if (updated == null) { message.value = failMessage; return }
        viewModelScope.launch { repo.update(updated).onFailure { message.value = it.message } }
    }

    fun advance() {
        val s = state.value
        val b = s.booking ?: return
        val next = s.next ?: return
        if (!s.walkaroundComplete) { message.value = "walkaround"; return }
        if (!s.checklistComplete) { message.value = "checklist"; return }
        save(actions.transition(b, next, s.actor, clock.nowMillis()))
    }

    fun decline() { booking?.let { save(actions.transition(it, BookingStatus.DECLINED, state.value.actor, clock.nowMillis(), "Declined by partner")) } }

    fun overrideStatus(to: BookingStatus) { booking?.let { save(actions.transition(it, to, Actor.OPS, clock.nowMillis(), "Ops override")) } }

    fun assignRider(r: Rider) { booking?.let { save(actions.assignRider(it, r, clock.nowMillis())) } }

    fun setChecklist(itemId: String, checked: Boolean) {
        booking?.let { b -> save(actions.setChecklistItem(b, itemId, checked, b.checklist.firstOrNull { it.id == itemId }?.advisorNote.orEmpty(), clock.nowMillis())) }
    }

    fun addPhoto(stage: WalkaroundStage, angle: PhotoAngle, localUri: String) {
        val b = booking ?: return
        viewModelScope.launch {
            val url = runCatching { photos.upload(localUri, "bookings/${b.id}/${stage.name.lowercase()}_${angle.name.lowercase()}.jpg") }.getOrDefault(localUri)
            // Re-read the latest booking so concurrent photo uploads don't overwrite each other.
            val latest = repo.observeBooking(b.id).first() ?: b
            repo.update(actions.addWalkaroundPhoto(latest, WalkaroundPhoto(stage, angle, url, clock.nowMillis())))
        }
    }

    /** Demo shortcut: fills every angle with a placeholder so the flow can be tested without a camera. */
    fun fillDemoPhotos(stage: WalkaroundStage) {
        var b = booking ?: return
        TripFlow.REQUIRED_ANGLES.forEach { a -> b = actions.addWalkaroundPhoto(b, WalkaroundPhoto(stage, a, "demo://${stage.name}/${a.name}", clock.nowMillis())) }
        save(b)
    }

    fun onEstimateLine(id: String, description: String? = null, amount: String? = null) = estimate.update { (lines, note) ->
        lines.map { if (it.id == id) it.copy(description = description ?: it.description, amount = amount?.filter(Char::isDigit)?.take(7) ?: it.amount) else it } to note
    }
    fun addEstimateLine() = estimate.update { (l, n) -> (l + EstimateDraftLine()) to n }
    fun removeEstimateLine(id: String) = estimate.update { (l, n) -> l.filterNot { it.id == id } to n }
    fun onEstimateNote(v: String) = estimate.update { (l, _) -> l to v.take(300) }

    fun shareEstimate() {
        val b = booking ?: return
        val (lines, note) = estimate.value
        val filled = lines.filter { it.description.isNotBlank() || it.amount.isNotBlank() }
        if (filled.any { !it.isValid }) { message.value = "estimate_invalid"; return }
        save(actions.shareEstimate(b, filled.map { EstimateLine(it.id, it.description.trim(), it.amountValue!!) }, note.trim(), clock.nowMillis()))
    }

    fun clearMessage() { message.value = null }
}
