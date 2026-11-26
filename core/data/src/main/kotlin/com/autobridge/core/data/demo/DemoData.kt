package com.autobridge.core.data.demo

import com.autobridge.core.model.*
import com.autobridge.core.model.PartnerCategory.*
import com.autobridge.core.model.PriceType.FIXED
import com.autobridge.core.model.PriceType.FROM
import com.autobridge.core.model.VehicleType.BIKE
import com.autobridge.core.model.VehicleType.CAR

/**
 * Clearly fake demo data. Every partner name starts with "Demo" and every review author with "Demo user".
 * Locations are real Bengaluru neighbourhoods so distance and ranking behave realistically.
 */
object DemoData {
    const val DEMO_OTP = "123456"
    const val DEMO_USER_ID = "demo-user"
    const val DEMO_PARTNER_ID = "demo-p01"
    const val DEMO_RIDER_ID = "demo-rider-1"

    private val AREAS = mapOf(
        "Koramangala" to GeoPoint(12.9352, 77.6245), "Indiranagar" to GeoPoint(12.9719, 77.6412),
        "HSR Layout" to GeoPoint(12.9116, 77.6474), "BTM Layout" to GeoPoint(12.9166, 77.6101),
        "Jayanagar" to GeoPoint(12.9250, 77.5938), "JP Nagar" to GeoPoint(12.9063, 77.5857),
        "Whitefield" to GeoPoint(12.9698, 77.7500), "Marathahalli" to GeoPoint(12.9591, 77.6974),
        "Bellandur" to GeoPoint(12.9260, 77.6762), "Electronic City" to GeoPoint(12.8452, 77.6602),
        "Domlur" to GeoPoint(12.9610, 77.6387), "MG Road" to GeoPoint(12.9756, 77.6066),
        "Malleshwaram" to GeoPoint(13.0031, 77.5643), "Hebbal" to GeoPoint(13.0358, 77.5970),
        "Sarjapur Road" to GeoPoint(12.9100, 77.6850), "Banashankari" to GeoPoint(12.9255, 77.5468),
        "Rajajinagar" to GeoPoint(12.9910, 77.5520), "Yelahanka" to GeoPoint(13.1007, 77.5963),
    )

    private data class Spec(
        val name: String, val area: String, val cats: List<PartnerCategory>, val rating: Double, val reviews: Int,
        val google: Double?, val verified: Boolean, val types: Set<VehicleType>, val brands: Set<String> = emptySet(),
        val hours: OpeningHours = OpeningHours.everyDay(9 * 60, 19 * 60), val isPartner: Boolean = true,
    )

    private val ALL_DAY = OpeningHours.everyDay(0, 24 * 60)
    private val SHOP = OpeningHours.everyDay(9 * 60 + 30, 20 * 60, closedOn = setOf(7))
    private val EARLY = OpeningHours.everyDay(7 * 60, 21 * 60)
    private val BOTH = setOf(CAR, BIKE)

