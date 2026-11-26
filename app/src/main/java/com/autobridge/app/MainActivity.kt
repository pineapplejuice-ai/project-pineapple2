package com.autobridge.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import com.autobridge.app.core.platform.ActivityProvider
import com.autobridge.app.core.platform.EXTRA_BOOKING_ID
import com.autobridge.app.core.ui.theme.AutoBridgeTheme
import com.autobridge.app.navigation.AutoBridgeRoot
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var activityProvider: ActivityProvider

    /** Booking to open when launched from a notification. */
    private val pendingBookingId = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        activityProvider.set(this)
        pendingBookingId.value = intent?.getStringExtra(EXTRA_BOOKING_ID)
        setContent {
            AutoBridgeTheme {
                AutoBridgeRoot(
                    pendingBookingId = pendingBookingId.value,
                    onPendingBookingHandled = { pendingBookingId.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_BOOKING_ID)?.let { pendingBookingId.value = it }
    }

    override fun onDestroy() {
        if (activityProvider.get() === this) activityProvider.set(null)
        super.onDestroy()
    }
}
