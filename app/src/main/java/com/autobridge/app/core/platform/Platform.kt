package com.autobridge.app.core.platform

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.core.content.ContextCompat
import com.autobridge.core.domain.repository.KeyValueStore
import com.autobridge.core.domain.repository.LocationProvider
import com.autobridge.core.domain.repository.LocationResult
import com.autobridge.core.model.GeoPoint
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.tasks.await
import java.lang.ref.WeakReference
import javax.inject.Inject
import javax.inject.Singleton

class SharedPrefsKeyValueStore(context: Context) : KeyValueStore {
    private val prefs = context.getSharedPreferences("autobridge", Context.MODE_PRIVATE)
    override fun getString(key: String): String? = prefs.getString(key, null)
    override fun putString(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }
}

/** Fused Location. Permission is requested by the UI when the user taps "Use current location". */
class FusedLocationProvider(private val context: Context) : LocationProvider {
    override val isDemo = false

    override fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    override suspend fun currentLocation(): LocationResult {
        if (!hasPermission()) return LocationResult.PermissionDenied
        return runCatching {
            val client = LocationServices.getFusedLocationProviderClient(context)
            val loc = client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token).await()
                ?: client.lastLocation.await()
            if (loc == null) LocationResult.Unavailable else LocationResult.Success(GeoPoint(loc.latitude, loc.longitude))
        }.getOrDefault(LocationResult.Unavailable)
    }
}

/** Emits false when the device has no validated internet connection. */
@Singleton
class ConnectivityObserver @Inject constructor(@dagger.hilt.android.qualifiers.ApplicationContext private val context: Context) {
    val isOnline: Flow<Boolean> = callbackFlow {
        val cm = checkNotNull(context.getSystemService(ConnectivityManager::class.java))
        fun current(): Boolean = cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(true) }
            override fun onLost(network: Network) { trySend(current()) }
            override fun onUnavailable() { trySend(false) }
        }
        trySend(current())
        val request = NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build()
        cm.registerNetworkCallback(request, callback)
        awaitClose { cm.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()
}

/** Gives Firebase phone auth access to the current Activity without leaking it. */
@Singleton
class ActivityProvider @Inject constructor() {
    private var ref: WeakReference<Activity>? = null
    fun set(activity: Activity?) { ref = activity?.let { WeakReference(it) } }
    fun get(): Activity? = ref?.get()
}
