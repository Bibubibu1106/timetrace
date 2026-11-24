#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/Users/zhanshiqing/timetrace-todo"
SHARED_TOOLS="/Users/zhanshiqing/laundry-rain-guard/.android-toolchain"
TOOLS_DIR="$BASE_DIR/.android-toolchain"
if [ -d "$SHARED_TOOLS/build-tools" ] && [ -f "$SHARED_TOOLS/android.jar" ]; then
  TOOLS_DIR="$SHARED_TOOLS"
fi

PROJ_DIR="$BASE_DIR/android-apk-project/app/src/main"
ASSETS_DIR="$PROJ_DIR/assets"
BUILD_DIR="$BASE_DIR/.apk-build"
OUT_APK="$BASE_DIR/时光待办.apk"

mkdir -p "$ASSETS_DIR" "$BUILD_DIR"

echo "[1/4] Syncing Web/PWA assets into Android assets/..."
cp "$BASE_DIR/index.html" "$BASE_DIR/styles.css" "$BASE_DIR/store.js" "$BASE_DIR/sync.js" "$BASE_DIR/app.js" "$BASE_DIR/manifest.json" "$BASE_DIR/icon.svg" "$BASE_DIR/icon-192.png" "$BASE_DIR/apple-touch-icon.png" "$ASSETS_DIR/"

export JAVA_HOME="$TOOLS_DIR/jdk/zulu-17.jdk/Contents/Home"
if [ ! -d "$JAVA_HOME" ]; then
  export JAVA_HOME="$TOOLS_DIR/jdk"
fi
export PATH="$JAVA_HOME/bin:$PATH"

AAPT2="$TOOLS_DIR/build-tools/aapt2"
D8="$TOOLS_DIR/build-tools/d8"
ZIPALIGN="$TOOLS_DIR/build-tools/zipalign"
APKSIGNER="$TOOLS_DIR/build-tools/apksigner"
ANDROID_JAR="$TOOLS_DIR/android.jar"

echo "[2/4] Compiling resources & linking assets..."
rm -rf "$BUILD_DIR"/*
mkdir -p "$BUILD_DIR/compiled_res" "$BUILD_DIR/gen" "$BUILD_DIR/classes" "$BUILD_DIR/dex"

"$AAPT2" compile --dir "$PROJ_DIR/res" -o "$BUILD_DIR/compiled_res/res.zip"
"$AAPT2" link \
  -I "$ANDROID_JAR" \
  --manifest "$PROJ_DIR/AndroidManifest.xml" \
  -A "$ASSETS_DIR" \
  --java "$BUILD_DIR/gen" \
  -o "$BUILD_DIR/unaligned.apk" \
  "$BUILD_DIR/compiled_res/res.zip"

echo "[3/4] Compiling Java sources & DEX..."
javac -source 11 -target 11 -encoding UTF-8 \
  -cp "$ANDROID_JAR" \
  -d "$BUILD_DIR/classes" \
  "$PROJ_DIR/java/com/zhanshiqing/timetrace/MainActivity.java" \
  "$BUILD_DIR/gen/com/zhanshiqing/timetrace/R.java"

CLASS_FILES=$(find "$BUILD_DIR/classes" -name "*.class")
"$D8" --lib "$ANDROID_JAR" --output "$BUILD_DIR/dex" $CLASS_FILES

cd "$BUILD_DIR/dex"
zip -q "$BUILD_DIR/unaligned.apk" classes.dex
cd "$BASE_DIR"

echo "[4/4] Aligning & signing 时光待办.apk..."
"$ZIPALIGN" -f -p 4 "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/aligned.apk"

KEYSTORE="$BASE_DIR/.apk-build/timetrace-release.jks"
keytool -genkeypair \
  -keystore "$KEYSTORE" \
  -alias timetrace_key \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass 123456 -keypass 123456 \
  -dname "CN=TimeTraceTodo, OU=Personal, O=Standalone, L=Shanghai, ST=Shanghai, C=CN"

"$APKSIGNER" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:123456 \
  --key-pass pass:123456 \
  --v4-signing-enabled false \
  --out "$OUT_APK" \
  "$BUILD_DIR/aligned.apk"

rm -f "$OUT_APK.idsig"
"$APKSIGNER" verify --verbose "$OUT_APK"
ls -lh "$OUT_APK"
echo "✅ APK Built Successfully: $OUT_APK"
