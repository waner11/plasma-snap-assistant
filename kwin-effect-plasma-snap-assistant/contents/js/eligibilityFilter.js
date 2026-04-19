/*
 * eligibilityFilter.js
 * Pure JavaScript module that determines if a KWin window is eligible for snapping.
 * Uses only property access on window objects -- no KWin API calls.
 * Written with var declarations for KWin JS engine compatibility.
 */

/**
 * Check whether a KWin window object is eligible for snap-assist placement.
 *
 * @param {Object} window  A KWin window object (or mock with the same properties).
 * @returns {{eligible: boolean, reason: string}}
 */
var checkEligibility = function checkEligibility(window) {
    if (!window) {
        return {eligible: false, reason: "No window object provided"};
    }

    // --- Exclusion checks, evaluated in the specified order ---

    if (window.fullScreen === true) {
        return {eligible: false, reason: "Window is fullscreen"};
    }

    if (window.desktopWindow === true) {
        return {eligible: false, reason: "Desktop surface"};
    }

    if (window.dock === true) {
        return {eligible: false, reason: "Panel or dock"};
    }

    if (window.dialog === true) {
        return {eligible: false, reason: "Dialog window"};
    }

    if (window.utility === true) {
        return {eligible: false, reason: "Utility window"};
    }

    if (window.toolbar === true) {
        return {eligible: false, reason: "Toolbar window"};
    }

    if (window.splash === true) {
        return {eligible: false, reason: "Splash screen"};
    }

    if (window.menu === true) {
        return {eligible: false, reason: "Menu window"};
    }

    if (window.normalWindow !== true) {
        return {eligible: false, reason: "Not a normal window"};
    }

    if (window.minimized === true) {
        return {eligible: false, reason: "Window is minimized"};
    }

    if (window.visible === false) {
        return {eligible: false, reason: "Window is not visible"};
    }

    if (window.onCurrentDesktop === false) {
        return {eligible: false, reason: "Window is not on current desktop"};
    }

    // Non-resizable: minSize equals maxSize AND both width and height are non-zero.
    var minSize = window.minSize;
    var maxSize = window.maxSize;
    if (minSize && maxSize) {
        if (
            minSize.width === maxSize.width &&
            minSize.height === maxSize.height &&
            minSize.width !== 0 &&
            minSize.height !== 0
        ) {
            return {eligible: false, reason: "Window is not resizable (fixed size)"};
        }
    }

    if (window.popupWindow === true) {
        return {eligible: false, reason: "Popup window"};
    }

    if (window.tooltip === true) {
        return {eligible: false, reason: "Tooltip"};
    }

    if (window.dropdownMenu === true) {
        return {eligible: false, reason: "Dropdown menu"};
    }

    // All checks passed -- window is eligible.
    return {eligible: true, reason: "Window is eligible for snapping"};
};

/**
 * Filter an array of window objects, returning only those eligible for snapping.
 *
 * @param {Array} windows  Array of KWin window objects.
 * @returns {Array}  Subset of eligible windows.
 */
var filterEligibleWindows = function filterEligibleWindows(windows) {
    var result = [];
    for (var i = 0; i < windows.length; i++) {
        if (checkEligibility(windows[i]).eligible) {
            result.push(windows[i]);
        }
    }
    return result;
};

// Export for Node.js test runner (guard for KWin environment where module is undefined).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        checkEligibility: checkEligibility,
        filterEligibleWindows: filterEligibleWindows
    };
}
