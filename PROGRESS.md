# AutoBridge – overnight progress

> **Read this first – environment blocker.** This cloud session's network policy blocks `dl.google.com`, which serves
> Google Maven (AGP, AndroidX, Compose, Firebase, Play Services) and the Android SDK. So **`./gradlew assembleDebug
> testDebugUnitTest` could not be run here**, and neither could lint or the instrumented Compose test.
> What *was* verified:
> - `:core:model`, `:core:domain`, `:core:data` (all business rules + demo data) build and pass **54 unit tests**
>   (`tools/verify-core.sh`).
> - All UI + ViewModel sources (everything except `core/data/firebase`, `core/platform`, `core/di/AppModule.kt`,
>   `MainActivity`, `AutoBridgeApp`) **compile with the Compose compiler** against JetBrains Compose Desktop 1.6.2 + small
>   stubs for Android-only APIs, and the **8 app ViewModel tests pass** (`tools/jvm-harness/run.sh`): 62/62 green.
> - The excluded Android/Firebase files were reviewed by hand against the APIs but never compiled. Expect a few
>   small compile fixes on the first real `./gradlew` run (most likely in `core/data/firebase` or `core/platform`).
> To unblock: allow `dl.google.com` and `maven.google.com` in the environment's network settings (or build locally).

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| 0 | Make it build | **Partial** – project created from scratch (repo was empty); Gradle/AGP 8.7.3/Kotlin 2.0.21 setup done; can't run AGP here (see above) |
| 1 | Brand & model catalogue + add-vehicle flow | Done (40 brands / 225 models incl. EVs; Indian + BH reg validation) |
| 2 | Location (Fused + permission on tap, saved addresses, Home chip) | Done |
| 3 | Partners, packages, repositories, ranking, filters + tests | Done |
| 4 | Marketplace UI (Home, Explore, Partner detail, Favourites) | Done |
| 5 | Trip types + TripFlow + timeline | Done |
| 6 | PricingEngine + breakdown | Done |
| 7 | Booking stepper (SavedStateHandle), snapshots, Firestore mappers + rules | Done |
| 8 | Booking management (reschedule, cancel+fee, contact, rate, filters, book again) | Done |
| 9 | Notifications (local in demo, FCM token, functions sample, permission after first booking) | Done (functions not deployed/compiled) |
| 10 | Role modes (partner / rider / ops) + rules per role | Done |
| 11 | Polish | **Partial** – empty/loading/error states, offline banner, strings in resources, content descriptions, ViewModel tests, Compose UI test written, README. Lint and the UI test not run (no AGP). |

## How to test in demo mode
No `google-services.json`, no keys → demo mode automatically. All demo data is labelled "Demo …".
1. **Login:** any 10-digit number → OTP **123456** → enter a name.
2. **Home:** location chip (Koramangala demo GPS; pick saved address/area or "Use current location"), vehicle switcher
   (Swift + Activa seeded), service reminder, category tiles, "Your Maruti Suzuki service centres", "Best detailing near
   you", popular packages, "Best near you", ongoing booking card.
3. **Add vehicle:** Home → "Add vehicle" chip → Car/Bike → search brand → model → fuel (skipped for single-fuel) →
   reg no. (try `KA01AB1234`, `22 BH 1234 AB`, invalid `XX01AB1234`), year, km, last service date.
4. **Explore:** search, category chips, radius, open now, verified, "Fits <vehicle>", sort.
5. **Partner detail:** AutoBridge rating vs separately labelled Google rating, hours, Directions/Call/WhatsApp,
   packages, demo reviews, heart = favourite (Profile → Favourites).
6. **Book:** "Book with pickup" or a package → stepper: Service (package/issues/notes/≤3 photos) → Trip type
   (Pickup & drop / Pickup only / Drop only – drop only asks for a job card no.) → Date & slot (full slots greyed, 8–10 AM
   +₹30) → Review (price breakdown) → Confirm. Allow notifications when asked; within ~4 s the demo partner confirms
   and ~8 s a demo rider is assigned (local notifications).
7. **Manage:** Bookings tab filters; booking detail → timeline, reschedule (before rider), cancel with reason (fee once
   a rider is assigned), call/WhatsApp partner & rider, Book again; rate after completion (AB-DEMO01 is completed).
