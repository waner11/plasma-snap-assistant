/*
 * zoneCalculator.test.js
 *
 * Tests for the zone calculation module.
 * Run with: node tests/zoneCalculator.test.js
 *
 * No test framework dependency — uses a simple assertion helper.
 * Compatible with KWin JS engine: uses var, traditional functions, no ES6+.
 */

var zoneCalc = require("../kwin-effect-plasma-snap-assistant/contents/js/zoneCalculator.js");
var parseDensity = zoneCalc.parseDensity;
var calculateZones = zoneCalc.calculateZones;

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

function assertThrows(fn, message) {
    totalTests++;
    var threw = false;
    try {
        fn();
    } catch (e) {
        threw = true;
    }
    if (!threw) {
        console.error("FAIL: " + message);
        process.exitCode = 1;
    } else {
        passedTests++;
        console.log("PASS: " + message);
    }
}

/**
 * Verify that all zone coordinates are integers.
 */
function verifyAllIntegers(zones, label) {
    var allInt = true;
    var i;
    for (i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (z.x !== Math.floor(z.x) || z.y !== Math.floor(z.y) ||
            z.width !== Math.floor(z.width) || z.height !== Math.floor(z.height)) {
            allInt = false;
            break;
        }
    }
    assert(allInt, label + " - all coordinates are integers");
}

/**
 * Verify that zones tile exactly: sum of widths per row === monitor width,
 * sum of heights per column === monitor height, and no overlaps.
 */
function verifyTiling(zones, geo, density, label) {
    var grid = parseDensity(density);
    var cols = grid.cols;
    var rows = grid.rows;
    var r, c, i;

    // Check sum of widths per row
    var widthOk = true;
    for (r = 0; r < rows; r++) {
        var rowWidth = 0;
        for (c = 0; c < cols; c++) {
            for (i = 0; i < zones.length; i++) {
                if (zones[i].row === r && zones[i].col === c) {
                    rowWidth += zones[i].width;
                    break;
                }
            }
        }
        if (rowWidth !== geo.width) {
            widthOk = false;
            break;
        }
    }
    assert(widthOk, label + " - sum of widths per row === monitor width");

    // Check sum of heights per column
    var heightOk = true;
    for (c = 0; c < cols; c++) {
        var colHeight = 0;
        for (r = 0; r < rows; r++) {
            for (i = 0; i < zones.length; i++) {
                if (zones[i].row === r && zones[i].col === c) {
                    colHeight += zones[i].height;
                    break;
                }
            }
        }
        if (colHeight !== geo.height) {
            heightOk = false;
            break;
        }
    }
    assert(heightOk, label + " - sum of heights per column === monitor height");

    // Check no gaps: each zone's x+width should equal the next zone's x in the same row
    var noGaps = true;
    for (r = 0; r < rows; r++) {
        // Collect zones in this row sorted by col
        var rowZones = [];
        for (i = 0; i < zones.length; i++) {
            if (zones[i].row === r) {
                rowZones.push(zones[i]);
            }
        }
        rowZones.sort(function(a, b) { return a.col - b.col; });

        // First zone should start at geo.x
        if (rowZones[0].x !== geo.x) {
            noGaps = false;
            break;
        }
        for (i = 1; i < rowZones.length; i++) {
            if (rowZones[i].x !== rowZones[i - 1].x + rowZones[i - 1].width) {
                noGaps = false;
                break;
            }
        }
        // Last zone should end at geo.x + geo.width
        var last = rowZones[rowZones.length - 1];
        if (last.x + last.width !== geo.x + geo.width) {
            noGaps = false;
        }
    }
    assert(noGaps, label + " - no horizontal gaps");

    var noVGaps = true;
    for (c = 0; c < cols; c++) {
        var colZones = [];
        for (i = 0; i < zones.length; i++) {
            if (zones[i].col === c) {
                colZones.push(zones[i]);
            }
        }
        colZones.sort(function(a, b) { return a.row - b.row; });

        if (colZones[0].y !== geo.y) {
            noVGaps = false;
            break;
        }
        for (i = 1; i < colZones.length; i++) {
            if (colZones[i].y !== colZones[i - 1].y + colZones[i - 1].height) {
                noVGaps = false;
                break;
            }
        }
        var lastV = colZones[colZones.length - 1];
        if (lastV.y + lastV.height !== geo.y + geo.height) {
            noVGaps = false;
        }
    }
    assert(noVGaps, label + " - no vertical gaps");
}

