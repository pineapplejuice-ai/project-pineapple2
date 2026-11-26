# AutoBridge – overnight progress log

(Summary at the top will be rewritten at the end of the run.)

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
