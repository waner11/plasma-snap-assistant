#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EFFECT_DIR="$ROOT_DIR/kwin-effect-plasma-snap-assistant"

if ! command -v kpackagetool6 >/dev/null 2>&1; then
  echo "[PlasmaSnap] kpackagetool6 is not available on this host"
  exit 1
fi

echo "[PlasmaSnap] Installing/upgrading KWin effect package"
kpackagetool6 --type=KWin/Effect --upgrade "$EFFECT_DIR" 2>/dev/null || kpackagetool6 --type=KWin/Effect --install "$EFFECT_DIR"

echo "[PlasmaSnap] Enabling plugin in kwinrc (best effort)"
if command -v kwriteconfig6 >/dev/null 2>&1; then
  kwriteconfig6 --file kwinrc --group Plugins --key plasma-snap-assistantEnabled true
else
  echo "[PlasmaSnap] kwriteconfig6 unavailable; skipping plugin enablement"
fi

if command -v qdbus6 >/dev/null 2>&1; then
  if ! qdbus6 org.kde.KWin /KWin reconfigure >/dev/null 2>&1; then
    echo "[PlasmaSnap] qdbus6 reconfigure call failed (KWin dbus interface may be unavailable)"
  else
    echo "[PlasmaSnap] KWin reconfigure requested"
  fi
else
  echo "[PlasmaSnap] qdbus6 unavailable; skipping KWin reconfigure request"
fi
