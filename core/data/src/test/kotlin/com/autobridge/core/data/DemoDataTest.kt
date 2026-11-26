package com.autobridge.core.data

import com.autobridge.core.data.demo.*
import com.autobridge.core.domain.booking.BookingActions
import com.autobridge.core.domain.pricing.PricingEngine
import com.autobridge.core.domain.repository.Clock
import com.autobridge.core.model.*
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.io.File

class DemoDataTest {
    private val clock = object : Clock {
        override fun nowMillis() = 1_700_000_000_000L
        override fun todayEpochDay() = 19_700L
        override fun dayOfWeek() = 3
        override fun minuteOfDay() = 12 * 60
    }
    private val catalogue = JsonVehicleCatalogueRepository.parse(File("../../app/src/main/assets/vehicle_catalogue.json").readText())

    @Test fun catalogueHasCarsBikesAndEvs() {
        assertThat(catalogue.brandsFor(VehicleType.CAR).size).isAtLeast(15)
        assertThat(catalogue.brandsFor(VehicleType.BIKE).size).isAtLeast(15)
        assertThat(catalogue.brands.filter { it.evOnly }.map { it.id }).containsAtLeast("ather", "ola-electric", "byd")
        assertThat(catalogue.brands.map { it.id }.toSet()).hasSize(catalogue.brands.size)
        catalogue.brands.forEach { assertThat(it.models).isNotEmpty() }
    }

    @Test fun demoDataIsClearlyFakeAndConsistent() {
        assertThat(DemoData.partners.size).isAtLeast(30)
        DemoData.partners.forEach { assertThat(it.name).startsWith("Demo ") }
        assertThat(DemoData.partners.map { it.id }.toSet()).hasSize(DemoData.partners.size)
        PartnerCategory.entries.forEach { c -> assertThat(DemoData.partners.any { c in it.categories }).isTrue() }
        DemoData.partners.forEach { p -> assertThat(DemoData.packages.any { it.partnerId == p.id }).isTrue() }
        DemoData.reviewsFor("demo-p01", 0).forEach { assertThat(it.authorName).startsWith("Demo user") }
    }

    @Test fun demoBrandIdsExistInCatalogue() {
        val ids = catalogue.brands.map { it.id }.toSet()
        DemoData.partners.flatMap { it.brandIds }.forEach { assertThat(ids).contains(it) }
        DemoData.seedVehicles(0).forEach { v ->
            assertThat(catalogue.brand(v.brandId)!!.models.map { it.id }).contains(v.modelId)
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test fun demoBookingsAutoAdvance() = runTest {
        val store = InMemoryKeyValueStore()
        val repo = DemoBookingRepository(store, clock, BookingActions(PricingEngine()), this, autoAdvanceDelayMs = 1000)
        val seeded = repo.observeAllBookings().first()
        assertThat(seeded).isNotEmpty()
        val template = seeded.first { it.id == "AB-DEMO04" }
        val created = repo.create(template.copy(id = "AB-NEW", partner = template.partner.copy(partnerId = "demo-p05"), status = BookingStatus.REQUESTED, riderId = null)).getOrThrow()
        advanceTimeBy(1500)
        assertThat(repo.observeBooking(created.id).first()!!.status).isEqualTo(BookingStatus.CONFIRMED)
        advanceTimeBy(1500)
        assertThat(repo.observeBooking(created.id).first()!!.status).isEqualTo(BookingStatus.RIDER_ASSIGNED)
        // Persisted
        val reloaded = DemoBookingRepository(store, clock, BookingActions(PricingEngine()), this)
        assertThat(reloaded.observeBooking("AB-NEW").first()).isNotNull()
    }

    @Test fun bookedCountsMarkSomeSlotsFull() = runTest {
        val repo = DemoBookingRepository(InMemoryKeyValueStore(), clock, BookingActions(PricingEngine()), this)
        val anyFull = (0 until 7).any { d -> repo.bookedCounts("demo-p01", 19_700L + d).values.any { it >= 3 } }
        assertThat(anyFull).isTrue()
    }

    @Test fun demoAuthRequiresOtp() = runTest {
        val auth = DemoAuthRepository(InMemoryKeyValueStore())
        assertThat(auth.sendOtp("123")).isInstanceOf(com.autobridge.core.domain.repository.OtpResult.Error::class.java)
        auth.sendOtp("98765 43210")
        assertThat(auth.verifyOtp("000000").isFailure).isTrue()
        val u = auth.verifyOtp(DemoData.DEMO_OTP).getOrThrow()
        assertThat(u.phone).isEqualTo("+919876543210")
        auth.setDemoRole(UserRole.PARTNER)
        assertThat(auth.currentUser.value!!.partnerId).isEqualTo(DemoData.DEMO_PARTNER_ID)
    }

    @Test fun favouritesPersist() = runTest {
        val store = InMemoryKeyValueStore()
        DemoFavouritesRepository(store).toggle("demo-p01")
        assertThat(DemoFavouritesRepository(store).observeFavouriteIds().first()).containsExactly("demo-p01")
    }
}
