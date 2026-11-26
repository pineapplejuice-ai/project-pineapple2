package com.autobridge.core.data

import com.autobridge.core.domain.repository.Clock
import com.autobridge.core.domain.repository.KeyValueStore
import com.autobridge.core.domain.repository.VehicleCatalogueRepository
import com.autobridge.core.model.VehicleCatalogue
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

val AppJson = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

class SystemClock(private val zone: () -> ZoneId = { ZoneId.systemDefault() }) : Clock {
    override fun nowMillis(): Long = System.currentTimeMillis()
    override fun todayEpochDay(): Long = LocalDate.now(zone()).toEpochDay()
    override fun dayOfWeek(): Int = LocalDate.now(zone()).dayOfWeek.value
    override fun minuteOfDay(): Int = Instant.now().atZone(zone()).let { it.hour * 60 + it.minute }
}

object Ids {
    fun new(): String = UUID.randomUUID().toString()
    /** Short human-friendly booking reference, e.g. AB-4F7K2Q. */
    fun bookingRef(): String = "AB-" + UUID.randomUUID().toString().replace("-", "").take(6).uppercase()
}

class InMemoryKeyValueStore : KeyValueStore {
    private val map = mutableMapOf<String, String>()
    override fun getString(key: String): String? = synchronized(map) { map[key] }
    override fun putString(key: String, value: String?) {
        synchronized(map) { if (value == null) map.remove(key) else map[key] = value }
    }
}

/** JSON-persisted value in a KeyValueStore. */
class StoredValue<T>(private val store: KeyValueStore, private val key: String, private val serializer: KSerializer<T>) {
    fun read(): T? = store.getString(key)?.let { runCatching { AppJson.decodeFromString(serializer, it) }.getOrNull() }
    fun write(value: T?) = store.putString(key, value?.let { AppJson.encodeToString(serializer, it) })
}

/** Parses the bundled vehicle catalogue JSON (assets/vehicle_catalogue.json). */
class JsonVehicleCatalogueRepository(private val loadJson: suspend () -> String) : VehicleCatalogueRepository {
    private val mutex = Mutex()
    private var cached: VehicleCatalogue? = null
    override suspend fun catalogue(): VehicleCatalogue = mutex.withLock {
        cached ?: parse(loadJson()).also { cached = it }
    }

    companion object {
        fun parse(json: String): VehicleCatalogue = AppJson.decodeFromString(VehicleCatalogue.serializer(), json)
    }
}
