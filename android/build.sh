#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SONARA APK builder (no Gradle, pure Android SDK CLI tools)
#
# Usage:
#   APP_URL="https://your-sonara-app.com" bash android/build.sh
#
# Rebuild any time with a new (permanent) URL by changing APP_URL.
# Output: android/build/sonara.apk (signed, installable)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TOOLCHAIN="$(cd "$ROOT/.." && pwd)/.toolchain"
JDK="$TOOLCHAIN/jdk-17.0.21+9"
SDK="$TOOLCHAIN/android-sdk"
BT="$SDK/build-tools/34.0.0"
AJAR="$SDK/platforms/android-34/android.jar"

export JAVA_HOME="$JDK"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="$SDK"

APP_URL="${APP_URL:-https://3000-ihz1hwyc8z547rv8z19nj.e2b.app}"
PKG_PATH="app/sonara/music"
OUT="$ROOT/build"

if [ ! -x "$BT/aapt2" ]; then
  echo "ERROR: Android build-tools not found at $BT" >&2
  exit 1
fi

echo "→ Building SONARA APK → $APP_URL"
rm -rf "$OUT"
mkdir -p "$OUT/obj" "$OUT/dex" "$OUT/gen"

# 1. Inject the app URL into MainActivity
sed "s|__APP_URL__|$APP_URL|g" \
  "$ROOT/app/src/java/$PKG_PATH/MainActivity.java" > "$OUT/gen/MainActivity.java"
cp "$ROOT/app/src/java/$PKG_PATH/PlaybackService.java" "$OUT/gen/PlaybackService.java"

# 2. Compile + link resources (aapt2)
"$BT/aapt2" compile --dir "$ROOT/app/res" -o "$OUT/res.zip"
"$BT/aapt2" link \
  -o "$OUT/unsigned.apk" \
  -I "$AJAR" \
  --manifest "$ROOT/app/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  "$OUT/res.zip"

# 3. Compile Java → class files
R_FILE=$(find "$OUT/gen" -name "R.java" | head -1)
javac -source 8 -target 8 -nowarn -encoding UTF-8 \
  -cp "$AJAR" \
  -d "$OUT/obj" \
  "$R_FILE" "$OUT/gen/MainActivity.java" "$OUT/gen/PlaybackService.java"

# 4. Dex (Dalvik bytecode)
CLASSES=$(find "$OUT/obj" -name '*.class')
"$BT/d8" --release --lib "$AJAR" $CLASSES --output "$OUT/dex"

# 5. Add classes.dex into the APK
(cd "$OUT/dex" && zip -q "$OUT/unsigned.apk" classes.dex)

# 6. Zipalign
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# 7. Sign (create keystore once, reuse after)
KEYSTORE="$ROOT/sonara.keystore"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias sonara \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass sonara123 -keypass sonara123 \
    -dname "CN=SONARA, OU=Music, O=SONARA, C=US" >/dev/null 2>&1
fi
"$BT/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:sonara123 \
  --ks-key-alias sonara \
  --out "$OUT/sonara.apk" \
  "$OUT/aligned.apk"

# 8. Verify
"$BT/apksigner" verify --print-certs "$OUT/sonara.apk" >/dev/null 2>&1

SIZE=$(du -h "$OUT/sonara.apk" | cut -f1)
echo "✓ APK built: $OUT/sonara.apk ($SIZE)"
