package com.autobridge.app.core.di

import android.content.Context
import com.autobridge.app.BuildConfig
import com.autobridge.app.core.data.firebase.*
import com.autobridge.app.core.platform.ActivityProvider
import com.autobridge.app.core.platform.AndroidBookingNotifier
import com.autobridge.app.core.platform.FusedLocationProvider
import com.autobridge.app.core.platform.SharedPrefsKeyValueStore
import com.autobridge.core.data.JsonVehicleCatalogueRepository
import com.autobridge.core.data.SystemClock
import com.autobridge.core.data.demo.*
import com.autobridge.core.domain.booking.BookingActions
import com.autobridge.core.domain.booking.BookingFactory
import com.autobridge.core.domain.partner.PartnerSearch
import com.autobridge.core.domain.pricing.PricingEngine
import com.autobridge.core.domain.repository.*
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides @Singleton
    fun appConfig(@ApplicationContext ctx: Context): AppConfig = AppConfig(
        mode = if (BuildConfig.HAS_GOOGLE_SERVICES && FirebaseApp.getApps(ctx).isNotEmpty()) AppMode.FIREBASE else AppMode.DEMO,
        placesEnabled = BuildConfig.PLACES_API_KEY.isNotBlank(),
        versionName = BuildConfig.VERSION_NAME,
    )

    @Provides @Singleton @ApplicationScope
    fun appScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides @Singleton
    fun keyValueStore(@ApplicationContext ctx: Context): KeyValueStore = SharedPrefsKeyValueStore(ctx)

    @Provides @Singleton fun clock(): Clock = SystemClock()
    @Provides @Singleton fun pricing(): PricingEngine = PricingEngine()
    @Provides @Singleton fun bookingFactory(p: PricingEngine): BookingFactory = BookingFactory(p)
    @Provides @Singleton fun bookingActions(p: PricingEngine): BookingActions = BookingActions(p)
    @Provides @Singleton fun partnerSearch(): PartnerSearch = PartnerSearch()

    private fun db(): FirebaseFirestore = FirebaseFirestore.getInstance()

    @Provides @Singleton
    fun auth(cfg: AppConfig, kv: KeyValueStore, activity: ActivityProvider, @ApplicationScope scope: CoroutineScope): AuthRepository =
        if (cfg.isDemo) DemoAuthRepository(kv) else FirebaseAuthRepository(FirebaseAuth.getInstance(), db(), activity, scope)

    @Provides @Singleton
    fun catalogue(@ApplicationContext ctx: Context): VehicleCatalogueRepository =
        JsonVehicleCatalogueRepository { ctx.assets.open("vehicle_catalogue.json").bufferedReader().use { it.readText() } }

    @Provides @Singleton
    fun vehicles(cfg: AppConfig, kv: KeyValueStore, clock: Clock, auth: AuthRepository): VehicleRepository =
        if (cfg.isDemo) DemoVehicleRepository(kv, clock) else FirestoreVehicleRepository(db(), auth, kv)

    @Provides @Singleton
    fun addresses(cfg: AppConfig, kv: KeyValueStore, auth: AuthRepository): AddressRepository =
        if (cfg.isDemo) DemoAddressRepository(kv) else FirestoreAddressRepository(db(), auth, kv)

    @Provides @Singleton
    fun location(cfg: AppConfig, @ApplicationContext ctx: Context): LocationProvider =
        if (cfg.isDemo) DemoLocationProvider() else FusedLocationProvider(ctx)

    @Provides @Singleton
    fun partners(cfg: AppConfig, kv: KeyValueStore, clock: Clock): PartnerRepository =
        if (cfg.isDemo) DemoPartnerRepository(kv, clock) else FirestorePartnerRepository(db())

    @Provides @Singleton
    fun places(cfg: AppConfig): PlacesSuggestionRepository =
        if (cfg.placesEnabled) GooglePlacesSuggestionRepository(BuildConfig.PLACES_API_KEY) else DisabledPlacesSuggestionRepository()

    @Provides @Singleton
    fun shopRequests(cfg: AppConfig, kv: KeyValueStore): ShopRequestRepository =
        if (cfg.isDemo) DemoShopRequestRepository(kv) else FirestoreShopRequestRepository(db())

    @Provides @Singleton
    fun favourites(cfg: AppConfig, kv: KeyValueStore, auth: AuthRepository): FavouritesRepository =
        if (cfg.isDemo) DemoFavouritesRepository(kv) else FirestoreFavouritesRepository(db(), auth)

    @Provides @Singleton
    fun bookings(cfg: AppConfig, kv: KeyValueStore, clock: Clock, actions: BookingActions, @ApplicationScope scope: CoroutineScope): BookingRepository =
        if (cfg.isDemo) DemoBookingRepository(kv, clock, actions, scope) else FirestoreBookingRepository(db())

    @Provides @Singleton
    fun riders(cfg: AppConfig): RiderRepository = if (cfg.isDemo) DemoRiderRepository() else FirestoreRiderRepository(db())

    @Provides @Singleton
    fun photos(cfg: AppConfig): PhotoUploader = if (cfg.isDemo) PassThroughPhotoUploader() else FirebasePhotoUploader(FirebaseStorage.getInstance())

    @Provides @Singleton
    fun pushTokens(cfg: AppConfig): PushTokenRepository = if (cfg.isDemo) NoOpPushTokenRepository() else FirestorePushTokenRepository(db())

    @Provides @Singleton
    fun settings(kv: KeyValueStore): SettingsRepository = DemoSettingsRepository(kv)

    @Provides @Singleton
    fun notifier(@ApplicationContext ctx: Context): BookingNotifier = AndroidBookingNotifier(ctx)
}