    private val SPECS = listOf(
        Spec("Demo Shine Detailing – Koramangala", "Koramangala", listOf(DETAILING, CAR_WASH), 4.8, 642, 4.6, true, BOTH, hours = EARLY),
        Spec("Demo Gloss Lab Detailing – Indiranagar", "Indiranagar", listOf(DETAILING), 4.9, 38, 4.7, true, setOf(CAR)),
        Spec("Demo Ceramic Studio – HSR Layout", "HSR Layout", listOf(DETAILING), 4.6, 215, 4.4, true, BOTH),
        Spec("Demo Mirror Finish Detailers – Whitefield", "Whitefield", listOf(DETAILING, CAR_WASH), 4.4, 129, null, false, setOf(CAR)),
        Spec("Demo Foam & Shine Car Wash – BTM Layout", "BTM Layout", listOf(CAR_WASH), 4.3, 980, 4.2, true, BOTH, hours = ALL_DAY),
        Spec("Demo Splash 24x7 Wash – Bellandur", "Bellandur", listOf(CAR_WASH), 4.1, 311, 3.9, false, BOTH, hours = ALL_DAY),
        Spec("Demo Quick Rinse – Jayanagar", "Jayanagar", listOf(CAR_WASH), 4.5, 77, null, true, BOTH, hours = EARLY),
        Spec("Demo Maruti Suzuki Authorised Service – Koramangala", "Koramangala", listOf(AUTHORISED_SERVICE), 4.2, 1520, 4.1, true, setOf(CAR), setOf("maruti-suzuki")),
        Spec("Demo Maruti Suzuki Authorised Service – Whitefield", "Whitefield", listOf(AUTHORISED_SERVICE), 4.0, 860, 3.9, true, setOf(CAR), setOf("maruti-suzuki")),
        Spec("Demo Hyundai Authorised Service – Domlur", "Domlur", listOf(AUTHORISED_SERVICE), 4.3, 1104, 4.2, true, setOf(CAR), setOf("hyundai")),
        Spec("Demo Tata Motors Authorised Service – HSR Layout", "HSR Layout", listOf(AUTHORISED_SERVICE, EV_SERVICE), 4.1, 702, 4.0, true, setOf(CAR), setOf("tata")),
        Spec("Demo Mahindra Authorised Service – Hebbal", "Hebbal", listOf(AUTHORISED_SERVICE), 4.0, 455, 3.8, true, setOf(CAR), setOf("mahindra")),
        Spec("Demo Kia Authorised Service – Marathahalli", "Marathahalli", listOf(AUTHORISED_SERVICE), 4.4, 390, 4.3, true, setOf(CAR), setOf("kia")),
        Spec("Demo Toyota Authorised Service – MG Road", "MG Road", listOf(AUTHORISED_SERVICE), 4.5, 1210, 4.4, true, setOf(CAR), setOf("toyota")),
        Spec("Demo Honda Cars Authorised Service – Jayanagar", "Jayanagar", listOf(AUTHORISED_SERVICE), 4.2, 530, null, true, setOf(CAR), setOf("honda")),
        Spec("Demo Honda Two Wheelers Authorised Service – BTM Layout", "BTM Layout", listOf(AUTHORISED_SERVICE), 4.1, 2210, 4.0, true, setOf(BIKE), setOf("honda-2w"), SHOP),
        Spec("Demo Royal Enfield Authorised Service – Indiranagar", "Indiranagar", listOf(AUTHORISED_SERVICE), 4.6, 870, 4.5, true, setOf(BIKE), setOf("royal-enfield"), SHOP),
        Spec("Demo Bajaj Authorised Service – Banashankari", "Banashankari", listOf(AUTHORISED_SERVICE), 4.0, 640, 3.9, true, setOf(BIKE), setOf("bajaj"), SHOP),
        Spec("Demo TVS Authorised Service – Electronic City", "Electronic City", listOf(AUTHORISED_SERVICE), 4.2, 410, null, true, setOf(BIKE), setOf("tvs"), SHOP),
        Spec("Demo Ather Experience & Service – Koramangala", "Koramangala", listOf(AUTHORISED_SERVICE, EV_SERVICE), 4.7, 520, 4.6, true, setOf(BIKE), setOf("ather")),
        Spec("Demo Hero MotoCorp Authorised Service – Rajajinagar", "Rajajinagar", listOf(AUTHORISED_SERVICE), 3.9, 300, 3.8, false, setOf(BIKE), setOf("hero"), SHOP),
        Spec("Demo Precision Multi-Brand Garage – HSR Layout", "HSR Layout", listOf(MULTI_BRAND_GARAGE), 4.6, 812, 4.5, true, setOf(CAR)),
        Spec("Demo Torque Works Garage – Koramangala", "Koramangala", listOf(MULTI_BRAND_GARAGE, BATTERY), 4.4, 266, 4.2, true, BOTH),
        Spec("Demo Two Wheel Clinic – JP Nagar", "JP Nagar", listOf(MULTI_BRAND_GARAGE), 4.5, 459, 4.3, true, setOf(BIKE), hours = SHOP),
        Spec("Demo City Motors Garage – Malleshwaram", "Malleshwaram", listOf(MULTI_BRAND_GARAGE), 3.8, 145, 3.7, false, BOTH),
        Spec("Demo Grip Tyres & Alignment – Domlur", "Domlur", listOf(TYRES_WHEELS), 4.5, 690, 4.4, true, BOTH),
        Spec("Demo Wheel Doctor – Sarjapur Road", "Sarjapur Road", listOf(TYRES_WHEELS), 4.2, 188, null, true, BOTH),
        Spec("Demo PowerCell Battery Hub – Indiranagar", "Indiranagar", listOf(BATTERY), 4.6, 344, 4.5, true, BOTH, hours = EARLY),
        Spec("Demo Volt EV Care – Bellandur", "Bellandur", listOf(EV_SERVICE), 4.7, 233, 4.6, true, BOTH),
        Spec("Demo Charge Point EV Workshop – Yelahanka", "Yelahanka", listOf(EV_SERVICE, MULTI_BRAND_GARAGE), 4.3, 61, null, false, setOf(CAR)),
    )

