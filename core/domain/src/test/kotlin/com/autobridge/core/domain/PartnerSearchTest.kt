package com.autobridge.core.domain

import com.autobridge.core.domain.Fixtures.kmNorth
import com.autobridge.core.domain.Fixtures.partner
import com.autobridge.core.domain.Fixtures.vehicle
import com.autobridge.core.domain.partner.*
import com.autobridge.core.model.*
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PartnerSearchTest {
    private val ranker = PartnerRanker()
    private val search = PartnerSearch(ranker)
    private fun run(partners: List<Partner>, filter: PartnerFilter = PartnerFilter(), packages: List<ServicePackage> = emptyList(), minute: Int = 12 * 60) =
        search.search(partners, packages, filter, Fixtures.KORAMANGALA, 3, minute)

    @Test fun bayesianPullsSmallSamplesTowardsPrior() {
        assertThat(ranker.bayesian(5.0, 3)).isLessThan(ranker.bayesian(4.6, 800))
        assertThat(ranker.bayesian(0.0, 0)).isEqualTo(RankingWeights().priorMean)
    }

    @Test fun manyGoodReviewsBeatFewPerfectOnes() {
        val r = run(listOf(partner("few", 5.0, 3), partner("many", 4.6, 800)))
        assertThat(r.map { it.partner.id }).containsExactly("many", "few").inOrder()
    }

    @Test fun closerWinsWhenEqual() {
        val r = run(listOf(partner("far", location = kmNorth(8.0)), partner("near", location = kmNorth(1.0))))
        assertThat(r.first().partner.id).isEqualTo("near")
    }

    @Test fun verifiedAndOpenNowBoost() {
        val r = run(listOf(partner("unverified", verified = false), partner("verified")))
        assertThat(r.first().partner.id).isEqualTo("verified")
        val closed = partner("closed", hours = OpeningHours.everyDay(20 * 60, 22 * 60))
        val r2 = run(listOf(closed, partner("open")))
        assertThat(r2.first().partner.id).isEqualTo("open")
        assertThat(r2.first { it.partner.id == "closed" }.isOpenNow).isFalse()
    }

    @Test fun radiusFilter() {
        val r = run(listOf(partner("a", location = kmNorth(2.0)), partner("b", location = kmNorth(12.0))), PartnerFilter(radiusKm = 5.0))
        assertThat(r.map { it.partner.id }).containsExactly("a")
    }

    @Test fun categoryAndVehicleTypeFilter() {
        val wash = partner("wash", cats = listOf(PartnerCategory.CAR_WASH), types = setOf(VehicleType.CAR, VehicleType.BIKE))
        val det = partner("det")
        assertThat(run(listOf(wash, det), PartnerFilter(category = PartnerCategory.CAR_WASH)).map { it.partner.id }).containsExactly("wash")
        assertThat(run(listOf(wash, det), PartnerFilter(vehicleType = VehicleType.BIKE)).map { it.partner.id }).containsExactly("wash")
    }

    @Test fun brandCompatibility() {
        val maruti = partner("maruti", cats = listOf(PartnerCategory.AUTHORISED_SERVICE), brands = setOf("maruti-suzuki"))
        val hyundai = partner("hyundai", cats = listOf(PartnerCategory.AUTHORISED_SERVICE), brands = setOf("hyundai"))
        val garage = partner("garage", cats = listOf(PartnerCategory.MULTI_BRAND_GARAGE))
        val ev = partner("ev", cats = listOf(PartnerCategory.EV_SERVICE))
        val all = listOf(maruti, hyundai, garage, ev)
        assertThat(run(all, PartnerFilter(vehicle = vehicle())).map { it.partner.id }).containsExactly("maruti", "garage")
        assertThat(run(all, PartnerFilter(vehicle = vehicle(fuel = FuelType.ELECTRIC))).map { it.partner.id }).containsExactly("maruti", "garage", "ev")
        assertThat(run(all, PartnerFilter(vehicle = vehicle(), brandCompatibleOnly = false))).hasSize(4)
    }

    @Test fun queryMatchesNameAreaAndPackages() {
        val p = partner("p1")
        val pkgs = listOf(Fixtures.pkg("p1").copy(name = "Ceramic coating"))
        assertThat(run(listOf(p), PartnerFilter(query = "ceramic"), pkgs)).hasSize(1)
        assertThat(run(listOf(p), PartnerFilter(query = "koramangala"))).hasSize(1)
        assertThat(run(listOf(p), PartnerFilter(query = "tyres"))).isEmpty()
    }

    @Test fun sortByPriceAndNearest() {
        val a = partner("a", location = kmNorth(4.0))
        val b = partner("b", location = kmNorth(1.0))
        val pkgs = listOf(Fixtures.pkg("a", 300), Fixtures.pkg("b", 900))
        assertThat(run(listOf(a, b), PartnerFilter(sort = PartnerSort.PRICE_LOW), pkgs).first().partner.id).isEqualTo("a")
        assertThat(run(listOf(a, b), PartnerFilter(sort = PartnerSort.NEAREST), pkgs).first().partner.id).isEqualTo("b")
        assertThat(run(listOf(a, b), packages = pkgs).first { it.partner.id == "a" }.startingPrice).isEqualTo(300)
    }

    @Test fun openNowOnly() {
        val closed = partner("closed", hours = OpeningHours.everyDay(20 * 60, 22 * 60))
        assertThat(run(listOf(closed, partner("open")), PartnerFilter(openNowOnly = true)).map { it.partner.id }).containsExactly("open")
    }
}
