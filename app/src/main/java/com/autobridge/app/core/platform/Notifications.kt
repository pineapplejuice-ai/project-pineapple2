package com.autobridge.app.core.platform

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.autobridge.app.MainActivity
import com.autobridge.app.R
import com.autobridge.app.core.ui.statusTitleRes
import com.autobridge.core.domain.repository.AuthRepository
import com.autobridge.core.domain.repository.BookingNotifier
import com.autobridge.core.domain.repository.BookingRepository
import com.autobridge.core.domain.repository.PushTokenRepository
import com.autobridge.core.model.Booking
import com.autobridge.core.model.UserRole
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

const val CHANNEL_BOOKINGS = "booking_updates"
const val EXTRA_BOOKING_ID = "bookingId"

class AndroidBookingNotifier(private val context: Context) : BookingNotifier {

    init { createChannel(context) }

    override fun notifyStatus(booking: Booking) {
        show(
            context, booking.id.hashCode(),
            context.getString(statusTitleRes(booking.status, booking.tripType)),
            context.getString(R.string.notif_booking_body, booking.partner.name, booking.vehicle.name),
            booking.id,
        )
    }

    companion object {
        fun createChannel(context: Context) {
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_BOOKINGS, context.getString(R.string.notif_channel_bookings), NotificationManager.IMPORTANCE_DEFAULT),
            )
        }

        fun canPost(context: Context): Boolean = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        fun show(context: Context, id: Int, title: String, body: String, bookingId: String?) {
            if (!canPost(context)) return
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                bookingId?.let { putExtra(EXTRA_BOOKING_ID, it) }
            }
            val pi = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = NotificationCompat.Builder(context, CHANNEL_BOOKINGS)
                .setSmallIcon(R.drawable.ic_stat_car)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build()
            try {
                NotificationManagerCompat.from(context).notify(id, n)
            } catch (_: SecurityException) {
                // Permission revoked between check and notify.
            }
        }
    }
}

/**
 * Watches the signed-in customer's bookings and posts a local notification whenever a status changes.
 * Used in demo mode (no FCM) so status changes are visible. In Firebase mode the Cloud Function sends a push instead.
 */
class BookingStatusWatcher @Inject constructor(
    private val auth: AuthRepository,
    private val bookings: BookingRepository,
    private val notifier: BookingNotifier,
) {
    private val lastStatus = mutableMapOf<String, com.autobridge.core.model.BookingStatus>()

    @OptIn(ExperimentalCoroutinesApi::class)
    fun start(scope: CoroutineScope) {
        scope.launch {
            auth.currentUser.flatMapLatest { u ->
                if (u == null || u.role != UserRole.CUSTOMER) emptyFlow() else bookings.observeCustomerBookings(u.id)
            }.collect { list ->
                list.forEach { b ->
                    val prev = lastStatus[b.id]
                    if (prev != null && prev != b.status) notifier.notifyStatus(b)
                    lastStatus[b.id] = b.status
                }
            }
        }
    }
}

@AndroidEntryPoint
class AutoBridgeMessagingService : FirebaseMessagingService() {
    @Inject lateinit var auth: AuthRepository
    @Inject lateinit var tokens: PushTokenRepository
    @Inject @com.autobridge.app.core.di.ApplicationScope lateinit var scope: CoroutineScope

    override fun onNewToken(token: String) {
        val uid = auth.currentUser.value?.id ?: return
        scope.launch { tokens.saveToken(uid, token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"].orEmpty()
        AndroidBookingNotifier.createChannel(this)
        AndroidBookingNotifier.show(this, (message.data["bookingId"] ?: title).hashCode(), title, body, message.data["bookingId"])
    }
}