8. **Role switching:** Profile → tap the **Version** row 7 times → Demo role switcher → Partner / Rider / Ops / Customer.
   - **Partner** (Demo Shine Detailing – Koramangala): Bookings tab → AB-DEMO02 → Accept/Decline; AB-DEMO03 (at
     workshop, "from" price) → add estimate lines → Share estimate. Packages / Hours / Earnings tabs.
   - **Rider** (Demo Rider Ravi): AB-DEMO05 → "Mark: Rider on the way" → walkaround (take photos or "Fill with demo
     photos") → "Vehicle picked up" → handover checklist → "At the workshop" …
   - **Ops:** needs-a-rider list (AB-DEMO04) → assign rider, override status; Partners tab (verify, commission);
     Shop requests tab.
   - Full end-to-end on your own booking: book as customer → switch to Ops → assign Demo Rider Ravi → switch to Rider →
     progress pickup → switch to Partner (only for Shine Detailing bookings) → estimate / start service / ready →
     Rider → delivery walkaround → Customer → approve estimate, rate.

## Config for real mode
- `app/google-services.json` (package `com.autobridge.app`) → switches Auth/Firestore/Storage/FCM on (plugin applied
  only if the file exists). Enable Phone auth (+ SHA-1/256), Firestore, Storage, FCM.
- Deploy `firestore.rules`, `storage.rules`, `functions/` (`firebase deploy --only firestore:rules,storage,functions`).
- Roles: custom claims `{role:"partner", partnerId}`, `{role:"rider", riderId}`, `{role:"ops"}` via the `setRole`
  callable (bootstrap the first ops user with the Admin SDK).
- Seed `partners` (with `isPartner: true` to be bookable), `packages`, `riders` in Firestore.
- `local.properties`: `PLACES_API_KEY=` (Places API (New)) to enable "Not yet on AutoBridge" suggestions + "Request
  this shop". `MAPS_API_KEY=` reserved (manifest placeholder; not used yet). Never commit `local.properties`.

## Known issues / limitations
- App module never built with AGP here (see top). Lint not run. Instrumented UI test (`MainDemoPathTest`) not run.
- Address pinning uses current location or quick-pick areas – no map picker (Maps SDK not added).
- Issue names, cancel reasons and checklist items are English strings in `core/domain` (they are snapshotted into
  bookings as data); everything else is in string resources.
- Reschedule dialog assumes slot capacity 3 (the booking snapshot doesn't carry the partner's capacity).
- Firestore slot availability relies on the Cloud Function maintaining `slotCounts`; without functions every slot shows free.
- Firebase phone auth needs an Activity (held weakly by `ActivityProvider`); reCAPTCHA/Play Integrity setup required.
- In Firebase mode the role is read from custom claims at sign-in; changing a claim needs sign-out/in.
- Demo bookings auto-confirm/assign a rider unless the partner is the demo partner (so partner mode can act on them).

## Top 3 next steps
1. Run `./gradlew assembleDebug testDebugUnitTest lint connectedDebugAndroidTest` on a machine with Google Maven and fix
   whatever the first real compile reports (likely small, in Firebase/platform code).
2. Wire a real Firebase project: deploy rules/functions, seed partners/packages/riders, test phone auth + FCM end to end.
3. Add a map-based address picker + live rider tracking, and payments (UPI) with invoices.

## Decision log
- Repo was empty except README/.gitignore: built the project from scratch using the requested architecture.
- **Environment blocker:** `dl.google.com` (Google Maven + Android SDK downloads) is blocked by this session's network
  policy. AGP, AndroidX, Compose, Firebase and Play Services cannot be resolved here, so `./gradlew assembleDebug` cannot
  run in this container. Workarounds:
  - Business logic lives in pure-Kotlin modules `:core:model`, `:core:domain`, `:core:data` that build and test against
    Maven Central only. A harness (`tools/verify-core.sh`) builds/tests them without AGP.
  - The Android SDK platform was assembled locally from Robolectric's `android-all` jar (Maven Central) — only needed
    for this container; on a normal machine use the regular SDK.
- Modules: `:core:model` (models + TripFlow + BookingRules + registration validation), `:core:domain` (repository
  contracts, PricingEngine, PartnerRanker/PartnerSearch, BookingFactory/BookingActions, reminders),
  `:core:data` (demo repositories + catalogue parser), `:app` (DI, Firebase data sources, platform services, UI,
  navigation, features).
- Firebase implementations sit in `:app` under `core/data/firebase` because they need the Android SDK.
- Demo mode is chosen automatically when `app/google-services.json` is absent (the google-services plugin is only
  applied when the file exists).
- Ranking: Bayesian (prior mean 3.8, weight 20) 45% + review volume (log, saturates at 500) 15% + distance within radius
  25% + verified 10% + open now 5%.
- Status flow uses one enum for all trip types; `TripFlow.steps()` gives the per-trip sequence. The estimate step is
  included when the package is "from"-priced, there's no package, or the partner added extras to a fixed package.
  Drop-only skips estimates (the job is already running at the workshop) and requires a job card number.
- Estimate lines are extras on top of the booked package; an estimate with zero lines can be approved in one tap.
- Cancellation allowed until the vehicle is handed over (before PICKED_UP; drop-only until DROP_EN_ROUTE). Fee ₹99 car /
  ₹49 bike once a rider is assigned. Reschedule only before a rider is assigned.
- Rider transitions are blocked until the walkaround (5 angles) is complete for PICKED_UP / workshop pickup / delivery,
  and until every checklist item is ticked for AT_WORKSHOP.
- Firestore mapping is generic (kotlinx-serialization JSON ⇄ Map) plus flattened query fields (`partnerId`,
  `slotEpochDay`, `active`). Null fields are omitted; rules read missing fields with `get(key, default)`.
- Demo persistence: SharedPreferences via `KeyValueStore`, so demo data survives restarts. Clear app data to reset.
- Notification permission is requested once, right after the first booking (booking detail opened with justBooked).
- Places suggestions are never faked in demo mode (disabled without a key).
- Icons limited to long-standing Material icons to reduce compile risk; no brand logos anywhere (generic car glyph).
