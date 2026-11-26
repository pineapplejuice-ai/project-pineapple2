package com.autobridge.app.navigation

import android.net.Uri

/** All navigation routes. Arguments are plain strings to keep deep links simple. */
object Routes {
    const val LOGIN = "login"
    const val HOME = "home"
    const val EXPLORE = "explore?category={category}"
    const val BOOKINGS = "bookings"
    const val PROFILE = "profile"
    const val FAVOURITES = "favourites"
    const val PARTNER = "partner/{partnerId}"
    const val VEHICLES = "vehicles"
    const val ADD_VEHICLE = "vehicles/add"
    const val ADDRESSES = "addresses"
    const val ADD_ADDRESS = "addresses/add"
    const val BOOK = "book?partnerId={partnerId}&packageId={packageId}&rebookId={rebookId}"
    const val BOOKING = "booking/{bookingId}?justBooked={justBooked}"
    const val PARTNER_HOME = "partnerHome"
    const val RIDER_HOME = "riderHome"
    const val OPS_HOME = "opsHome"
    const val JOB = "job/{bookingId}"

    fun explore(category: String? = null) = "explore" + (category?.let { "?category=$it" } ?: "")
    fun partner(id: String) = "partner/${Uri.encode(id)}"
    fun book(partnerId: String? = null, packageId: String? = null, rebookId: String? = null): String {
        val params = listOfNotNull(partnerId?.let { "partnerId=$it" }, packageId?.let { "packageId=$it" }, rebookId?.let { "rebookId=$it" })
        return "book" + if (params.isEmpty()) "" else "?" + params.joinToString("&")
    }
    fun booking(id: String, justBooked: Boolean = false) = "booking/$id?justBooked=$justBooked"
    fun job(id: String) = "job/$id"

    val CUSTOMER_TABS = listOf(HOME, EXPLORE, BOOKINGS, PROFILE)
}
