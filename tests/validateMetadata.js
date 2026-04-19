/*
 * validateMetadata.js
 *
 * Static validation of shipped metadata/config so packaging/runtime regressions
 * are caught in CI without needing a full Plasma/Qt toolchain.
 *
 * Run with: node tests/validateMetadata.js
 *
 * Checks:
 *  - kwin-effect metadata.json: valid JSON, KPlugin.Id matches the path
 *    referenced from the tray code and the Makefile's kwriteconfig6 key,
 *    required KPlugin fields present.
 *  - contents/config/main.xml: well-formed XML; has the kcfg group
 *    "PlasmaSnap" with the "defaultDensity" and "shortcutKey" entries
 *    that main.qml reads.
 *  - tray desktop entry: required Desktop Entry keys, and the
 *    X-KDE-autostart-condition's file/group/key reference an actual key
 *    in the shipped default config.
 *  - tray default config: [General] trayIconEnabled exists, since the tray's
 *    main() treats it as the gating key.
 */

var fs = require("fs");
var path = require("path");

var repoRoot = path.join(__dirname, "..");
var failures = 0;

function report(ok, label, detail) {
    if (ok) {
        console.log("  ok  " + label);
    } else {
        failures++;
        console.log("  FAIL " + label + (detail ? " — " + detail : ""));
    }
}

function read(rel) {
    return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

console.log("metadata.json");
(function checkMetadata() {
    var raw;
    try {
        raw = read("kwin-effect-plasma-snap-assistant/metadata.json");
    } catch (e) {
        report(false, "file exists", e.message); return;
    }
    var parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        report(false, "valid JSON", e.message); return;
    }
    report(true, "valid JSON");
    report(parsed.KPlugin && parsed.KPlugin.Id === "plasma-snap-assistant",
        "KPlugin.Id === 'plasma-snap-assistant'");
    report(parsed.KPackageStructure === "KWin/Effect",
        "KPackageStructure === 'KWin/Effect'");
    report(parsed["X-Plasma-API"] === "declarativescript",
        "X-Plasma-API === 'declarativescript'");
    report(parsed.KPlugin && typeof parsed.KPlugin.Version === "string",
        "KPlugin.Version is a string");
    report(parsed.KPlugin && typeof parsed.KPlugin.License === "string",
        "KPlugin.License is set");
})();

console.log("contents/config/main.xml");
(function checkKcfg() {
    var raw;
    try {
        raw = read("kwin-effect-plasma-snap-assistant/contents/config/main.xml");
    } catch (e) {
        report(false, "file exists", e.message); return;
    }
    // Lightweight well-formedness: tag open/close counts match for <kcfg>.
    var openKcfg = (raw.match(/<kcfg>/g) || []).length;
    var closeKcfg = (raw.match(/<\/kcfg>/g) || []).length;
    report(openKcfg === 1 && closeKcfg === 1, "<kcfg> is balanced");
    report(/<kcfgfile\s+name="kwinrc"\s*\/>/.test(raw),
        "<kcfgfile name=\"kwinrc\"/> present");
    report(/<group\s+name="PlasmaSnap">/.test(raw),
        "<group name=\"PlasmaSnap\"> present (matches main.qml's configuration group)");
    report(/<entry\s+name="defaultDensity"/.test(raw),
        "entry 'defaultDensity' present (read by main.qml)");
    report(/<entry\s+name="shortcutKey"/.test(raw),
        "entry 'shortcutKey' present (read by main.qml ShortcutHandler)");
})();

console.log("tray default config: plasma-snap-assistantrc");
(function checkTrayConfig() {
    var raw;
    try {
        raw = read("plasma-snap-assistant-tray/config/plasma-snap-assistantrc");
    } catch (e) {
        report(false, "file exists", e.message); return;
    }
    var hasGeneral = /\[General\]/.test(raw);
    var hasTrayKey = /^\s*trayIconEnabled\s*=/m.test(raw);
    report(hasGeneral, "[General] section present");
    report(hasTrayKey, "trayIconEnabled key present (read by main.cpp)");
})();

console.log("tray desktop entry");
(function checkDesktop() {
    var raw;
    try {
        raw = read("plasma-snap-assistant-tray/resources/plasma-snap-assistant-tray.desktop");
    } catch (e) {
        report(false, "file exists", e.message); return;
    }
    var required = ["Type=Application", "Name=", "Exec=", "Icon="];
    required.forEach(function (key) {
        report(raw.indexOf(key) !== -1, "contains " + key);
    });
    report(/^Exec=plasma-snap-assistant-tray\s*$/m.test(raw),
        "Exec points at the installed binary name");
    report(/^Icon=plasmasnap-grid\s*$/m.test(raw),
        "Icon=plasmasnap-grid (avoids XDG dash-fallback to breeze 'plasma' icon)");
    // X-KDE-autostart-condition ties into the default config — if these drift
    // apart, autostart either never fires or fires when the user disabled it.
    var m = raw.match(/^X-KDE-autostart-condition=([^:\n]+):([^:\n]+):([^:\n]+):([^:\n]+)\s*$/m);
    if (!m) {
        report(false, "X-KDE-autostart-condition present and parseable");
        return;
    }
    report(true, "X-KDE-autostart-condition present and parseable");
    report(m[1] === "plasma-snap-assistantrc",
        "autostart-condition file === plasma-snap-assistantrc");
    report(m[2] === "General",
        "autostart-condition group === General");
    report(m[3] === "trayIconEnabled",
        "autostart-condition key === trayIconEnabled");
    report(m[4] === "true",
        "autostart-condition default === true");
    // Cross-check against the shipped default config.
    var cfg;
    try {
        cfg = read("plasma-snap-assistant-tray/config/plasma-snap-assistantrc");
    } catch (e) {
        report(false, "default config is readable for cross-check", e.message); return;
    }
    report(/\[General\]/.test(cfg) && /^\s*trayIconEnabled\s*=\s*true\s*$/m.test(cfg),
        "default config's [General] trayIconEnabled=true matches autostart-condition");
})();

console.log("");
if (failures > 0) {
    console.log("FAILED: " + failures + " check(s) failed");
    process.exit(1);
}
console.log("PASSED: all metadata/config checks passed");