// ============================================================
// Helper to run standard zone tests for a given geometry
// ============================================================
function runStandardTests(geo, label) {
    var densities = ["8x6", "6x4", "4x4"];
    var d, zones;
    for (d = 0; d < densities.length; d++) {
        zones = calculateZones(geo, densities[d]);
        var grid = parseDensity(densities[d]);
        var expectedCount = grid.cols * grid.rows;

        assert(zones.length === expectedCount,
            label + " " + densities[d] + " - zone count === " + expectedCount);
        verifyAllIntegers(zones, label + " " + densities[d]);
        verifyTiling(zones, geo, densities[d], label + " " + densities[d]);
    }
}

// ============================================================
console.log("=== parseDensity tests ===");
// ============================================================

var pd;

pd = parseDensity("8x6");
assert(pd.cols === 8 && pd.rows === 6, "parseDensity('8x6') = {cols:8, rows:6}");

pd = parseDensity("6x4");
assert(pd.cols === 6 && pd.rows === 4, "parseDensity('6x4') = {cols:6, rows:4}");

pd = parseDensity("4x4");
assert(pd.cols === 4 && pd.rows === 4, "parseDensity('4x4') = {cols:4, rows:4}");

pd = parseDensity("12x10");
assert(pd.cols === 12 && pd.rows === 10, "parseDensity('12x10') = {cols:12, rows:10}");

assertThrows(function() { parseDensity("abc"); }, "parseDensity('abc') throws");
assertThrows(function() { parseDensity("8"); }, "parseDensity('8') throws");
assertThrows(function() { parseDensity("8x"); }, "parseDensity('8x') throws");
assertThrows(function() { parseDensity("x6"); }, "parseDensity('x6') throws");
assertThrows(function() { parseDensity("0x6"); }, "parseDensity('0x6') throws");
assertThrows(function() { parseDensity("-1x6"); }, "parseDensity('-1x6') throws");
assertThrows(function() { parseDensity(123); }, "parseDensity(123) throws");
assertThrows(function() { parseDensity(""); }, "parseDensity('') throws");

// ============================================================
console.log("\n=== 1920x1080 standard monitor ===");
// ============================================================

var stdGeo = { x: 0, y: 0, width: 1920, height: 1080 };

// 8x6: each cell 240x180, 48 total
var zones8x6 = calculateZones(stdGeo, "8x6");
assert(zones8x6.length === 48, "1920x1080 8x6 - 48 zones");
assert(zones8x6[0].width === 240, "1920x1080 8x6 - cell width 240");
assert(zones8x6[0].height === 180, "1920x1080 8x6 - cell height 180");

// 6x4: each cell 320x270, 24 total
var zones6x4 = calculateZones(stdGeo, "6x4");
assert(zones6x4.length === 24, "1920x1080 6x4 - 24 zones");
assert(zones6x4[0].width === 320, "1920x1080 6x4 - cell width 320");
assert(zones6x4[0].height === 270, "1920x1080 6x4 - cell height 270");

// 4x4: each cell 480x270, 16 total
var zones4x4 = calculateZones(stdGeo, "4x4");
assert(zones4x4.length === 16, "1920x1080 4x4 - 16 zones");
assert(zones4x4[0].width === 480, "1920x1080 4x4 - cell width 480");
assert(zones4x4[0].height === 270, "1920x1080 4x4 - cell height 270");

