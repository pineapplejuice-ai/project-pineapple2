package com.autobridge.app.feature.booking

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.core.data.AppJson
import com.autobridge.core.data.Ids
import com.autobridge.core.domain.booking.*
import com.autobridge.core.domain.partner.PartnerFilter
import com.autobridge.core.domain.partner.PartnerSearch
import com.autobridge.core.domain.partner.RankedPartner
import com.autobridge.core.domain.pricing.PriceQuote
import com.autobridge.core.domain.repository.*
import com.autobridge.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

/** Everything the user picked, as ids. Persisted in SavedStateHandle so the stepper survives process death. */
@Serializable
data class BookingSelection(
    val step: BookingStep = BookingStep.VEHICLE,
    val vehicleId: String? = null,
    val partnerId: String? = null,
    val partnerQuery: String = "",
    val packageId: String? = null,
    val issues: List<String> = emptyList(),
    val notes: String = "",
    val photoUris: List<String> = emptyList(),
    val tripType: TripType = TripType.PICKUP_AND_DROP,
    val pickupAddressId: String? = null,
    val dropAddressId: String? = null,
    val jobCardNumber: String = "",
    val epochDay: Long? = null,
    val slotId: String? = null,
    val showErrors: Boolean = false,
    val initialised: Boolean = false,
)

data class SlotOption(val slot: TimeSlot, val full: Boolean, val past: Boolean) {
    val enabled: Boolean get() = !full && !past
}

data class BookingFlowUiState(
    val loading: Boolean = true,
    val selection: BookingSelection = BookingSelection(),
    val draft: BookingDraft = BookingDraft(),
    val vehicles: List<Vehicle> = emptyList(),
    val partners: List<RankedPartner> = emptyList(),
    val packages: List<ServicePackage> = emptyList(),
    val issueOptions: List<String> = emptyList(),
    val addresses: List<SavedAddress> = emptyList(),
    val days: List<Long> = emptyList(),
    val slots: List<SlotOption> = emptyList(),
    val quote: PriceQuote? = null,
    val errors: List<DraftError> = emptyList(),
    val submitting: Boolean = false,
    val submitError: String? = null,
    val bookedId: String? = null,
) {
    val step: BookingStep get() = selection.step
    val visibleErrors: List<DraftError> get() = if (selection.showErrors) errors else emptyList()
}

