/*
 * eligibilityFilter.test.js
 * Standalone test file -- run with: node tests/eligibilityFilter.test.js
 * No test framework required.
 */

var eligibility = require("../kwin-effect-plasma-snap-assistant/contents/js/eligibilityFilter.js");
var checkEligibility = eligibility.checkEligibility;
var filterEligibleWindows = eligibility.filterEligibleWindows;

// ── Helpers ──────────────────────────────────────────────────────────────────

var totalTests = 0;
var passedTests = 0;

function assert(condition, message) {
    totalTests++;
    if (!condition) {
        console.error("FAIL: " + message);
        process.exitCode = 1;
    } else {
        passedTests++;
        console.log("PASS: " + message);
    }
}

/** Create a base "normal eligible" window mock; callers override individual props. */
function makeWindow(overrides) {
    var base = {
        normalWindow: true,
        fullScreen: false,
        desktopWindow: false,
        dock: false,
        dialog: false,
        utility: false,
        toolbar: false,
        splash: false,
        menu: false,
        minimized: false,
        popupWindow: false,
        tooltip: false,
        dropdownMenu: false,
        visible: true,
        onCurrentDesktop: true,
        minSize: {width: 100, height: 100},
        maxSize: {width: 0, height: 0}
    };
    if (overrides) {
        for (var key in overrides) {
            if (overrides.hasOwnProperty(key)) {
                base[key] = overrides[key];
            }
        }
    }
    return base;
}

// ── Mock windows ─────────────────────────────────────────────────────────────

var normalWindow        = makeWindow();
var fullScreenWindow    = makeWindow({fullScreen: true});
var desktopSurface      = makeWindow({desktopWindow: true});
var dockWindow          = makeWindow({dock: true});
var dialogWindow        = makeWindow({dialog: true});
var utilityWindow       = makeWindow({utility: true});
var toolbarWindow       = makeWindow({toolbar: true});
var splashWindow        = makeWindow({splash: true});
var menuWindow          = makeWindow({menu: true});
var minimizedWindow     = makeWindow({minimized: true});
var fixedSizeWindow     = makeWindow({
    minSize: {width: 800, height: 600},
    maxSize: {width: 800, height: 600}
});
var popupWindow         = makeWindow({popupWindow: true});
var tooltipWindow       = makeWindow({tooltip: true});
var dropdownMenuWindow  = makeWindow({dropdownMenu: true});
var hiddenWindow        = makeWindow({visible: false});
var offDesktopWindow    = makeWindow({onCurrentDesktop: false});

// ── Tests: normal eligible window ────────────────────────────────────────────

console.log("\n--- Normal eligible window ---");
var result = checkEligibility(normalWindow);
assert(result.eligible === true,  "Normal window is eligible");
assert(result.reason === "Window is eligible for snapping", "Normal window reason string");

// ── Tests: each excluded type ────────────────────────────────────────────────

console.log("\n--- Excluded window types ---");

result = checkEligibility(fullScreenWindow);
assert(result.eligible === false, "Fullscreen window is ineligible");
assert(result.reason === "Window is fullscreen", "Fullscreen reason");

result = checkEligibility(desktopSurface);
assert(result.eligible === false, "Desktop surface is ineligible");
assert(result.reason === "Desktop surface", "Desktop surface reason");

result = checkEligibility(dockWindow);
assert(result.eligible === false, "Dock window is ineligible");
assert(result.reason === "Panel or dock", "Dock reason");

result = checkEligibility(dialogWindow);
assert(result.eligible === false, "Dialog window is ineligible");
assert(result.reason === "Dialog window", "Dialog reason");

result = checkEligibility(utilityWindow);
assert(result.eligible === false, "Utility window is ineligible");
assert(result.reason === "Utility window", "Utility reason");

result = checkEligibility(toolbarWindow);
assert(result.eligible === false, "Toolbar window is ineligible");
assert(result.reason === "Toolbar window", "Toolbar reason");

result = checkEligibility(splashWindow);
assert(result.eligible === false, "Splash screen is ineligible");
assert(result.reason === "Splash screen", "Splash reason");

result = checkEligibility(menuWindow);
assert(result.eligible === false, "Menu window is ineligible");
assert(result.reason === "Menu window", "Menu reason");

result = checkEligibility(minimizedWindow);
assert(result.eligible === false, "Minimized window is ineligible");
assert(result.reason === "Window is minimized", "Minimized reason");

result = checkEligibility(fixedSizeWindow);
assert(result.eligible === false, "Fixed-size window is ineligible");
assert(result.reason === "Window is not resizable (fixed size)", "Fixed-size reason");

result = checkEligibility(popupWindow);
assert(result.eligible === false, "Popup window is ineligible");
assert(result.reason === "Popup window", "Popup reason");

result = checkEligibility(tooltipWindow);
assert(result.eligible === false, "Tooltip is ineligible");
assert(result.reason === "Tooltip", "Tooltip reason");

