package com.autobridge.app

import androidx.lifecycle.SavedStateHandle
import com.autobridge.app.core.di.AppConfig
import com.autobridge.app.core.di.AppMode
import com.autobridge.app.feature.booking.BookingFlowViewModel
import com.autobridge.app.feature.explore.ExploreViewModel
import com.autobridge.app.feature.jobs.JobViewModel
import com.autobridge.app.feature.profile.ProfileViewModel
import com.autobridge.app.feature.vehicle.AddVehicleStep
import com.autobridge.app.feature.vehicle.AddVehicleViewModel
import com.autobridge.core.data.InMemoryKeyValueStore
import com.autobridge.core.data.JsonVehicleCatalogueRepository
import com.autobridge.core.data.demo.*
import com.autobridge.core.domain.booking.BookingActions
import com.autobridge.core.domain.booking.BookingFactory
import com.autobridge.core.domain.booking.BookingStep
import com.autobridge.core.domain.partner.PartnerSearch
import com.autobridge.core.domain.pricing.PricingEngine
import com.autobridge.core.model.*
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelTests {
    @get:Rule val main = MainDispatcherRule()

    private val store = InMemoryKeyValueStore()
    private val clock = FixedClock()
    private val pricing = PricingEngine()
    private val actions = BookingActions(pricing)
    private val auth = DemoAuthRepository(store)
    private val vehicles = DemoVehicleRepository(store, clock)
    private val addresses = DemoAddressRepository(store)
    private val partners = DemoPartnerRepository(store, clock)
    private val catalogue = JsonVehicleCatalogueRepository { catalogueJson() }

    private suspend fun signIn(role: UserRole = UserRole.CUSTOMER) {
        auth.sendOtp("9876543210")
        auth.verifyOtp(DemoData.DEMO_OTP)
        auth.updateName("Demo Tester")
        if (role != UserRole.CUSTOMER) auth.setDemoRole(role)
    }

    @Test fun addVehicleFlowValidatesAndSaves() = runTest {
        val vm = AddVehicleViewModel(catalogue, vehicles, clock)
        vm.selectType(VehicleType.CAR)
        assertThat(vm.state.value.step).isEqualTo(AddVehicleStep.BRAND)
        vm.onBrandQuery("tata")
        val tata = vm.state.value.brands.single()
        vm.selectBrand(tata)
        vm.onModelQuery("nexon")
        val nexon = vm.state.value.models.first { it.name == "Nexon" }
        vm.selectModel(nexon)
        assertThat(vm.state.value.step).isEqualTo(AddVehicleStep.FUEL)
        vm.selectFuel(FuelType.DIESEL)
        assertThat(vm.state.value.step).isEqualTo(AddVehicleStep.DETAILS)

        vm.onRegistration("XX 01 AB 1234")
        vm.onYear("2022"); vm.onKm("12000")
        vm.save()
        assertThat(vm.state.value.saved).isFalse()
        assertThat(vm.state.value.registrationError).isEqualTo(RegistrationNumber.Reason.UNKNOWN_STATE)

        vm.onRegistration("22 bh 1234 ab")
        vm.save()
        assertThat(vm.state.value.saved).isTrue()
        val saved = vehicles.observeVehicles().first().last()
        assertThat(saved.registrationNumber).isEqualTo("22BH1234AB")
        assertThat(saved.modelName).isEqualTo("Nexon")
        assertThat(vehicles.observeSelectedVehicleId().first()).isEqualTo(saved.id)
    }

    @Test fun singleFuelModelSkipsFuelStepAndBackWorks() = runTest {
        val vm = AddVehicleViewModel(catalogue, vehicles, clock)
        vm.selectType(VehicleType.BIKE)
        vm.selectBrand(vm.state.value.brands.first { it.id == "ather" })
        vm.selectModel(vm.state.value.models.first())
        assertThat(vm.state.value.step).isEqualTo(AddVehicleStep.DETAILS)
        assertThat(vm.state.value.fuel).isEqualTo(FuelType.ELECTRIC)
        assertThat(vm.back()).isTrue()
        assertThat(vm.state.value.step).isEqualTo(AddVehicleStep.MODEL)
    }

    @Test fun bookingStepperCreatesBooking() = runTest {
        signIn()
        val bookings = DemoBookingRepository(store, clock, actions, backgroundScope)
        val vm = BookingFlowViewModel(
            SavedStateHandle(mapOf("partnerId" to "demo-p01")), auth, vehicles, addresses, partners, bookings,
            PassThroughPhotoUploader(), BookingFactory(pricing), PartnerSearch(), clock,
        )
        backgroundScope.launch { vm.state.collect {} }
        assertThat(vm.state.value.step).isEqualTo(BookingStep.SERVICE)

        // Can't continue without a package or issue.
        vm.next()
        assertThat(vm.state.value.visibleErrors).isNotEmpty()
        vm.selectPackage(vm.state.value.packages.first().id)
        vm.next()
        assertThat(vm.state.value.step).isEqualTo(BookingStep.TRIP)
        vm.next() // home address prefilled for pickup & drop
        assertThat(vm.state.value.step).isEqualTo(BookingStep.SLOT)
        vm.selectSlot(vm.state.value.slots.first { it.enabled }.slot.id)
        vm.next()
        assertThat(vm.state.value.step).isEqualTo(BookingStep.REVIEW)
        assertThat(vm.state.value.quote!!.breakdown.total).isGreaterThan(0)

        vm.confirm()
        val id = vm.state.value.bookedId
        assertThat(id).isNotNull()
        val b = bookings.observeBooking(id!!).first()!!
        assertThat(b.status).isEqualTo(BookingStatus.REQUESTED)
        assertThat(b.partner.partnerId).isEqualTo("demo-p01")
        assertThat(b.customerName).isEqualTo("Demo Tester")
    }

    @Test fun dropOnlyRequiresJobCard() = runTest {
        signIn()
        val bookings = DemoBookingRepository(store, clock, actions, backgroundScope)
        val vm = BookingFlowViewModel(
            SavedStateHandle(mapOf("partnerId" to "demo-p01")), auth, vehicles, addresses, partners, bookings,
            PassThroughPhotoUploader(), BookingFactory(pricing), PartnerSearch(), clock,
        )
        backgroundScope.launch { vm.state.collect {} }
        vm.selectTripType(TripType.DROP_ONLY)
        vm.next() // service optional for drop only
        assertThat(vm.state.value.step).isEqualTo(BookingStep.TRIP)
        vm.next()
        assertThat(vm.state.value.step).isEqualTo(BookingStep.TRIP)
        vm.onJobCard("JC-1")
        vm.next()
        assertThat(vm.state.value.step).isEqualTo(BookingStep.SLOT)
    }

    @Test fun riderNeedsWalkaroundBeforePickup() = runTest {
        signIn(UserRole.RIDER)
        val bookings = DemoBookingRepository(store, clock, actions, backgroundScope)
        val vm = JobViewModel(SavedStateHandle(mapOf("bookingId" to "AB-DEMO05")), auth, bookings, DemoRiderRepository(), actions, PassThroughPhotoUploader(), clock)
        backgroundScope.launch { vm.state.collect {} }
        assertThat(vm.state.value.next).isEqualTo(BookingStatus.PICKUP_EN_ROUTE)
        vm.advance()
        assertThat(bookings.observeBooking("AB-DEMO05").first()!!.status).isEqualTo(BookingStatus.PICKUP_EN_ROUTE)
        assertThat(vm.state.value.walkaroundStage).isEqualTo(WalkaroundStage.PICKUP_FROM_CUSTOMER)
        vm.advance()
        assertThat(bookings.observeBooking("AB-DEMO05").first()!!.status).isEqualTo(BookingStatus.PICKUP_EN_ROUTE)
        vm.fillDemoPhotos(WalkaroundStage.PICKUP_FROM_CUSTOMER)
        vm.advance()
        assertThat(bookings.observeBooking("AB-DEMO05").first()!!.status).isEqualTo(BookingStatus.PICKED_UP)
    }

    @Test fun partnerCanShareEstimateAndCustomerFlowContinues() = runTest {
        signIn(UserRole.PARTNER)
        val bookings = DemoBookingRepository(store, clock, actions, backgroundScope)
        val vm = JobViewModel(SavedStateHandle(mapOf("bookingId" to "AB-DEMO03")), auth, bookings, DemoRiderRepository(), actions, PassThroughPhotoUploader(), clock)
        backgroundScope.launch { vm.state.collect {} }
        assertThat(vm.state.value.canShareEstimate).isTrue()
        val line = vm.state.value.estimateDraft.first()
        vm.onEstimateLine(line.id, description = "Dent removal", amount = "1500")
        vm.shareEstimate()
        val b = bookings.observeBooking("AB-DEMO03").first()!!
        assertThat(b.status).isEqualTo(BookingStatus.ESTIMATE_SHARED)
        assertThat(b.estimate!!.lines.single().amount).isEqualTo(1500)
    }

    @Test fun versionTappedSevenTimesUnlocksRoleSwitcher() = runTest {
        signIn()
        val settings = DemoSettingsRepository(store)
        val vm = ProfileViewModel(auth, settings, AppConfig(AppMode.DEMO, false, "0.1.0"))
        backgroundScope.launch { vm.state.collect {} }
        repeat(6) { vm.onVersionTapped() }
        assertThat(vm.state.value.roleSwitcherUnlocked).isFalse()
        vm.onVersionTapped()
        assertThat(vm.state.value.roleSwitcherUnlocked).isTrue()
        vm.switchRole(UserRole.OPS)
        assertThat(auth.currentUser.value!!.role).isEqualTo(UserRole.OPS)
    }

    @Test fun exploreFiltersByCategory() = runTest {
        signIn()
        val vm = ExploreViewModel(
            SavedStateHandle(mapOf("category" to "DETAILING")), partners, vehicles, addresses, DemoFavouritesRepository(store),
            DisabledPlacesSuggestionRepository(), DemoShopRequestRepository(store), auth, PartnerSearch(), clock,
        )
        backgroundScope.launch { vm.state.collect {} }
        val results = vm.state.value.results
        assertThat(results).isNotEmpty()
        results.forEach { assertThat(it.partner.categories).contains(PartnerCategory.DETAILING) }
        vm.onCategory(null)
        assertThat(vm.state.value.results.size).isAtLeast(results.size)
    }
}