private const val KEY = "booking_selection"

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class BookingFlowViewModel @Inject constructor(
    private val savedState: SavedStateHandle,
    private val auth: AuthRepository,
    vehicleRepo: VehicleRepository,
    addressRepo: AddressRepository,
    partnerRepo: PartnerRepository,
    private val bookings: BookingRepository,
    private val photos: PhotoUploader,
    private val factory: BookingFactory,
    private val search: PartnerSearch,
    private val clock: Clock,
) : ViewModel() {

    private val selection = MutableStateFlow(
        savedState.get<String>(KEY)?.let { runCatching { AppJson.decodeFromString(BookingSelection.serializer(), it) }.getOrNull() }
            ?: BookingSelection(partnerId = savedState["partnerId"], packageId = savedState["packageId"]),
    )
    private val submit = MutableStateFlow(Triple(false, null as String?, null as String?)) // submitting, error, bookedId

    private val selectedVehicleId = vehicleRepo.observeSelectedVehicleId()

    private val slotCounts: Flow<Map<String, Int>> = selection.map { it.partnerId to it.epochDay }.distinctUntilChanged()
        .flatMapLatest { (pid, day) ->
            if (pid == null || day == null) flowOf(emptyMap()) else flow { emit(runCatching { bookings.bookedCounts(pid, day) }.getOrDefault(emptyMap())) }
        }

    init {
        // One-time prefill: default vehicle, home address, and "Book again" from a previous booking.
        viewModelScope.launch {
            if (selection.value.initialised) return@launch
            val vehicles = vehicleRepo.observeVehicles().first()
            val selectedId = selectedVehicleId.first()
            val addresses = addressRepo.observeAddresses().first()
            val rebook = savedState.get<String>("rebookId")?.let { bookings.observeBooking(it).first() }
            val home = addresses.firstOrNull { it.label == AddressLabel.HOME } ?: addresses.firstOrNull()
            update { s ->
                var n = s.copy(
                    initialised = true,
                    vehicleId = s.vehicleId ?: rebook?.vehicle?.vehicleId?.takeIf { id -> vehicles.any { it.id == id } } ?: selectedId ?: vehicles.firstOrNull()?.id,
                    partnerId = s.partnerId ?: rebook?.partner?.partnerId,
                    packageId = s.packageId ?: rebook?.servicePackage?.packageId,
                    issues = rebook?.issues ?: s.issues,
                    tripType = rebook?.tripType ?: s.tripType,
                    pickupAddressId = rebook?.pickupAddress?.id?.takeIf { id -> addresses.any { it.id == id } } ?: home?.id,
                    dropAddressId = rebook?.dropAddress?.id?.takeIf { id -> addresses.any { it.id == id } } ?: home?.id,
                    epochDay = clock.todayEpochDay() + 1,
                )
                n = n.copy(step = when {
                    n.vehicleId == null -> BookingStep.VEHICLE
                    n.partnerId == null -> BookingStep.PARTNER
                    else -> BookingStep.SERVICE
                })
                n
            }
        }
    }

    val state: StateFlow<BookingFlowUiState> = combine(
        selection,
        combine(vehicleRepo.observeVehicles(), addressRepo.observeAddresses(), addressRepo.observeCurrentLocation()) { v, a, l -> Triple(v, a, l) },
        combine(partnerRepo.observePartners(), partnerRepo.observePackages()) { p, k -> p to k },
        slotCounts,
        submit,
    ) { sel, (vehicles, addresses, location), (partners, packages), counts, (submitting, submitError, bookedId) ->
        val vehicle = vehicles.firstOrNull { it.id == sel.vehicleId }
        val partner = partners.firstOrNull { it.id == sel.partnerId }
        val partnerPackages = packages.filter { it.partnerId == partner?.id && (vehicle == null || it.vehicleType == vehicle.type) }
        val draft = BookingDraft(
            vehicle = vehicle, partner = partner,
            servicePackage = partnerPackages.firstOrNull { it.id == sel.packageId },
            issues = sel.issues, notes = sel.notes, photoUris = sel.photoUris, tripType = sel.tripType,
            pickupAddress = addresses.firstOrNull { it.id == sel.pickupAddressId },
            dropAddress = addresses.firstOrNull { it.id == sel.dropAddressId },
            jobCardNumber = sel.jobCardNumber, epochDay = sel.epochDay, slotId = sel.slotId,
        )
        val today = clock.todayEpochDay()
        val nowHour = clock.minuteOfDay() / 60
        val capacity = partner?.slotCapacity ?: 3
        val full = SlotRules.fullSlots(counts, capacity)
        val ranked = if (vehicle == null) emptyList() else search.search(
            partners.filter { it.canTakeBookings }, packages,
            PartnerFilter(query = sel.partnerQuery, vehicle = vehicle, radiusKm = 25.0),
            location?.point ?: GeoPoint.BENGALURU, clock.dayOfWeek(), clock.minuteOfDay(),
        )
        BookingFlowUiState(
            loading = !sel.initialised,
            selection = sel,
            draft = draft,
            vehicles = vehicles,
            partners = ranked,
            packages = partnerPackages,
            issueOptions = Checklists.issuesFor(vehicle?.type ?: VehicleType.CAR),
            addresses = addresses,
            days = SlotRules.days(today),
            slots = TimeSlot.ALL.map { SlotOption(it, it.id in full, sel.epochDay?.let { d -> SlotRules.isPast(d, it.id, today, nowHour) } ?: false) },
            quote = factory.quote(draft),
            errors = BookingDraftValidator.errorsFor(sel.step, draft, full, today, nowHour),
            submitting = submitting, submitError = submitError, bookedId = bookedId,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), BookingFlowUiState())

    private fun update(f: (BookingSelection) -> BookingSelection) {
        val n = f(selection.value)
        selection.value = n
        savedState[KEY] = AppJson.encodeToString(BookingSelection.serializer(), n)
    }

    fun selectVehicle(id: String) = update { it.copy(vehicleId = id, packageId = null, showErrors = false) }
    fun onPartnerQuery(q: String) = update { it.copy(partnerQuery = q) }
    fun selectPartner(id: String) = update { it.copy(partnerId = id, packageId = null, slotId = null, showErrors = false) }
    fun selectPackage(id: String?) = update { it.copy(packageId = if (it.packageId == id) null else id, showErrors = false) }
    fun toggleIssue(issue: String) = update { s -> s.copy(issues = if (issue in s.issues) s.issues - issue else s.issues + issue, showErrors = false) }
    fun onNotes(v: String) = update { it.copy(notes = v.take(500)) }
    fun addPhotos(uris: List<String>) = update { it.copy(photoUris = (it.photoUris + uris).distinct().take(BookingDraftValidator.MAX_PHOTOS)) }
    fun removePhoto(uri: String) = update { it.copy(photoUris = it.photoUris - uri) }
    fun selectTripType(t: TripType) = update { it.copy(tripType = t, showErrors = false) }
    fun selectPickup(id: String) = update { s -> s.copy(pickupAddressId = id, dropAddressId = s.dropAddressId ?: id) }
    fun selectDrop(id: String) = update { it.copy(dropAddressId = id) }
    fun onJobCard(v: String) = update { it.copy(jobCardNumber = v.take(30)) }
    fun selectDay(d: Long) = update { it.copy(epochDay = d, slotId = null) }
    fun selectSlot(id: String) = update { it.copy(slotId = id, showErrors = false) }
    fun goTo(step: BookingStep) = update { if (step.ordinal <= it.step.ordinal) it.copy(step = step, showErrors = false) else it }

    /** Validates the current step; advances if valid, otherwise reveals errors. */
    fun next() {
        val s = state.value
        if (s.errors.isNotEmpty()) { update { it.copy(showErrors = true) }; return }
        val nextStep = BookingStep.entries.getOrNull(s.step.ordinal + 1) ?: return
        update { it.copy(step = nextStep, showErrors = false) }
    }

    /** Returns false when on the first step (screen should close). */
    fun back(): Boolean {
        val prev = BookingStep.entries.getOrNull(selection.value.step.ordinal - 1) ?: return false
        update { it.copy(step = prev, showErrors = false) }
        return true
    }

    fun confirm() {
        val s = state.value
        val user = auth.currentUser.value ?: return
        if (s.submitting) return
        if (s.errors.isNotEmpty()) { update { it.copy(showErrors = true) }; return }
        submit.value = Triple(true, null, null)
        viewModelScope.launch {
            val id = Ids.bookingRef()
            val uploaded = s.draft.photoUris.mapIndexed { i, uri -> runCatching { photos.upload(uri, "bookings/$id/customer_$i.jpg") }.getOrDefault(uri) }
            val booking = factory.create(s.draft.copy(photoUris = uploaded), id, user, clock.nowMillis())
            if (booking == null) { submit.value = Triple(false, "invalid", null); return@launch }
            bookings.create(booking)
                .onSuccess { b -> savedState.remove<String>(KEY); submit.value = Triple(false, null, b.id) }
                .onFailure { e -> submit.value = Triple(false, e.message ?: "error", null) }
        }
    }
}