result = checkEligibility(dropdownMenuWindow);
assert(result.eligible === false, "Dropdown menu is ineligible");
assert(result.reason === "Dropdown menu", "Dropdown menu reason");

result = checkEligibility(hiddenWindow);
assert(result.eligible === false, "Hidden window is ineligible");
assert(result.reason === "Window is not visible", "Hidden window reason");

result = checkEligibility(offDesktopWindow);
assert(result.eligible === false, "Off-current-desktop window is ineligible");
assert(result.reason === "Window is not on current desktop", "Off-desktop reason");

// ── Tests: not-a-normal-window ───────────────────────────────────────────────

console.log("\n--- Not-a-normal-window ---");
var notNormal = makeWindow({normalWindow: false});
result = checkEligibility(notNormal);
assert(result.eligible === false, "normalWindow=false is ineligible");
assert(result.reason === "Not a normal window", "normalWindow=false reason");

// ── Tests: borderline / edge cases ───────────────────────────────────────────

console.log("\n--- Borderline cases ---");

// Zero-zero sizes (unconstrained) -> eligible
var zeroSizeWindow = makeWindow({
    minSize: {width: 0, height: 0},
    maxSize: {width: 0, height: 0}
});
result = checkEligibility(zeroSizeWindow);
assert(result.eligible === true, "minSize and maxSize both zero -> eligible (unconstrained)");

// Fixed size (both equal and non-zero) -> ineligible
var fixedSize2 = makeWindow({
    minSize: {width: 800, height: 600},
    maxSize: {width: 800, height: 600}
});
result = checkEligibility(fixedSize2);
assert(result.eligible === false, "minSize == maxSize (800x600) -> ineligible (fixed size)");

// Resizable (different min/max) -> eligible
var resizableWindow = makeWindow({
    minSize: {width: 800, height: 600},
    maxSize: {width: 1200, height: 900}
});
result = checkEligibility(resizableWindow);
assert(result.eligible === true, "minSize != maxSize -> eligible (can resize)");

// Missing properties should not crash; treat as false
console.log("\n--- Missing properties ---");
var sparseWindow = {normalWindow: true, minSize: {width: 100, height: 100}, maxSize: {width: 0, height: 0}};
result = checkEligibility(sparseWindow);
assert(result.eligible === true, "Window with missing boolean props does not crash, treated as false");

var emptyWindow = {};
result = checkEligibility(emptyWindow);
assert(result.eligible === false, "Empty object is ineligible (not a normal window)");
assert(result.reason === "Not a normal window", "Empty object reason");

var nullResult = checkEligibility(null);
assert(nullResult.eligible === false, "null window is ineligible");

var undefinedResult = checkEligibility(undefined);
assert(undefinedResult.eligible === false, "undefined window is ineligible");

// ── Tests: filterEligibleWindows ─────────────────────────────────────────────

console.log("\n--- filterEligibleWindows ---");

var mixedArray = [
    normalWindow,
    fullScreenWindow,
    desktopSurface,
    dockWindow,
    dialogWindow,
    utilityWindow,
    toolbarWindow,
    splashWindow,
    menuWindow,
    minimizedWindow,
    fixedSizeWindow,
    popupWindow,
    tooltipWindow,
    dropdownMenuWindow,
    hiddenWindow,
    offDesktopWindow,
    resizableWindow
];

var eligible = filterEligibleWindows(mixedArray);
assert(eligible.length === 2, "filterEligibleWindows returns 2 eligible windows from mixed array including visibility/current-desktop exclusions");
assert(eligible[0] === normalWindow, "First eligible is the normal window");
assert(eligible[1] === resizableWindow, "Second eligible is the resizable window");

// Empty array
var emptyResult2 = filterEligibleWindows([]);
assert(emptyResult2.length === 0, "filterEligibleWindows on empty array returns empty array");

// ── Tests: exclusion priority order ──────────────────────────────────────────

console.log("\n--- Exclusion priority order ---");

// A window that is both fullscreen AND a dock should return the fullscreen reason first.
var multiExclusion = makeWindow({fullScreen: true, dock: true, dialog: true});
result = checkEligibility(multiExclusion);
assert(result.reason === "Window is fullscreen", "Fullscreen checked before dock and dialog");

result = checkEligibility(makeWindow({fullScreen: true, visible: false}));
assert(result.reason === "Window is fullscreen", "Fullscreen still takes precedence over hidden-window exclusion");

// A window that is a dock AND a dialog should return dock reason first.
var dockDialog = makeWindow({dock: true, dialog: true});
result = checkEligibility(dockDialog);
assert(result.reason === "Panel or dock", "Dock checked before dialog");

// ── Summary ──────────────────────────────────────────────────────────────────

console.log("\n========================================");
console.log(passedTests + "/" + totalTests + " tests passed");
console.log("========================================\n");

if (passedTests < totalTests) {
    console.error("Some tests failed!");
}