runStandardTests(stdGeo, "1920x1080");

// ============================================================
console.log("\n=== 3440x1440 ultrawide ===");
// ============================================================

var uwGeo = { x: 0, y: 0, width: 3440, height: 1440 };
runStandardTests(uwGeo, "3440x1440");

// Specific check for 3440/8 = 430, no remainder
var uwZones8x6 = calculateZones(uwGeo, "8x6");
assert(uwZones8x6[0].width === 430, "3440x1440 8x6 - cell width 430");
assert(uwZones8x6[0].height === 240, "3440x1440 8x6 - cell height 240");

// 3440/6 = 573 remainder 2 => first 2 cols get 574, rest 573
var uwZones6x4 = calculateZones(uwGeo, "6x4");
assert(uwZones6x4[0].width === 574, "3440x1440 6x4 - first col width 574 (remainder distributed)");
assert(uwZones6x4[1].width === 574, "3440x1440 6x4 - second col width 574");
// Third column (col index 2) should be 573
var thirdColZone = null;
var zIdx;
for (zIdx = 0; zIdx < uwZones6x4.length; zIdx++) {
    if (uwZones6x4[zIdx].row === 0 && uwZones6x4[zIdx].col === 2) {
        thirdColZone = uwZones6x4[zIdx];
        break;
    }
}
assert(thirdColZone !== null && thirdColZone.width === 573,
    "3440x1440 6x4 - third col width 573");

// ============================================================
console.log("\n=== 1080x1920 portrait ===");
// ============================================================

var portGeo = { x: 0, y: 0, width: 1080, height: 1920 };
runStandardTests(portGeo, "1080x1920 portrait");

// ============================================================
console.log("\n=== 800x600 small work area ===");
// ============================================================

var smallGeo = { x: 0, y: 0, width: 800, height: 600 };
runStandardTests(smallGeo, "800x600");

// ============================================================
console.log("\n=== Non-zero origin (second monitor) ===");
// ============================================================

var offsetGeo = { x: 1920, y: 0, width: 1920, height: 1080 };
runStandardTests(offsetGeo, "offset(1920,0) 1920x1080");

// Verify that zone positions are offset
var offsetZones = calculateZones(offsetGeo, "4x4");
assert(offsetZones[0].x === 1920, "offset monitor - first zone x === 1920");
assert(offsetZones[0].y === 0, "offset monitor - first zone y === 0");

// Last zone should end at 1920+1920=3840
var lastZone = offsetZones[offsetZones.length - 1];
assert(lastZone.x + lastZone.width === 3840, "offset monitor - last zone ends at x=3840");
assert(lastZone.y + lastZone.height === 1080, "offset monitor - last zone ends at y=1080");

// ============================================================
console.log("\n=== Remainder pixel distribution ===");
// ============================================================

// 1921 / 6 = 320 remainder 1 => first col gets 321, rest 320
var oddGeo = { x: 0, y: 0, width: 1921, height: 1080 };
var oddZones = calculateZones(oddGeo, "6x4");
var col0Width = oddZones[0].width;
var col1Width = null;
for (zIdx = 0; zIdx < oddZones.length; zIdx++) {
    if (oddZones[zIdx].row === 0 && oddZones[zIdx].col === 1) {
        col1Width = oddZones[zIdx].width;
        break;
    }
}
assert(col0Width === 321, "1921px width / 6 cols - first col width 321");
assert(col1Width === 320, "1921px width / 6 cols - second col width 320");
verifyTiling(oddZones, oddGeo, "6x4", "1921x1080 6x4");

// ============================================================
console.log("\n=== Summary ===");
// ============================================================

console.log(passedTests + "/" + totalTests + " tests passed");
if (passedTests === totalTests) {
    console.log("All tests passed!");
} else {
    console.log((totalTests - passedTests) + " test(s) FAILED");
}