    private val DESCRIPTIONS = mapOf(
        DETAILING to "Demo listing. Paint correction, ceramic coatings and interior deep cleans.",
        CAR_WASH to "Demo listing. Foam wash, vacuum and quick turnarounds.",
        AUTHORISED_SERVICE to "Demo listing. Brand-authorised service with genuine parts and warranty-safe servicing.",
        MULTI_BRAND_GARAGE to "Demo listing. Multi-brand mechanical, electrical and periodic service.",
        TYRES_WHEELS to "Demo listing. Tyres, alignment, balancing and puncture repair.",
        BATTERY to "Demo listing. Battery health checks and replacements with doorstep fitment.",
        EV_SERVICE to "Demo listing. EV diagnostics, battery health and periodic EV service.",
    )

    val partners: List<Partner> = SPECS.mapIndexed { i, s ->
        val base = AREAS.getValue(s.area)
        // Nudge each partner off the neighbourhood centre so distances differ.
        val jitter = ((i * 37) % 11 - 5) * 0.0012
        Partner(
            id = "demo-p%02d".format(i + 1),
            name = s.name,
            categories = s.cats,
            area = s.area,
            address = "${(i * 7) % 90 + 1}, Demo Street, ${s.area}, Bengaluru",
            location = GeoPoint(base.lat + jitter, base.lng - jitter / 2),
            phone = "+91 90000 %05d".format(10000 + i),
            whatsapp = "+91 90000 %05d".format(10000 + i),
            rating = s.rating,
            reviewCount = s.reviews,
            googleRating = s.google,
            googleReviewCount = s.google?.let { s.reviews * 2 + 17 },
            verified = s.verified,
            isPartner = s.isPartner,
            vehicleTypes = s.types,
            brandIds = s.brands,
            hours = s.hours,
            description = DESCRIPTIONS.getValue(s.cats.first()),
            slotCapacity = if (CAR_WASH in s.cats) 5 else 3,
        )
    }

    private data class Pkg(val name: String, val type: VehicleType, val price: PriceType, val amount: Int, val mins: Int, val popular: Boolean = false, val incl: List<String> = emptyList())

    private val PACKAGES: Map<PartnerCategory, List<Pkg>> = mapOf(
        AUTHORISED_SERVICE to listOf(
            Pkg("Periodic maintenance service", CAR, FROM, 3499, 300, true, listOf("Engine oil & filter", "Multi-point inspection", "Top-ups")),
            Pkg("Express service (90 min)", CAR, FIXED, 2999, 90, false, listOf("Engine oil", "Oil filter", "Wash")),
            Pkg("AC service", CAR, FIXED, 1999, 120, false, listOf("Gas top-up", "Filter clean", "Cooling check")),
            Pkg("General service", BIKE, FROM, 899, 180, true, listOf("Engine oil", "Chain lube", "Brake adjustment")),
            Pkg("Oil change", BIKE, FIXED, 549, 45),
        ),
        MULTI_BRAND_GARAGE to listOf(
            Pkg("Standard service", CAR, FIXED, 2799, 240, true, listOf("Engine oil & filter", "Air filter clean", "25-point check")),
            Pkg("Comprehensive service", CAR, FROM, 4499, 360, false, listOf("All filters", "Brake service", "Coolant")),
            Pkg("Brake pads replacement", CAR, FROM, 1499, 90),
            Pkg("Clutch inspection", CAR, FIXED, 499, 60),
            Pkg("General service", BIKE, FIXED, 699, 150, true, listOf("Engine oil", "Chain clean & lube", "Wash")),
            Pkg("Chain clean & lube", BIKE, FIXED, 199, 30),
        ),
        DETAILING to listOf(
            Pkg("Interior deep cleaning", CAR, FIXED, 2499, 240, true, listOf("Seats shampoo", "Roof & carpet", "Odour treatment")),
            Pkg("Ceramic coating (9H)", CAR, FROM, 14999, 720, false, listOf("Paint correction", "2 layers", "1-year warranty")),
            Pkg("Foam wash + wax", CAR, FIXED, 899, 75),
            Pkg("Paint protection film (PPF)", CAR, FROM, 49999, 1440),
            Pkg("Bike detailing", BIKE, FIXED, 799, 90, true),
            Pkg("Bike ceramic coating", BIKE, FROM, 3999, 240),
        ),
        CAR_WASH to listOf(
            Pkg("Exterior foam wash", CAR, FIXED, 399, 30),
            Pkg("Foam wash + interior vacuum", CAR, FIXED, 549, 45, true),
            Pkg("Bike wash", BIKE, FIXED, 149, 20, true),
        ),
        TYRES_WHEELS to listOf(
            Pkg("Wheel alignment & balancing", CAR, FIXED, 899, 60, true),
            Pkg("New tyre fitment", CAR, FROM, 3800, 60),
            Pkg("Puncture repair (tubeless)", CAR, FIXED, 199, 20),
            Pkg("Bike tyre replacement", BIKE, FROM, 1400, 40),
        ),
        BATTERY to listOf(
            Pkg("Battery health check", CAR, FIXED, 99, 15),
            Pkg("New battery with installation", CAR, FROM, 4200, 30, true),
            Pkg("Bike battery replacement", BIKE, FROM, 1500, 20, true),
        ),
        EV_SERVICE to listOf(
            Pkg("EV health check", CAR, FIXED, 999, 60, true, listOf("HV battery report", "Software check", "Brakes & tyres")),
            Pkg("EV periodic service", CAR, FROM, 1999, 180),
            Pkg("Scooter EV service", BIKE, FIXED, 699, 90, true),
        ),
    )

