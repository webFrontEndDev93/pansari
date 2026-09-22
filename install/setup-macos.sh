#!/usr/bin/env bash
# Builds a Pansari.app on the desktop so staff double-click an icon, not a script.
#   ./install/setup-macos.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
APP="$HOME/Desktop/Pansari.app"

echo
echo "  Setting up Pansari..."
echo

# Node is installed on this computer separately, never shipped with Pansari.
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is not installed."
  echo "  Install Node 20 or newer from https://nodejs.org, then run this again."
  exit 1
elif [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "  Pansari needs Node 20 or newer; this Mac has $(node -v)."
  exit 1
else
  echo "  Node $(node -v) found."
fi

chmod +x "$HERE/pansari-launch.sh"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Pansari</string>
  <key>CFBundleDisplayName</key><string>Pansari</string>
  <key>CFBundleIdentifier</key><string>com.pansari.pos</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Pansari</string>
  <key>CFBundleIconFile</key><string>Pansari</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/Pansari" <<LAUNCH
#!/bin/sh
exec "${HERE}/pansari-launch.sh"
LAUNCH
chmod +x "$APP/Contents/MacOS/Pansari"
cp "$HERE/Pansari.icns" "$APP/Contents/Resources/Pansari.icns"

# Gatekeeper flags anything unsigned that arrived from outside; clear it so the
# shop is not asked to approve their own till.
xattr -cr "$APP" 2>/dev/null || true
touch "$APP"
echo "  Put Pansari.app on the desktop."

echo
read -r -p "  Start Pansari automatically when this Mac turns on? (Y/n) " auto
if [[ -z "${auto}" || "${auto}" =~ ^[Yy] ]]; then
  osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$APP\", hidden:true}" >/dev/null
  echo "  It will now open by itself at login."
else
  echo "  Skipped. Staff can open it from the desktop icon."
fi

echo
echo "  Done. Double-click Pansari on the desktop."
echo
