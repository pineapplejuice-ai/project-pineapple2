package com.autobridge.app.core.data.firebase

import com.autobridge.core.data.AppJson
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.*

/**
 * Maps the @Serializable domain models to Firestore maps and back, via kotlinx JSON. Nested objects become maps,
 * enums become strings, so documents stay readable in the console and queryable (e.g. `status`, `customerId`).
 * Query-only helper fields (see [withIndexFields]) are added on write and ignored on read.
 */
object FirestoreMapper {
    fun <T> toMap(serializer: KSerializer<T>, value: T): Map<String, Any?> =
        (AppJson.encodeToJsonElement(serializer, value) as JsonObject).toFirestore()

    fun <T> fromMap(serializer: KSerializer<T>, map: Map<String, Any?>): T? =
        runCatching { AppJson.decodeFromJsonElement(serializer, map.toJson()) }.getOrNull()

    fun <T> fromDoc(serializer: KSerializer<T>, doc: DocumentSnapshot): T? = doc.data?.let { fromMap(serializer, it) }

    private fun JsonObject.toFirestore(): Map<String, Any?> = mapValues { it.value.toFirestoreValue() }

    private fun JsonElement.toFirestoreValue(): Any? = when (this) {
        is JsonNull -> null
        is JsonObject -> toFirestore()
        is JsonArray -> map { it.toFirestoreValue() }
        is JsonPrimitive -> if (isString) content else booleanOrNull ?: longOrNull ?: doubleOrNull ?: content
    }

    private fun Any?.toJson(): JsonElement = when (this) {
        null -> JsonNull
        is String -> JsonPrimitive(this)
        is Boolean -> JsonPrimitive(this)
        is Number -> JsonPrimitive(this)
        is Timestamp -> JsonPrimitive(toDate().time)
        is Map<*, *> -> JsonObject(entries.associate { it.key.toString() to it.value.toJson() })
        is List<*> -> JsonArray(map { it.toJson() })
        else -> JsonPrimitive(toString())
    }
}

fun <T> Query.observe(serializer: KSerializer<T>): Flow<List<T>> = callbackFlow {
    val reg = addSnapshotListener { snap, err ->
        if (err != null) { close(err); return@addSnapshotListener }
        trySend(snap?.documents?.mapNotNull { FirestoreMapper.fromDoc(serializer, it) }.orEmpty())
    }
    awaitClose { reg.remove() }
}

fun <T> com.google.firebase.firestore.DocumentReference.observe(serializer: KSerializer<T>): Flow<T?> = callbackFlow {
    val reg = addSnapshotListener { snap, err ->
        if (err != null) { close(err); return@addSnapshotListener }
        trySend(snap?.let { FirestoreMapper.fromDoc(serializer, it) })
    }
    awaitClose { reg.remove() }
}