    val packages: List<ServicePackage> = partners.flatMap { p ->
        p.categories.flatMap { cat -> PACKAGES.getValue(cat).map { cat to it } }
            .filter { (_, pkg) -> pkg.type in p.vehicleTypes }
            .distinctBy { it.second.name + it.second.type }
            .mapIndexed { i, (cat, pkg) ->
                ServicePackage(
                    id = "${p.id}-pkg$i", partnerId = p.id, name = pkg.name, description = "Demo package",
                    category = cat, vehicleType = pkg.type, priceType = pkg.price,
                    // Small per-partner variation so prices differ between partners.
                    price = pkg.amount + (p.id.takeLast(2).toInt() % 4) * (if (pkg.amount > 1000) 100 else 10),
                    durationMinutes = pkg.mins, inclusions = pkg.incl, popular = pkg.popular,
                )
            }
    }

    private val REVIEW_TEXTS = listOf(
        "Demo review: pickup was on time and the walkaround photos were reassuring.",
        "Demo review: estimate was clear, approved each item from the app.",
        "Demo review: good work, took a little longer than promised.",
        "Demo review: car came back spotless.",
        "Demo review: friendly advisor, fair pricing.",
    )

    fun reviewsFor(partnerId: String, nowMillis: Long): List<Review> {
        val n = partnerId.takeLast(2).toInt()
        return (0 until 3 + n % 3).map { i ->
            Review(
                id = "$partnerId-r$i", partnerId = partnerId, authorName = "Demo user ${('A' + (n + i) % 26)}.",
                rating = listOf(5, 4, 5, 3, 4)[(n + i) % 5], text = REVIEW_TEXTS[(n + i) % REVIEW_TEXTS.size],
                createdAtMillis = nowMillis - (i + 1) * 3L * 86_400_000L,
            )
        }
    }

    val riders = listOf(
        Rider(DEMO_RIDER_ID, "Demo Rider Ravi", "+91 90000 20001"),
        Rider("demo-rider-2", "Demo Rider Aisha", "+91 90000 20002"),
        Rider("demo-rider-3", "Demo Rider Manoj", "+91 90000 20003", VehicleType.CAR),
    )

    fun seedVehicles(todayEpochDay: Long) = listOf(
        Vehicle("demo-v1", CAR, "maruti-suzuki", "Maruti Suzuki", "maruti-suzuki-swift", "Swift", FuelType.PETROL, "KA01AB1234", 2021, 32000, todayEpochDay - 200),
        Vehicle("demo-v2", BIKE, "honda-2w", "Honda", "honda-2w-activa-6g", "Activa 6G", FuelType.PETROL, "KA05MN4321", 2022, 11000, todayEpochDay - 60),
    )

    fun seedAddresses() = listOf(
        SavedAddress("demo-a1", AddressLabel.HOME, "Flat 12B, Demo Residency, 5th Cross", "Koramangala", "Near Demo Park", GeoPoint(12.9340, 77.6220)),
        SavedAddress("demo-a2", AddressLabel.WORK, "Demo Tech Park, Tower 2", "Bellandur", "", GeoPoint(12.9270, 77.6800)),
    )
}
