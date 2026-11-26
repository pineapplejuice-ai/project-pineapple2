package com.autobridge.app.core.data.firebase

import android.net.Uri
import com.autobridge.app.core.platform.ActivityProvider
import com.autobridge.core.data.StoredValue
import com.autobridge.core.domain.repository.*
import com.autobridge.core.model.*
import com.google.firebase.FirebaseException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.serialization.builtins.serializer
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

/**
 * Firebase phone auth. The role comes from the `role` custom claim (partner|rider|ops), set by an admin via the
 * Admin SDK (see functions/README). Profile data lives in users/{uid}.
 */
class FirebaseAuthRepository(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    private val activityProvider: ActivityProvider,
    scope: CoroutineScope,
) : AuthRepository {
    private val _user = MutableStateFlow<UserProfile?>(null)
    override val currentUser: StateFlow<UserProfile?> = _user.asStateFlow()
    override val isDemo = false
    private var verificationId: String? = null
    private var autoCredential: PhoneAuthCredential? = null

    init {
        auth.addAuthStateListener { a -> scope.launch { _user.value = a.currentUser?.let { loadProfile() } } }
    }

    private suspend fun loadProfile(): UserProfile? {
        val fu = auth.currentUser ?: return null
        val claims = runCatching { fu.getIdToken(true).await().claims }.getOrDefault(emptyMap())
        val doc = runCatching { db.collection("users").document(fu.uid).get().await() }.getOrNull()
        return UserProfile(
            id = fu.uid,
            phone = fu.phoneNumber.orEmpty(),
            name = doc?.getString("name").orEmpty(),
            role = UserRole.fromClaim(claims["role"] as? String),
            partnerId = claims["partnerId"] as? String,
            riderId = (claims["riderId"] as? String) ?: if (claims["role"] == "rider") fu.uid else null,
        )
    }

    override suspend fun sendOtp(phone: String): OtpResult {
        val digits = phone.filter { it.isDigit() }.takeLast(10)
        if (digits.length != 10) return OtpResult.Error("Enter a valid 10-digit mobile number")
        val activity = activityProvider.get() ?: return OtpResult.Error("Please try again")
        return suspendCancellableCoroutine { cont ->
            val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                    autoCredential = credential
                    if (cont.isActive) cont.resume(OtpResult.CodeSent)
                }
                override fun onVerificationFailed(e: FirebaseException) {
                    if (cont.isActive) cont.resume(OtpResult.Error(e.localizedMessage ?: "Verification failed"))
                }
                override fun onCodeSent(id: String, token: PhoneAuthProvider.ForceResendingToken) {
                    verificationId = id
                    if (cont.isActive) cont.resume(OtpResult.CodeSent)
                }
            }
            PhoneAuthProvider.verifyPhoneNumber(
                PhoneAuthOptions.newBuilder(auth).setPhoneNumber("+91$digits").setTimeout(60L, TimeUnit.SECONDS)
                    .setActivity(activity).setCallbacks(callbacks).build(),
            )
        }
    }

    override suspend fun verifyOtp(code: String): Result<UserProfile> = runCatching {
        val credential = autoCredential ?: PhoneAuthProvider.getCredential(checkNotNull(verificationId) { "Request an OTP first" }, code)
        auth.signInWithCredential(credential).await()
        val profile = checkNotNull(loadProfile())
        db.collection("users").document(profile.id).set(mapOf("phone" to profile.phone), SetOptions.merge()).await()
        _user.value = profile
        profile
    }

    override suspend fun updateName(name: String) {
        val u = _user.value ?: return
        db.collection("users").document(u.id).set(mapOf("name" to name.trim()), SetOptions.merge()).await()
        _user.value = u.copy(name = name.trim())
    }

    override suspend fun signOut() { auth.signOut(); _user.value = null }
    override suspend fun setDemoRole(role: UserRole) = Unit
}

@OptIn(ExperimentalCoroutinesApi::class)
private fun <T> AuthRepository.perUser(block: (String) -> Flow<T>, empty: T): Flow<T> =
    currentUser.map { it?.id }.distinctUntilChanged().flatMapLatest { uid -> if (uid == null) flowOf(empty) else block(uid) }

