package com.autobridge.app.core.di

import javax.inject.Qualifier

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ApplicationScope

enum class AppMode { DEMO, FIREBASE }

/** What is switched on. Real integrations only switch on when their config exists. */
data class AppConfig(val mode: AppMode, val placesEnabled: Boolean, val versionName: String) {
    val isDemo: Boolean get() = mode == AppMode.DEMO
}
