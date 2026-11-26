#!/usr/bin/env bash
# JVM harness for environments without Google Maven / the Android SDK (e.g. restricted CI sandboxes).
#  - compiles the app's UI + ViewModel sources with the Compose compiler against JetBrains Compose Desktop 1.6.2
#    (Maven Central) plus small stubs for Android-only APIs (stubs/), and
#  - runs the app ViewModel unit tests + all core module tests.
# Firebase, platform (location/notifications), DI and Activity sources are excluded – build those with ./gradlew.
# Usage: ANDROID_JAR=/path/to/android.jar tools/jvm-harness/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ANDROID_JAR="${ANDROID_JAR:?set ANDROID_JAR to an android.jar (platforms/android-35/android.jar)}"
WORK="${TMPDIR:-/tmp}/autobridge-jvm-harness"
rm -rf "$WORK/app-check/gen" && mkdir -p "$WORK/app-check/gen"
cp -r "$ROOT/tools/jvm-harness/stubs" "$WORK/app-check/"
sed -e "s|__ROOT__|$ROOT|g" -e "s|__ANDROID_JAR__|$ANDROID_JAR|g" "$ROOT/tools/jvm-harness/app-check.gradle.kts.template" > "$WORK/app-check/build.gradle.kts"
cat > "$WORK/settings.gradle.kts" <<KTS
pluginManagement { repositories { mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositories { mavenCentral() }
    versionCatalogs { create("libs") { from(files("$ROOT/gradle/libs.versions.toml")) } }
}
rootProject.name = "autobridge-jvm-harness"
listOf("model", "domain", "data").forEach {
    include(":core:\$it")
    project(":core:\$it").projectDir = file("$ROOT/core/\$it")
}
include(":app-check")
KTS
# Generate R.string / R.drawable ids from the resource XML.
python3 - "$ROOT" "$WORK/app-check/gen/R.kt" <<'PY'
import re, glob, os, sys
root, out_path = sys.argv[1], sys.argv[2]
res = root + "/app/src/main/res"
out, i = ["package com.autobridge.app", "", "object R {"], 0x7f000000
def obj(name, names):
    global i
    out.append(f"    object {name} {{")
    for n in sorted(set(names)):
        i += 1; out.append(f"        const val {n}: Int = {i}")
    out.append("    }")
strings = []
for f in glob.glob(res + "/values/*.xml"): strings += re.findall(r'<string name="(\w+)"', open(f).read())
obj("string", strings)
obj("drawable", [os.path.splitext(os.path.basename(f))[0] for f in glob.glob(res + "/drawable/*.xml")])
out.append("}")
open(out_path, "w").write("\n".join(out) + "\n")
PY
(cd "$WORK" && "${GRADLE:-gradle}" test --max-workers=2 "$@")
