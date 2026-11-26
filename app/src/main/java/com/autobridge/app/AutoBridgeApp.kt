package com.autobridge.app

import android.app.Application
import com.autobridge.app.core.di.AppConfig
import com.autobridge.app.core.di.ApplicationScope
import com.autobridge.app.core.platform.AndroidBookingNotifier
import com.autobridge.app.core.platform.BookingStatusWatcher
import com.autobridge.app.core.platform.PushTokenSync
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import javax.inject.Inject

@HiltAndroidApp
class AutoBridgeApp : Application() {
    @Inject lateinit var config: AppConfig
    @Inject lateinit var statusWatcher: BookingStatusWatcher
    @Inject lateinit var pushTokenSync: PushTokenSync
    @Inject @ApplicationScope lateinit var scope: CoroutineScope

    override fun onCreate() {
        super.onCreate()
        AndroidBookingNotifier.createChannel(this)
        // Demo mode has no FCM: post local notifications on status changes instead.
        if (config.isDemo) statusWatcher.start(scope) else pushTokenSync.start(scope)
    }
}
