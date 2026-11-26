#!/usr/bin/env bash
# Builds and tests the pure-Kotlin core modules (:core:model, :core:domain, :core:data) without the Android
# Gradle Plugin. Useful where Google Maven / the Android SDK are unavailable. Requires a JDK 17+ and Gradle 8.x.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/autobridge-verify-core"
mkdir -p "$WORK"
cat > "$WORK/settings.gradle.kts" <<KTS
pluginManagement { repositories { mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositories { mavenCentral() }
    versionCatalogs { create("libs") { from(files("$ROOT/gradle/libs.versions.toml")) } }
}
rootProject.name = "verify-core"
listOf("model", "domain", "data").forEach {
    include(":core:\$it")
    project(":core:\$it").projectDir = file("$ROOT/core/\$it")
}
KTS
GRADLE="${GRADLE:-gradle}"
(cd "$WORK" && "$GRADLE" test --max-workers=2 "$@")
