package com.autobridge.app.core.data.firebase

import com.autobridge.core.data.AppJson
import com.autobridge.core.domain.repository.PlacesSuggestionRepository
import com.autobridge.core.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.net.HttpURLConnection
import java.net.URL

/**
 * Google Places API (New) Nearby Search. Only constructed when PLACES_API_KEY is set in local.properties.
 * Results are shown as "Not yet on AutoBridge" suggestions with a "Request this shop" action; they can never be booked.
 * Ratings are Google's and are only displayed as "Google rating".
 */
class GooglePlacesSuggestionRepository(private val apiKey: String) : PlacesSuggestionRepository {
    override val isEnabled: Boolean = apiKey.isNotBlank()

    override suspend fun nearby(category: PartnerCategory?, near: GeoPoint, radiusKm: Double): List<Partner> = withContext(Dispatchers.IO) {
        if (!isEnabled) return@withContext emptyList()
        runCatching {
            val body = buildJsonObject {
                putJsonArray("includedTypes") { placeTypes(category).forEach { add(it) } }
                put("maxResultCount", 15)
                putJsonObject("locationRestriction") {
                    putJsonObject("circle") {
                        putJsonObject("center") { put("latitude", near.lat); put("longitude", near.lng) }
                        put("radius", (radiusKm * 1000).coerceAtMost(50_000.0))
                    }
                }
            }.toString()
            val conn = (URL("https://places.googleapis.com/v1/places:searchNearby").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 10_000
                readTimeout = 10_000
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("X-Goog-Api-Key", apiKey)
                setRequestProperty(
                    "X-Goog-FieldMask",
                    "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber",
                )
            }
            conn.outputStream.use { it.write(body.toByteArray()) }
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            parse(text, category ?: PartnerCategory.MULTI_BRAND_GARAGE)
        }.getOrDefault(emptyList())
    }

    private fun placeTypes(category: PartnerCategory?): List<String> = when (category) {
        PartnerCategory.CAR_WASH, PartnerCategory.DETAILING -> listOf("car_wash")
        PartnerCategory.AUTHORISED_SERVICE -> listOf("car_dealer", "car_repair")
        PartnerCategory.EV_SERVICE -> listOf("car_repair", "electric_vehicle_charging_station")
        else -> listOf("car_repair")
    }

    internal fun parse(json: String, category: PartnerCategory): List<Partner> {
        val places = AppJson.parseToJsonElement(json).jsonObject["places"]?.jsonArray ?: return emptyList()
        return places.mapNotNull { el ->
            val o = el.jsonObject
            val id = o["id"]?.jsonPrimitive?.content ?: return@mapNotNull null
            val loc = o["location"]?.jsonObject ?: return@mapNotNull null
            Partner(
                id = "places-$id",
                name = o["displayName"]?.jsonObject?.get("text")?.jsonPrimitive?.content ?: return@mapNotNull null,
                categories = listOf(category),
                area = "",
                address = o["formattedAddress"]?.jsonPrimitive?.content.orEmpty(),
                location = GeoPoint(loc["latitude"]!!.jsonPrimitive.double, loc["longitude"]!!.jsonPrimitive.double),
                phone = o["nationalPhoneNumber"]?.jsonPrimitive?.content.orEmpty(),
                googleRating = o["rating"]?.jsonPrimitive?.doubleOrNull,
                googleReviewCount = o["userRatingCount"]?.jsonPrimitive?.intOrNull,
                isPartner = false,
                vehicleTypes = setOf(VehicleType.CAR, VehicleType.BIKE),
                source = PartnerSource.GOOGLE_PLACES,
                placeId = id,
            )
        }
    }
}