class FirestoreVehicleRepository(private val db: FirebaseFirestore, private val auth: AuthRepository, store: KeyValueStore) : VehicleRepository {
    private val selected = StoredValue(store, "fb.selectedVehicle", String.serializer())
    private val selectedId = MutableStateFlow(selected.read())
    private fun col(uid: String) = db.collection("users").document(uid).collection("vehicles")

    override fun observeVehicles(): Flow<List<Vehicle>> = auth.perUser({ col(it).observe(Vehicle.serializer()) }, emptyList())
    override fun observeSelectedVehicleId(): Flow<String?> = combine(selectedId, observeVehicles()) { id, list -> id?.takeIf { s -> list.any { it.id == s } } ?: list.firstOrNull()?.id }
    override suspend fun addVehicle(vehicle: Vehicle) {
        val uid = auth.currentUser.value?.id ?: return
        col(uid).document(vehicle.id).set(FirestoreMapper.toMap(Vehicle.serializer(), vehicle)).await()
        selectVehicle(vehicle.id)
    }
    override suspend fun deleteVehicle(id: String) { auth.currentUser.value?.id?.let { col(it).document(id).delete().await() } }
    override suspend fun selectVehicle(id: String) { selectedId.value = id; selected.write(id) }
}

class FirestoreAddressRepository(private val db: FirebaseFirestore, private val auth: AuthRepository, store: KeyValueStore) : AddressRepository {
    private val storedLocation = StoredValue(store, "fb.location", UserLocation.serializer())
    private val location = MutableStateFlow(storedLocation.read())
    private fun col(uid: String) = db.collection("users").document(uid).collection("addresses")

    override fun observeAddresses(): Flow<List<SavedAddress>> = auth.perUser({ col(it).observe(SavedAddress.serializer()) }, emptyList())
    override fun observeCurrentLocation(): Flow<UserLocation?> = location
    override suspend fun saveAddress(address: SavedAddress) {
        auth.currentUser.value?.id?.let { col(it).document(address.id).set(FirestoreMapper.toMap(SavedAddress.serializer(), address)).await() }
    }
    override suspend fun deleteAddress(id: String) { auth.currentUser.value?.id?.let { col(it).document(id).delete().await() } }
    override suspend fun setCurrentLocation(location: UserLocation) { this.location.value = location; storedLocation.write(location) }
}

/** partners/{id} (source of truth), packages/{id}, partners/{id}/reviews/{id}. */
class FirestorePartnerRepository(private val db: FirebaseFirestore) : PartnerRepository {
    override fun observePartners(): Flow<List<Partner>> = db.collection("partners").observe(Partner.serializer())
    override fun observePackages(): Flow<List<ServicePackage>> = db.collection("packages").observe(ServicePackage.serializer())
    override fun observeReviews(partnerId: String): Flow<List<Review>> =
        db.collection("partners").document(partnerId).collection("reviews")
            .orderBy("createdAtMillis", com.google.firebase.firestore.Query.Direction.DESCENDING).limit(30).observe(Review.serializer())
    override suspend fun partner(id: String): Partner? =
        db.collection("partners").document(id).get().await().let { FirestoreMapper.fromDoc(Partner.serializer(), it) }
    override suspend fun savePartner(partner: Partner) {
        db.collection("partners").document(partner.id).set(FirestoreMapper.toMap(Partner.serializer(), partner)).await()
    }
    override suspend fun savePackage(pkg: ServicePackage) {
        db.collection("packages").document(pkg.id).set(FirestoreMapper.toMap(ServicePackage.serializer(), pkg)).await()
    }
    override suspend fun deletePackage(id: String) { db.collection("packages").document(id).delete().await() }
}

class FirestoreBookingRepository(private val db: FirebaseFirestore) : BookingRepository {
    private val col get() = db.collection("bookings")

    /** Flattened fields used by queries and security rules. */
    private fun Booking.toDoc(): Map<String, Any?> = FirestoreMapper.toMap(Booking.serializer(), this) + mapOf(
        "partnerId" to partner.partnerId,
        "slotEpochDay" to slot.epochDay,
        "active" to isActive,
    )

