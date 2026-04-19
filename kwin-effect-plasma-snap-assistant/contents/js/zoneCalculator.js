/*
 * zoneCalculator.js
 *
 * Pure calculation module for computing grid zones from monitor work area
 * geometry. No KWin-specific API calls — only math.
 *
 * Compatible with KWin JS engine: uses var, traditional functions, no ES6+.
 */

/**
 * Parse a density string like "8x6" into {cols, rows}.
 *
 * @param {string} density  e.g. "8x6", "6x4", "4x4"
 * @returns {{cols: number, rows: number}}
 * @throws {Error} on invalid format
 */
function parseDensity(density) {
    if (typeof density !== "string") {
        throw new Error("parseDensity: density must be a string, got " + typeof density);
    }

    var parts = density.split("x");
    if (parts.length !== 2) {
        throw new Error("parseDensity: invalid format '" + density + "', expected 'COLSxROWS'");
    }

    var cols = parseInt(parts[0], 10);
    var rows = parseInt(parts[1], 10);

    if (isNaN(cols) || isNaN(rows) || cols <= 0 || rows <= 0) {
        throw new Error("parseDensity: invalid values in '" + density + "', cols and rows must be positive integers");
    }

    return { cols: cols, rows: rows };
}

/**
 * Distribute a total length into `count` integer segments with no gaps.
 * Extra remainder pixels go to the first N segments.
 *
 * @param {number} total   total pixel length
 * @param {number} count   number of segments
 * @returns {number[]}     array of segment sizes (length === count)
 */
function distributePixels(total, count) {
    var base = Math.floor(total / count);
    var remainder = total - base * count;
    var sizes = [];
    var i;
    for (i = 0; i < count; i++) {
        sizes.push(base + (i < remainder ? 1 : 0));
    }
    return sizes;
}

/**
 * Calculate grid zones for a monitor work area at the given density.
 *
 * @param {{x: number, y: number, width: number, height: number}} monitorGeometry
 * @param {string} density  one of "8x6", "6x4", "4x4" (format "COLSxROWS")
 * @returns {Array<{id: number, row: number, col: number, x: number, y: number, width: number, height: number}>}
 */
function calculateZones(monitorGeometry, density) {
    var grid = parseDensity(density);
    var cols = grid.cols;
    var rows = grid.rows;

    var colWidths = distributePixels(monitorGeometry.width, cols);
    var rowHeights = distributePixels(monitorGeometry.height, rows);

    // Pre-compute cumulative x offsets for each column
    var colOffsets = [0];
    var c;
    for (c = 0; c < cols; c++) {
        colOffsets.push(colOffsets[c] + colWidths[c]);
    }

    // Pre-compute cumulative y offsets for each row
    var rowOffsets = [0];
    var r;
    for (r = 0; r < rows; r++) {
        rowOffsets.push(rowOffsets[r] + rowHeights[r]);
    }

    var zones = [];
    var id = 0;
    for (r = 0; r < rows; r++) {
        for (c = 0; c < cols; c++) {
            zones.push({
                id: id,
                row: r,
                col: c,
                x: monitorGeometry.x + colOffsets[c],
                y: monitorGeometry.y + rowOffsets[r],
                width: colWidths[c],
                height: rowHeights[r]
            });
            id++;
        }
    }

    return zones;
}

/**
 * Compute the bounding rectangle for a multi-cell selection between two cells.
 * Handles reversed selections (start cell > end cell).
 *
 * @param {Array<{row: number, col: number, x: number, y: number, width: number, height: number}>} zones
 * @param {{row: number, col: number}} startCell
 * @param {{row: number, col: number}} endCell
 * @returns {{x: number, y: number, width: number, height: number}}
 * @throws {Error} if either cell cannot be found in the zones array
 */
function calculateRegion(zones, startCell, endCell) {
    var minRow = Math.min(startCell.row, endCell.row);
    var maxRow = Math.max(startCell.row, endCell.row);
    var minCol = Math.min(startCell.col, endCell.col);
    var maxCol = Math.max(startCell.col, endCell.col);

    var topLeft = null;
    var bottomRight = null;
    var i;
    for (i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (z.row === minRow && z.col === minCol) topLeft = z;
        if (z.row === maxRow && z.col === maxCol) bottomRight = z;
    }

    if (!topLeft) {
        throw new Error("calculateRegion: zone for start cell (" + minRow + "," + minCol + ") not found");
    }
    if (!bottomRight) {
        throw new Error("calculateRegion: zone for end cell (" + maxRow + "," + maxCol + ") not found");
    }

    return {
        x: topLeft.x,
        y: topLeft.y,
        width: (bottomRight.x + bottomRight.width) - topLeft.x,
        height: (bottomRight.y + bottomRight.height) - topLeft.y
    };
}

// Export for Node.js; in KWin context these are just global functions
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseDensity: parseDensity,
        calculateZones: calculateZones,
        calculateRegion: calculateRegion
    };
}
