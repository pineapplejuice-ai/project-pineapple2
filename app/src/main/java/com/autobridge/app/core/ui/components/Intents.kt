package com.autobridge.app.core.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.autobridge.core.model.GeoPoint

/** Outbound intents (call, WhatsApp, Maps). Failures are swallowed: the button just does nothing on devices without a handler. */
object Intents {
    fun dial(context: Context, phone: String) = start(context, Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone.filter { it.isDigit() || it == '+' })))

    fun whatsApp(context: Context, phone: String, text: String = "") {
        val digits = phone.filter { it.isDigit() }
        start(context, Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits?text=" + Uri.encode(text))))
    }

    fun directions(context: Context, point: GeoPoint, label: String) {
        val uri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&destination_place_id=&travelmode=driving")
        start(context, Intent(Intent.ACTION_VIEW, uri).putExtra(Intent.EXTRA_TITLE, label))
    }

    private fun start(context: Context, intent: Intent) {
        try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
        }
    }
}
