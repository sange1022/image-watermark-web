#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER="$ROOT/mac-helper"
SDK="${SDKROOT:-/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk}"
MODE="${1:---verify}"
BUILD="$HELPER/.build"
APP="$HELPER/dist/水印实况助手（试用）.app"
mkdir -p "$BUILD" "$APP/Contents/MacOS" "$APP/Contents/Resources"
INCLUDES=(-I"$HELPER/Vendor/GCDWebServer/Core" -I"$HELPER/Vendor/GCDWebServer/Requests" -I"$HELPER/Vendor/GCDWebServer/Responses")
OBJECTS=()
for SOURCE in "$HELPER"/Vendor/GCDWebServer/Core/*.m "$HELPER/Vendor/GCDWebServer/Requests/GCDWebServerDataRequest.m" "$HELPER/Vendor/GCDWebServer/Responses/GCDWebServerDataResponse.m" "$HELPER/Vendor/GCDWebServer/Responses/GCDWebServerFileResponse.m" "$HELPER/Sources/HelperCore/WMServer.m"; do
  OBJECT="$BUILD/$(basename "$SOURCE" .m).o"
  xcrun clang -isysroot "$SDK" -mmacosx-version-min=13.0 -fobjc-arc -O2 -w -c "$SOURCE" "${INCLUDES[@]}" -o "$OBJECT"
  OBJECTS+=("$OBJECT")
done
xcrun swiftc -sdk "$SDK" -target arm64-apple-macosx13.0 -O -swift-version 5 \
  -import-objc-header "$HELPER/Sources/HelperCore/WMServer.h" \
  "$HELPER"/Sources/HelperCore/*.swift "$HELPER"/Sources/HelperApp/*.swift "${OBJECTS[@]}" \
  -framework Foundation -framework CFNetwork -framework Security -framework SystemConfiguration -lz \
  -o "$APP/Contents/MacOS/WatermarkPhotoHelper"
cp "$HELPER/Info.plist" "$APP/Contents/Info.plist"
cp "$HELPER/Vendor/GCDWebServer/LICENSE" "$APP/Contents/Resources/GCDWebServer-LICENSE.txt"
codesign --force --sign - "$APP"
if [[ "$MODE" == "--build-only" ]]; then exit 0; fi
pkill -x WatermarkPhotoHelper 2>/dev/null || true
open -n "$APP"
if [[ "$MODE" == "--verify" ]]; then
  sleep 2
  pgrep -x WatermarkPhotoHelper >/dev/null
fi
if [[ "$MODE" == "--logs" ]]; then
  /usr/bin/log stream --level info --predicate 'process == "WatermarkPhotoHelper"'
fi
