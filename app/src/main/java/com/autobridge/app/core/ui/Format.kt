package com.autobridge.app.core.ui

import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val INDIA = Locale("en", "IN")
private val rupeeFormat: NumberFormat = NumberFormat.getNumberInstance(INDIA).apply { maximumFractionDigits = 0 }

/** ₹1,24,999 with Indian digit grouping. */
fun rupees(amount: Int): String = "₹" + rupeeFormat.format(amount)

fun distance(km: Double): String = if (km < 1) "${(km * 1000).toInt()} m" else String.format(INDIA, "%.1f km", km)

fun rating(value: Double): String = String.format(INDIA, "%.1f", value)

fun compactCount(n: Int): String = when {
    n >= 100_000 -> String.format(INDIA, "%.1fL", n / 100_000.0)
    n >= 1_000 -> String.format(INDIA, "%.1fk", n / 1_000.0)
    else -> n.toString()
}

private val dayFormat = DateTimeFormatter.ofPattern("EEE, d MMM", INDIA)
private val dateTimeFormat = DateTimeFormatter.ofPattern("d MMM, h:mm a", INDIA)

fun epochDayLabel(epochDay: Long): String = LocalDate.ofEpochDay(epochDay).format(dayFormat)

fun dateTime(millis: Long): String = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).format(dateTimeFormat)

fun minutesLabel(minuteOfDay: Int): String {
    val h = (minuteOfDay / 60) % 24
    val m = minuteOfDay % 60
    val suffix = if (h < 12) "AM" else "PM"
    val h12 = if (h % 12 == 0) 12 else h % 12
    return if (m == 0) "$h12 $suffix" else String.format(INDIA, "%d:%02d %s", h12, m, suffix)
}

fun durationLabel(minutes: Int): String = when {
    minutes < 60 -> "$minutes min"
    minutes % 60 == 0 -> "${minutes / 60} h"
    else -> "${minutes / 60} h ${minutes % 60} min"
}
