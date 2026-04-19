/*
 * validateSources.js
 *
 * Lightweight structural checks for the two critical source files that have
 * no other automated coverage. These are not a substitute for building, but
 * they pin down specific invariants so past bugs (PR #1 review feedback)
 * don't silently regress.
 *
 * Run with: node tests/validateSources.js
 *
 * Scope:
 *  - plasma-snap-assistant-tray/src/main.cpp
 *      * no public D-Bus quit() slot
 *      * D-Bus registration is a hard startup failure (main checks registerDBus)
 *      * triggerEffect distinguishes invalid/valid isEffectLoaded replies
 *      * invokeShortcut failure shows a user-visible notification
 *  - kwin-effect-plasma-snap-assistant/contents/ui/main.qml
 *      * no dangling preSnapGeometry state (removed — see PR #1 review)
 *      * ShortcutHandler declares the PlasmaSnapAssistant shortcut name
 *        (tray activates via KGlobalAccel invokeShortcut with this exact name)
 *      * configuration.defaultDensity / shortcutKey are read (wires to main.xml)
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

console.log("plasma-snap-assistant-tray/src/main.cpp");
(function checkMainCpp() {
    var src;
    try {
        src = read("plasma-snap-assistant-tray/src/main.cpp");
    } catch (e) {
        report(false, "file exists", e.message); return;
    }

    // Task 3: quit() must not be a D-Bus slot on TrayAdaptor.
    // QApplication::quit used as a signal/slot target for the menu is fine;
    // what we forbid is exposing a bare `void quit()` method on the adaptor.
    var quitSlot = /\bvoid\s+quit\s*\(\s*\)/.test(src);
    report(!quitSlot, "TrayAdaptor does not expose a D-Bus quit() slot");

    // Task 4: registerDBus is defined and main() exits non-zero on failure.
    report(/bool\s+registerDBus\s*\(/.test(src),
        "registerDBus() is defined with bool return type");
    report(/if\s*\(\s*!\s*\w+\.registerDBus\s*\(\s*\)\s*\)/.test(src),
        "main() checks registerDBus() return value");
    report(/return\s+1\s*;/.test(src),
        "main() returns non-zero on D-Bus registration failure");

    // Task 5: isEffectLoaded invalid reply is handled explicitly (not
    // short-circuited into the invokeShortcut path).
    report(/loaded\.isValid\s*\(\s*\)/.test(src),
        "triggerEffect inspects QDBusReply::isValid()");
    report(/!\s*loaded\.isValid\s*\(\s*\)/.test(src),
        "triggerEffect handles !isValid() branch explicitly");

    // Task 6: invokeShortcut failure shows a notification, not just a log line.
    report(/notifyFailure\s*\(/.test(src),
        "notifyFailure() helper exists");
    // Count notifyFailure invocations — expect at least 3: isEffectLoaded
    // invalid, effect not loaded, invokeShortcut failed.
    var notifyCalls = (src.match(/notifyFailure\s*\(/g) || []).length;
    report(notifyCalls >= 3,
        "notifyFailure() is called on all three failure paths",
        "found " + notifyCalls);

    // KNotification is used for user-visible failure surfacing.
    report(/KNotification/.test(src), "KNotification is used for user-visible errors");
})();

console.log("kwin-effect-plasma-snap-assistant/contents/ui/main.qml");
(function checkMainQml() {
    var src;
    try {
        src = read("kwin-effect-plasma-snap-assistant/contents/ui/main.qml");
    } catch (e) {
        report(false, "file exists", e.message); return;
    }

    // Task 7: preSnapGeometry was written/reset but never read. Removed
    // entirely — if anyone re-adds it, they must also wire up the restore flow.
    report(src.indexOf("preSnapGeometry") === -1,
        "preSnapGeometry is not referenced (removed as dead state)");

    // Shortcut name must match what the tray companion's invokeShortcut uses.
    report(/name\s*:\s*"PlasmaSnapAssistant"/.test(src),
        "ShortcutHandler.name === 'PlasmaSnapAssistant' (matches tray's invokeShortcut)");

    // Configuration keys must match main.xml entries so the KWin effect
    // picks up user settings. These are read with defaults, so a typo
    // silently falls back to hard-coded defaults — hence the explicit check.
    report(/root\.configuration\.defaultDensity/.test(src),
        "reads root.configuration.defaultDensity (matches main.xml entry)");
    report(/root\.configuration\.shortcutKey/.test(src),
        "reads root.configuration.shortcutKey (matches main.xml entry)");

    // Structural: the effect is a SceneEffect with a delegate.
    report(/KWinComponents\.SceneEffect/.test(src),
        "root type is KWinComponents.SceneEffect");
    report(/delegate\s*:\s*Component/.test(src),
        "delegate: Component is present");
})();

console.log("");
if (failures > 0) {
    console.log("FAILED: " + failures + " check(s) failed");
    process.exit(1);
}
console.log("PASSED: all source-invariant checks passed");
