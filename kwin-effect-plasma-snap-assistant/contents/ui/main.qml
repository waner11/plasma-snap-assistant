/*
    SPDX-FileCopyrightText: 2026 Plasma Snap Assistant contributors
    SPDX-License-Identifier: GPL-2.0-or-later

    Plasma Snap Assistant — SceneEffect overlay for visual window snapping.

    Layer order (bottom to top):
      1. DesktopBackground — renders wallpaper + stacked windows for this screen
      2. Dim tint          — semi-transparent dark Rectangle
      3. Grid cells        — interactive zone picker (target screen only)
      4. Density bar       — 8x6 / 6x4 / 4x4 selector (target screen only)
*/

import QtQuick
import org.kde.kwin as KWinComponents
import "../js/zoneCalculator.js" as ZoneCalc
import "../js/eligibilityFilter.js" as EligibilityFilter

KWinComponents.SceneEffect {
    id: root

    visible: false

    property bool activeOverlay: false
    property var targetWindow: null
    property string currentDensity: (root.configuration.defaultDensity || "8x6")
    property var selectionRect: null
    property int hoveredRow: -1
    property int hoveredCol: -1

    // Pick the window we should snap. Tray activation replays the global
    // shortcut, and focus can shift to the tray/panel between the click
    // and this callback; that made `activeWindow` unreliable in practice.
    // Strategy:
    //   1. Primary: current activeWindow, if it passes eligibility.
    //   2. Fallback: highest-stacked eligible window on the current desktop
    //      (topmost = last index in stackingOrder). Preserves the previous
    //      eligibility contract — nothing that was rejected before becomes
    //      accepted here.
    function findBestTargetWindow() {
        var active = KWinComponents.Workspace.activeWindow
        if (active) {
            var elig = EligibilityFilter.checkEligibility(active)
            if (elig.eligible) {
                console.log("[PlasmaSnap] target: active window '" +
                            active.caption + "' (primary path)")
                return active
            }
            console.log("[PlasmaSnap] active window ineligible: " +
                        elig.reason + " — trying stacking-order fallback")
        } else {
            console.log("[PlasmaSnap] no active window — trying stacking-order fallback")
        }
        var stack = KWinComponents.Workspace.stackingOrder
        if (stack && stack.length) {
            for (var i = stack.length - 1; i >= 0; i--) {
                var w = stack[i]
                if (!w) continue
                if (EligibilityFilter.checkEligibility(w).eligible) {
                    console.log("[PlasmaSnap] target: '" + w.caption +
                                "' (fallback: topmost eligible in stack)")
                    return w
                }
            }
        }
        console.log("[PlasmaSnap] no eligible window found for activation")
        return null
    }

    function beginOverlayActivation(reason) {
        if (activeOverlay) { deactivateOverlay("toggle"); return }
        var win = findBestTargetWindow()
        if (!win) return
        targetWindow = win
        selectionRect = null
        hoveredRow = -1; hoveredCol = -1
        currentDensity = (root.configuration.defaultDensity || "8x6")
        console.log("[PlasmaSnap] activated via " + reason +
                    ", window='" + win.caption + "'")
        activeOverlay = true
        visible = true
    }

    function deactivateOverlay(reason) {
        if (!activeOverlay) return
        console.log("[PlasmaSnap] dismissed: " + reason)
        activeOverlay = false
        visible = false
        targetWindow = null
        selectionRect = null
        hoveredRow = -1
        hoveredCol = -1
    }

    function updateSelection(sR, sC, eR, eC) {
        selectionRect = {
            minRow: Math.min(sR, eR), maxRow: Math.max(sR, eR),
            minCol: Math.min(sC, eC), maxCol: Math.max(sC, eC)
        }
    }

    KWinComponents.ShortcutHandler {
        name: "PlasmaSnapAssistant"
        text: "Plasma Snap Assistant"
        sequence: (root.configuration.shortcutKey || "Meta+J")
        onActivated: root.beginOverlayActivation("shortcut")
    }

    Connections {
        target: KWinComponents.Workspace
        function onWindowRemoved(w) {
            if (root.activeOverlay && root.targetWindow === w)
                root.deactivateOverlay("window-removed")
        }
        function onScreensChanged() {
            if (root.activeOverlay) root.deactivateOverlay("screens-changed")
        }
    }

    Connections {
        target: root.targetWindow
        enabled: root.activeOverlay && root.targetWindow !== null
        function onFullScreenChanged() {
            if (root.targetWindow && root.targetWindow.fullScreen)
                root.deactivateOverlay("fullscreen")
        }
        function onMinimizedChanged() {
            if (root.targetWindow && root.targetWindow.minimized)
                root.deactivateOverlay("minimized")
        }
    }

    // Window model used by the delegate's window-rendering Repeater.
    // Pattern mirrors /usr/share/kwin-x11/effects/windowview/qml/main.qml.
    KWinComponents.WindowModel { id: stackModel }

    delegate: Component {
        Item {
            id: screenOverlay
            focus: root.activeOverlay
            width: parent ? parent.width : 0
            height: parent ? parent.height : 0

            readonly property QtObject targetScreen: KWinComponents.SceneView.screen
            readonly property rect screenGeo: targetScreen ? targetScreen.geometry : Qt.rect(0,0,0,0)

            property bool isTargetScreen: false
            property var zones: []
            // Work area (screen minus panels/struts). Recomputed in recomputeZones
            // so zones don't slide under docks/panels.
            property var workArea: null
            property int dragStartRow: -1
            property int dragStartCol: -1
            property bool isDragging: false

            function updateTargetScreen() {
                if (!root.activeOverlay || !root.targetWindow || !targetScreen) {
                    isTargetScreen = false; return
                }
                var wg = root.targetWindow.frameGeometry
                var sg = targetScreen.geometry
                if (!wg || !sg) { isTargetScreen = false; return }
                var cx = wg.x + wg.width / 2
                var cy = wg.y + wg.height / 2
                isTargetScreen = (cx >= sg.x && cx < sg.x + sg.width &&
                                  cy >= sg.y && cy < sg.y + sg.height)
            }

            function computeWorkArea() {
                if (!targetScreen) return null
                var vd = KWinComponents.Workspace.currentDesktop
                try {
                    var wa = KWinComponents.Workspace.clientArea(
                        KWinComponents.Workspace.PlacementArea, targetScreen, vd)
                    if (wa && wa.width > 0 && wa.height > 0) {
                        return {x: wa.x, y: wa.y, width: wa.width, height: wa.height}
                    }
                } catch (e) {
                    console.log("[PlasmaSnap] clientArea unavailable: " + e)
                }
                var sg = targetScreen.geometry
                return {x: sg.x, y: sg.y, width: sg.width, height: sg.height}
            }

            function recomputeZones() {
                if (!isTargetScreen || !root.activeOverlay) { zones = []; return }
                workArea = computeWorkArea()
                try {
                    zones = ZoneCalc.calculateZones(workArea, root.currentDensity)
                    console.log("[PlasmaSnap] " + zones.length + " zones on " +
                                targetScreen.name + " workArea " +
                                workArea.x + "," + workArea.y + " " +
                                workArea.width + "x" + workArea.height)
                } catch (e) {
                    console.log("[PlasmaSnap] zone error: " + e)
                    zones = []
                }
            }

            function resetDrag() {
                dragStartRow = -1; dragStartCol = -1; isDragging = false
                root.selectionRect = null; root.hoveredRow = -1; root.hoveredCol = -1
            }

            Connections {
                target: root
                function onActiveOverlayChanged() {
                    screenOverlay.updateTargetScreen()
                    if (!root.activeOverlay) screenOverlay.resetDrag()
                    screenOverlay.recomputeZones()
                }
                function onCurrentDensityChanged() {
                    screenOverlay.resetDrag(); screenOverlay.recomputeZones()
                }
                function onTargetWindowChanged() {
                    screenOverlay.updateTargetScreen(); screenOverlay.recomputeZones()
                }
            }

            Component.onCompleted: {
                console.log("[PlasmaSnap] delegate: " + (targetScreen ? targetScreen.name : "?"))
                updateTargetScreen()
                recomputeZones()
            }

            // Layer 1a: Desktop wallpaper (z=0)
            // NOTE: `DesktopBackground` (NOT DesktopBackgroundItem — that's the C++ class name).
            KWinComponents.DesktopBackground {
                anchors.fill: parent
                z: 0
                activity: KWinComponents.Workspace.currentActivity
                desktop: KWinComponents.Workspace.currentDesktop
                outputName: screenOverlay.targetScreen ? screenOverlay.targetScreen.name : ""
            }

            // Layer 1b: Windows rendered at their actual positions (z=1).
            // Windows are wrapped in a container so their internal stackingOrder
            // values stay BELOW the dim tint and grid (which are at higher z).
            Item {
                id: windowsLayer
                anchors.fill: parent
                z: 1
                Repeater {
                    model: KWinComponents.WindowFilterModel {
                        activity: KWinComponents.Workspace.currentActivity
                        desktop: KWinComponents.Workspace.currentDesktop
                        screenName: screenOverlay.targetScreen ? screenOverlay.targetScreen.name : ""
                        windowModel: stackModel
                        windowType: ~KWinComponents.WindowFilterModel.Dock &
                                    ~KWinComponents.WindowFilterModel.Desktop &
                                    ~KWinComponents.WindowFilterModel.Notification &
                                    ~KWinComponents.WindowFilterModel.CriticalNotification
                        minimizedWindows: false
                    }
                    KWinComponents.WindowThumbnail {
                        wId: model.window.internalId
                        x: model.window.x - screenOverlay.screenGeo.x
                        y: model.window.y - screenOverlay.screenGeo.y
                        z: model.window.stackingOrder
                        width: model.window.width
                        height: model.window.height
                        visible: !model.window.hidden && !model.window.minimized
                    }
                }
            }

            // Layer 2: Dim tint over the desktop (z=100 — above all windows)
            Rectangle {
                anchors.fill: parent
                z: 100
                color: "#000000"
                opacity: root.activeOverlay ? 0.3 : 0.0
                Behavior on opacity {
                    NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
                }
            }

            // Layer 3: Grid cells (target screen only, z=101 — above dim tint)
            Item {
                id: gridContainer
                anchors.fill: parent
                z: 101
                visible: screenOverlay.isTargetScreen && root.activeOverlay

                Repeater {
                    model: screenOverlay.zones.length
                    Rectangle {
                        readonly property var zone: screenOverlay.zones[index] || {}
                        readonly property int zRow: zone.row !== undefined ? zone.row : -1
                        readonly property int zCol: zone.col !== undefined ? zone.col : -1
                        readonly property bool isHovered:
                            root.hoveredRow === zRow && root.hoveredCol === zCol && zRow >= 0
                        readonly property bool isSelected: {
                            var sr = root.selectionRect
                            if (!sr || zRow < 0) return false
                            return zRow >= sr.minRow && zRow <= sr.maxRow &&
                                   zCol >= sr.minCol && zCol <= sr.maxCol
                        }

                        x: (zone.x !== undefined ? zone.x : 0) - screenOverlay.screenGeo.x
                        y: (zone.y !== undefined ? zone.y : 0) - screenOverlay.screenGeo.y
                        width: zone.width || 0
                        height: zone.height || 0

                        color: isSelected ? "#504CAF50"
                             : isHovered  ? "#5042A5F5"
                                          : "transparent"
                        border.color: isSelected ? "#B04CAF50"
                                    : isHovered  ? "#B042A5F5"
                                                 : "#60FFFFFF"
                        border.width: (isSelected || isHovered) ? 2 : 1
                        radius: 2
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton | Qt.RightButton

                    function cellAtPos(mx, my) {
                        var sg = screenOverlay.screenGeo
                        var absX = sg.x + mx
                        var absY = sg.y + my
                        var zs = screenOverlay.zones
                        for (var i = 0; i < zs.length; i++) {
                            var z = zs[i]
                            if (absX >= z.x && absX < z.x + z.width &&
                                absY >= z.y && absY < z.y + z.height)
                                return { row: z.row, col: z.col }
                        }
                        return null
                    }

                    onPositionChanged: function(mouse) {
                        if (!root.activeOverlay) return
                        var c = cellAtPos(mouse.x, mouse.y)
                        if (c) {
                            root.hoveredRow = c.row
                            root.hoveredCol = c.col
                            if (screenOverlay.isDragging)
                                root.updateSelection(screenOverlay.dragStartRow,
                                    screenOverlay.dragStartCol, c.row, c.col)
                        } else {
                            root.hoveredRow = -1; root.hoveredCol = -1
                        }
                    }

                    onPressed: function(mouse) {
                        if (!root.activeOverlay) return
                        if (mouse.button === Qt.RightButton) {
                            root.deactivateOverlay("right-click"); return
                        }
                        var c = cellAtPos(mouse.x, mouse.y)
                        if (c) {
                            screenOverlay.dragStartRow = c.row
                            screenOverlay.dragStartCol = c.col
                            screenOverlay.isDragging = true
                            root.updateSelection(c.row, c.col, c.row, c.col)
                        }
                    }

                    onReleased: function(mouse) {
                        if (!root.activeOverlay || mouse.button !== Qt.LeftButton) return
                        if (!screenOverlay.isDragging) return
                        var c = cellAtPos(mouse.x, mouse.y)
                        var eRow = c ? c.row : screenOverlay.dragStartRow
                        var eCol = c ? c.col : screenOverlay.dragStartCol
                        screenOverlay.isDragging = false
                        console.log("[PlasmaSnap] selection: (" +
                                    screenOverlay.dragStartRow + "," + screenOverlay.dragStartCol +
                                    ") -> (" + eRow + "," + eCol + ")")
                        gridContainer.placeWindowInRegion(
                            { row: screenOverlay.dragStartRow, col: screenOverlay.dragStartCol },
                            { row: eRow, col: eCol })
                    }
                }

                function placeWindowInRegion(startCell, endCell) {
                    var win = root.targetWindow
                    console.log("[PlasmaSnap] placeWindowInRegion start: win=" + (win ? win.caption : "null"))
                    if (!win) { root.deactivateOverlay("no-window"); return }
                    var elig = EligibilityFilter.checkEligibility(win)
                    if (!elig.eligible) {
                        console.log("[PlasmaSnap] ineligible: " + elig.reason)
                        root.deactivateOverlay("ineligible"); return
                    }
                    var region
                    try {
                        region = ZoneCalc.calculateRegion(screenOverlay.zones, startCell, endCell)
                    } catch (e) {
                        console.log("[PlasmaSnap] region error: " + e)
                        root.deactivateOverlay("region-error"); return
                    }
                    console.log("[PlasmaSnap] region computed: " + region.x + "," + region.y +
                                " " + region.width + "x" + region.height)
                    var tX = region.x, tY = region.y, tW = region.width, tH = region.height
                    var minW = win.minSize ? win.minSize.width : 0
                    var minH = win.minSize ? win.minSize.height : 0
                    // KWin reports maxSize as 0 when unconstrained.
                    var maxW = (win.maxSize && win.maxSize.width > 0) ? win.maxSize.width : 0
                    var maxH = (win.maxSize && win.maxSize.height > 0) ? win.maxSize.height : 0
                    if (minW > 0 && tW < minW) { tX += (tW - minW) / 2; tW = minW }
                    if (minH > 0 && tH < minH) { tY += (tH - minH) / 2; tH = minH }
                    if (maxW > 0 && tW > maxW) { tX += (tW - maxW) / 2; tW = maxW }
                    if (maxH > 0 && tH > maxH) { tY += (tH - maxH) / 2; tH = maxH }
                    // Clamp to work area so nothing lands under a panel or off-screen.
                    var wa = screenOverlay.workArea
                    if (wa) {
                        if (tW > wa.width) tW = wa.width
                        if (tH > wa.height) tH = wa.height
                        if (tX < wa.x) tX = wa.x
                        if (tY < wa.y) tY = wa.y
                        if (tX + tW > wa.x + wa.width)  tX = wa.x + wa.width  - tW
                        if (tY + tH > wa.y + wa.height) tY = wa.y + wa.height - tH
                    }
                    var beforeGeo = win.frameGeometry
                    console.log("[PlasmaSnap] before move: " + beforeGeo.x + "," + beforeGeo.y +
                                " " + beforeGeo.width + "x" + beforeGeo.height)
                    var targetRect = Qt.rect(Math.round(tX), Math.round(tY),
                                             Math.round(tW), Math.round(tH))
                    console.log("[PlasmaSnap] setting frameGeometry to: " + targetRect.x + "," +
                                targetRect.y + " " + targetRect.width + "x" + targetRect.height)
                    win.frameGeometry = targetRect
                    var afterGeo = win.frameGeometry
                    console.log("[PlasmaSnap] after move: " + afterGeo.x + "," + afterGeo.y +
                                " " + afterGeo.width + "x" + afterGeo.height)
                    root.deactivateOverlay("placed")
                }
            }

            // Layer 4: Density bar (target screen only, z=102 — above grid)
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 24
                z: 102
                spacing: 8
                visible: screenOverlay.isTargetScreen && root.activeOverlay
                Repeater {
                    model: [
                        { label: "8\u00d76", value: "8x6" },
                        { label: "6\u00d74", value: "6x4" },
                        { label: "4\u00d74", value: "4x4" }
                    ]
                    Rectangle {
                        width: 64; height: 32; radius: 6
                        color: root.currentDensity === modelData.value ? "#42A5F5" : "#40FFFFFF"
                        border.color: root.currentDensity === modelData.value ? "#FFFFFF" : "#80FFFFFF"
                        border.width: 1
                        Text {
                            anchors.centerIn: parent
                            text: modelData.label
                            color: "#FFFFFF"
                            font.pixelSize: 14
                            font.bold: root.currentDensity === modelData.value
                        }
                        MouseArea {
                            anchors.fill: parent
                            onClicked: root.currentDensity = modelData.value
                        }
                    }
                }
            }

            Keys.onPressed: function(event) {
                if (!root.activeOverlay) return
                if (event.key === Qt.Key_Escape) {
                    root.deactivateOverlay("escape"); event.accepted = true
                } else if (event.key === Qt.Key_1) {
                    root.currentDensity = "8x6"; event.accepted = true
                } else if (event.key === Qt.Key_2) {
                    root.currentDensity = "6x4"; event.accepted = true
                } else if (event.key === Qt.Key_3) {
                    root.currentDensity = "4x4"; event.accepted = true
                }
            }
        }
    }

    Component.onCompleted: console.log("[PlasmaSnap] effect loaded")
    Component.onDestruction: console.log("[PlasmaSnap] effect unloaded")
}
