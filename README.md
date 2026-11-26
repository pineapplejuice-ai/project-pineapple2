# AutoBridge

A Swiggy-style marketplace for car & bike care. Pick your vehicle, see partners near you – your brand's authorised
service centres plus the best detailing studios, car washes, tyre shops, battery, EV service and multi-brand garages –
book a service, and our rider handles **pickup & drop**, **pickup only** or **drop only**.

Trust features: photo walkaround at every handover, an issue checklist the rider goes through with the service advisor,
and line-by-line estimate approval. Partners, riders and ops use the same app in role modes.

Kotlin · Jetpack Compose · Material 3 · Hilt · Firebase (Auth, Firestore, Storage, FCM) · Play Services Location.

## Run it (demo mode)

Demo mode needs **no Firebase config and no API keys**. All data is clearly fake ("Demo Shine Detailing –
Koramangala", "Demo user A.", …) and lives on the device.

```bash
cp local.properties.example local.properties   # set sdk.dir
./gradlew assembleDebug testDebugUnitTest
./gradlew installDebug
```

- Log in with any 10-digit number, OTP **123456**.
- Location defaults to Koramangala, Bengaluru (demo GPS).
- Two demo vehicles and two addresses are pre-seeded; add more from Home → "Add vehicle".
- **Role switcher:** Profile → tap the *Version* row 7 times → choose Customer / Partner / Rider / Ops.
  - Partner = "Demo Shine Detailing – Koramangala" (has a new request AB-DEMO02 and an at-workshop job AB-DEMO03).
  - Rider = "Demo Rider Ravi" (job AB-DEMO05 is waiting to start).
  - Ops sees every booking, partners (verify/commission) and shop requests.
- New bookings are auto-confirmed after a few seconds and a demo rider is assigned, with local notifications.

## Real mode

| Feature | What to add |
| --- | --- |
| Firebase (phone auth, Firestore, Storage, FCM) | `app/google-services.json` from your Firebase project (Android app id `com.autobridge.app`). The google-services plugin is applied only when this file exists. Enable Phone sign-in, Firestore, Storage, Cloud Messaging. Deploy rules + functions: `firebase deploy --only firestore:rules,storage,functions`. Add your SHA-1/SHA-256 for phone auth. |
| Roles | Custom claims via the `setRole` callable (ops only) or Admin SDK: `{ role: "partner", partnerId }`, `{ role: "rider", riderId }`, `{ role: "ops" }`. |
| Google Places suggestions | `PLACES_API_KEY=...` in `local.properties` (Places API (New) enabled). Without it, suggestions are off. |

Partners are only bookable if their Firestore doc has `isPartner: true`. Seed `partners`, `packages` and `riders`
collections from the console or a script (the document shape is the JSON of the Kotlin models in `core/model`).

## Architecture

```
core/model    (pure Kotlin)  models, TripFlow (status flows), BookingRules, RegistrationNumber validation
core/domain   (pure Kotlin)  repository contracts, PricingEngine, PartnerRanker/PartnerSearch, BookingFactory/
                             BookingActions, BookingDraftValidator, SlotRules, ServiceReminders
core/data     (pure Kotlin)  demo repositories (persisted via KeyValueStore), demo data, catalogue parser
app/core/data/firebase       Firestore/Auth/Storage/FCM implementations, Google Places (HTTP) suggestions
app/core/di                  Hilt module – picks demo vs Firebase per feature based on available config
app/core/platform            SharedPreferences store, Fused location, notifications, connectivity
app/core/ui                  theme, labels, formatting, shared components
app/navigation               routes, root NavHost (rebuilt per role area)
app/feature/*                one ViewModel + one StateFlow<UiState> per screen
functions/                   TypeScript Cloud Functions sample (push on status change, ratings, slot counters)
firestore.rules, storage.rules
```

Business rules (pricing, status flows, ranking, validation) live only in `core/model` and `core/domain`, and are unit
tested there. `tools/verify-core.sh` runs those tests with plain Gradle (no Android SDK needed).

### Key rules
- **Pricing:** car ₹249 / bike ₹99 for pickup & drop up to 8 km each way, then ₹15 / ₹8 per extra km per leg; single
  leg = 60%; 8–10 AM slot +₹30; partner commission (default 10%) stored per booking and never shown to customers.
  Cancellation fee (₹99 car / ₹49 bike) only after a rider is assigned.
- **Ranking ("Best near you"):** Bayesian rating (prior 3.8, weight 20) + review volume + distance within radius +
  verified + open now.
- **Trip flows:** see `TripFlow` – fixed-price packages skip the estimate unless the partner adds extras; drop-only asks
  for the workshop job card number.

## Tests
- `./gradlew testDebugUnitTest` – core rules + ViewModel tests.
- `./gradlew connectedDebugAndroidTest` – Compose UI test of the main demo path (login → partner → book).
