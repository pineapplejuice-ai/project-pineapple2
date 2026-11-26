package com.autobridge.app

import android.app.Application
import com.autobridge.app.core.di.AppConfig
import com.autobridge.app.core.di.ApplicationScope
import com.autobridge.app.core.platform.AndroidBookingNotifier
import com.autobridge.app.core.platform.BookingStatusWatcher
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import javax.inject.Inject

@HiltAndroidApp
class AutoBridgeApp : Application() {
    @Inject lateinit var config: AppConfig
    @Inject lateinit var statusWatcher: BookingStatusWatcher
    @Inject @ApplicationScope lateinit var scope: CoroutineScope

    override fun onCreate() {
        super.onCreate()
        AndroidBookingNotifier.createChannel(this)
        // Demo mode has no FCM: post local notifications on status changes instead.
        if (config.isDemo) statusWatcher.start(scope)
    }
}
