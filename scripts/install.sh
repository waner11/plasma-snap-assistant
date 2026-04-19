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

  token_value=${PLASMA_SNAP_TOKEN:-0}
  token_value=$((token_value + 1))
  echo "[PlasmaSnap] Tray-to-Effect token hook (config-only test path):"
  if command -v kwriteconfig6 >/dev/null 2>&1; then
    echo "[PlasmaSnap]   kwriteconfig6 --file kwinrc --group PlasmaSnap --key trayActivationToken \"$token_value\""
  else
    echo "[PlasmaSnap]   kwriteconfig6 is unavailable; this hook requires updating kwinrc in your environment"
  fi
else
  echo "[PlasmaSnap] qdbus6 unavailable; tray activation validation is limited to external constraints"
fi