    override fun observeCustomerBookings(customerId: String) = col.whereEqualTo("customerId", customerId).observe(Booking.serializer()).map { l -> l.sortedByDescending { it.createdAtMillis } }
    override fun observePartnerBookings(partnerId: String) = col.whereEqualTo("partnerId", partnerId).observe(Booking.serializer()).map { l -> l.sortedByDescending { it.createdAtMillis } }
    override fun observeRiderBookings(riderId: String) = col.whereEqualTo("riderId", riderId).observe(Booking.serializer()).map { l -> l.sortedBy { it.slot.epochDay } }
    override fun observeAllBookings() = col.orderBy("createdAtMillis", com.google.firebase.firestore.Query.Direction.DESCENDING).limit(200).observe(Booking.serializer())
    override fun observeBooking(id: String) = col.document(id).observe(Booking.serializer())

    override suspend fun bookedCounts(partnerId: String, epochDay: Long): Map<String, Int> {
        // Reads the public slot counter document maintained by the Cloud Function (customers can't read others' bookings).
        val doc = db.collection("slotCounts").document("${partnerId}_$epochDay").get().await()
        return doc.data.orEmpty().mapNotNull { (k, v) -> (v as? Number)?.let { k to it.toInt() } }.toMap()
    }

    override suspend fun create(booking: Booking): Result<Booking> = runCatching {
        col.document(booking.id).set(booking.toDoc() + mapOf("serverCreatedAt" to FieldValue.serverTimestamp())).await()
        booking
    }

    override suspend fun update(booking: Booking): Result<Booking> = runCatching {
        col.document(booking.id).set(booking.toDoc()).await()
        booking
    }
}

class FirestoreShopRequestRepository(private val db: FirebaseFirestore) : ShopRequestRepository {
    override fun observeRequests() = db.collection("shopRequests").observe(ShopRequest.serializer())
    override suspend fun submit(request: ShopRequest) {
        db.collection("shopRequests").document(request.id).set(FirestoreMapper.toMap(ShopRequest.serializer(), request)).await()
    }
    override suspend fun updateStatus(id: String, status: ShopRequestStatus) {
        db.collection("shopRequests").document(id).update("status", status.name).await()
    }
}

class FirestoreFavouritesRepository(private val db: FirebaseFirestore, private val auth: AuthRepository) : FavouritesRepository {
    private fun doc(uid: String) = db.collection("users").document(uid)
    override fun observeFavouriteIds(): Flow<Set<String>> = auth.perUser({ uid ->
        callbackFlow {
            val reg = doc(uid).addSnapshotListener { s, _ ->
                @Suppress("UNCHECKED_CAST")
                trySend(((s?.get("favourites") as? List<String>) ?: emptyList()).toSet())
            }
            awaitClose { reg.remove() }
        }
    }, emptySet())
    override suspend fun toggle(partnerId: String) {
        val uid = auth.currentUser.value?.id ?: return
        val current = observeFavouriteIds().first()
        val op = if (partnerId in current) FieldValue.arrayRemove(partnerId) else FieldValue.arrayUnion(partnerId)
        doc(uid).set(mapOf("favourites" to op), SetOptions.merge()).await()
    }
}

class FirestoreRiderRepository(private val db: FirebaseFirestore) : RiderRepository {
    override fun observeRiders() = db.collection("riders").observe(Rider.serializer())
}

class FirebasePhotoUploader(private val storage: FirebaseStorage) : PhotoUploader {
    override suspend fun upload(localUri: String, path: String): String {
        if (!localUri.startsWith("content:") && !localUri.startsWith("file:")) return localUri
        val ref = storage.reference.child(path)
        ref.putFile(Uri.parse(localUri)).await()
        return ref.downloadUrl.await().toString()
    }
}

class FirestorePushTokenRepository(private val db: FirebaseFirestore) : PushTokenRepository {
    override suspend fun saveToken(userId: String, token: String) {
        db.collection("users").document(userId).set(mapOf("fcmTokens" to FieldValue.arrayUnion(token)), SetOptions.merge()).await()
    }
}

