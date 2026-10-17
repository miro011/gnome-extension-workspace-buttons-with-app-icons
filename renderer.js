// The purpose of this function is to make the processing of stuff more efficient (same loop processes mulitple elements, keeping track of window ids themselves insteaad of mapping them every time etc.)

import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GLib from "gi://GLib";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";

import WorkspaceButtons from "./workspace-buttons.js";
import Topbars from "./topbars.js";
import * as globals from "./globals.js";

export default class Renderer {
    constructor(extensionInst) {
        this.extensionInst = extensionInst;
        this._init();
    }

    _init() {
        //log("renderer => _init");
        this._toggle_getWindowList_current_monitor_override(1);
        this.extensionInst.extSettings.add_event_id(this.extensionInst.extSettings.realTimeObj.connect('changed::window-switcher-popup-show-windows-from-all-monitors', () => {
            this._toggle_getWindowList_current_monitor_override(1);
        }));

        this.winIdsContRepr = []; // [m0[ws0[winId, winId], ws1[winId]], m1[...]....] - same structure as the ws buttons container
        
        this.numMonitors = global.display.get_n_monitors();
        this.wssOnlyOnPrimary = this.extensionInst.mutterSettings.get("workspaces-only-on-primary");
        this.mainMonitorIndex = Main.layoutManager.primaryMonitor.index;
        //log(`numMonitors=${this.numMonitors}\nwssOnlyOnPrimary=${this.wssOnlyOnPrimary}\nmainMonitorIndex=${this.mainMonitorIndex}`);

        this.topbars = new Topbars(this);
        this.workspaceButtons = new WorkspaceButtons(this);

        this.gnomeGlobalEventIdsObj = {"display": [], "workspace_manager": []};
        this.gnomeMainEventIdsObj = {"layoutManager": [], "overview": []};
        this.glibTimeoutIdsSet = new Set();
        this._reconcileTimeoutId = 0;
        this._reconcileFireAt = 0;
        this._periodicReconcileTimeoutId = 0;
        // Window ids whose window-created retry still owns icon creation.
        this._pendingNewWindows = new Set();

        this._initial_population();
        this._enable_settings_events();
        this._enable_gnome_events();
        this._start_periodic_reconcile();

        globals.update_stylesheet_and_reload_style(this.extensionInst);
    }

    destroy(full=true, restorePrimaryMonitor=true) {
        //log(`renderer => destroy(${full}, ${restorePrimaryMonitor})`);
        this.topbars.destroy();
        this.topbars = null;
        this.workspaceButtons.destroy();
        this.workspaceButtons = null;

        this.extensionInst.extSettings.reset_events();
        this.extensionInst.mutterSettings.reset_events();

        if (full===true) {
            this._toggle_getWindowList_current_monitor_override(0);
            this.extensionInst = null;
        }

        for (let component in this.gnomeMainEventIdsObj) {
            let componentObj = Main[component];
            let eventIdsArr = this.gnomeMainEventIdsObj[component];
            for (let eventId of eventIdsArr) {
                componentObj.disconnect(eventId);
            }
        }
        this.gnomeMainEventIdsObj = null;

        for (let component in this.gnomeGlobalEventIdsObj) {
            let componentObj = global[component];
            let eventIdsArr = this.gnomeGlobalEventIdsObj[component];
            for (let eventId of eventIdsArr) {
                componentObj.disconnect(eventId);
            }
        }
        this.gnomeGlobalEventIdsObj = null;

        for (let timeoutId of this.glibTimeoutIdsSet) {
            GLib.Source.remove(timeoutId);
        }
        this.glibTimeoutIdsSet.clear();
        this.glibTimeoutIdsSet = null;
        
        // for the workspaces that remain, we wanna clean up the window added event
        for (let wsIndex=0; wsIndex<global.workspace_manager.get_n_workspaces(); wsIndex++) {
            let wsObj = global.workspace_manager.get_workspace_by_index(wsIndex);
            if (wsObj.hasOwnProperty("_windowAddedEventId")) {
                //log("ws with window added event found and removed");
                wsObj.disconnect(wsObj._windowAddedEventId);
                delete wsObj["_windowAddedEventId"]; // Completely remove property
            }
            if (wsObj.hasOwnProperty("_windowRemovedEventId")) {
                wsObj.disconnect(wsObj._windowRemovedEventId);
                delete wsObj["_windowRemovedEventId"];
            }
        }

        this.winIdsContRepr = null;
        this.numMonitors = null;
        this.wssOnlyOnPrimary = null;
        if (restorePrimaryMonitor) {
            Main.layoutManager.primaryMonitor = Main.layoutManager.monitors[this.mainMonitorIndex];
        }
        this.mainMonitorIndex = null;
    }

    _toggle_getWindowList_current_monitor_override(state) {
        if (state === 1 && this.extensionInst.extSettings.get("window-switcher-popup-show-windows-from-all-monitors") === false) {
            let originalGetWindowListFunc = this.extensionInst.originalGetWindowListFunc;
            AltTab.WindowSwitcherPopup.prototype._getWindowList = function() {
                const monitor = global.display.get_current_monitor();
                const windows = originalGetWindowListFunc.call(this).filter(w => w.get_monitor() === monitor);
                //log("Filtered windows:", windows.map(w => w.get_title()));
                return windows;
            };
        }
        else {
            AltTab.WindowSwitcherPopup.prototype._getWindowList = this.extensionInst.originalGetWindowListFunc;
        }
    }

    //////////////////////////////////////

    _initial_population() {
        //log("initial population");

        // Monitors and creation of base elements
        for (let monitorIndex = 0; monitorIndex < this.numMonitors; monitorIndex++) {
            this.topbars.add_topbar(monitorIndex); // this causes some error without trace
            this.winIdsContRepr.push([]);
            let newWsBtnsContainer = this.workspaceButtons.add_container();
            this.topbars.append_workspace_buttons(monitorIndex, newWsBtnsContainer);
        }

        // Windows
        for (let wsIndex = 0; wsIndex < global.workspace_manager.get_n_workspaces(); wsIndex++) {
            let windowsPerMonitorArr = this._get_ws_windows_by_monitor(wsIndex); // [m1[id,id,id], m2[]] (wsIndex=x)
            //log("windowsPerMonitorArr");
            //log(windowsPerMonitorArr);

            for (let monitorIndex=0; monitorIndex < this.numMonitors; monitorIndex++) {
                if (windowsPerMonitorArr[monitorIndex] === null) continue;
                this.winIdsContRepr[monitorIndex].push([]);
                this.workspaceButtons.add_ws_btn(monitorIndex, wsIndex);

                for (let windowObj of windowsPerMonitorArr[monitorIndex]) {
                    let windowId = windowObj.get_id();
                    this.winIdsContRepr[monitorIndex][wsIndex].push(windowId);
                    this.workspaceButtons.add_window_icon("r", windowObj, monitorIndex, wsIndex); // windows list is already in the right order
                }
            }

            this._add_window_added_event_to_workspace(wsIndex);
        }

        this.workspaceButtons.update_active_workspace();

        //this._debug_log_structures();
    }

    _enable_settings_events() {
        let id;

        id = this.extensionInst.mutterSettings.realTimeObj.connect('changed::workspaces-only-on-primary', () => {
            this.destroy(false);
            this._init();
        });
        this.extensionInst.mutterSettings.add_event_id(id);

        id = this.extensionInst.mutterSettings.realTimeObj.connect('changed::dynamic-workspaces', () => {
            this.destroy(false);
            this._init();
        });
        this.extensionInst.mutterSettings.add_event_id(id);

        id = this.extensionInst.extSettings.realTimeObj.connect('changed::wsb-periodic-reconcile', () => {
            this._stop_periodic_reconcile();
            this._start_periodic_reconcile();
        });
        this.extensionInst.extSettings.add_event_id(id);
    }

    _enable_gnome_events() {
        this.gnomeMainEventIdsObj["layoutManager"].push(Main.layoutManager.connect('monitors-changed', () => {
            //log("monitors-changed");
            this.destroy(false, false); // don't wanna change back to the old (saved) primary. When monitors are changed the primary monitor (if changed) is reassigned on its own
            this._init();
        }));

        // Move-to-new-workspace inserts the workspace inside its own hidden handler.
        // A timeout runs after that handler returns, so this sees the finished move.
        this.gnomeMainEventIdsObj["overview"].push(Main.overview.connect('hidden', () => {
            this._scheduleReconcile();
        }));

        this.gnomeGlobalEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("active-workspace-changed", () => {
            if (this.wssOnlyOnPrimary) {
                // fixes a bug where when workspaces is only on primary and workspace is switched while the non-primary monitor is focused, the workspace switched to has the window from the pvevious workspace (on the main monitor)
                // this happens exactly because when the other monitor is focused this extension overwrites Main.layoutManager.primaryMonitor - so we just need to restore it
                Main.layoutManager.primaryMonitor = Main.layoutManager.monitors[this.mainMonitorIndex];
            }
            this.workspaceButtons.update_active_workspace();
            this._scheduleReconcile();
        }));

        this.gnomeGlobalEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("workspace-added", (wm, wsIndex) => {
            //log("ws added");
            // if workspaces is only on primary, it can only be added to the main monitor, otherwise, all monitors
            if (this.wssOnlyOnPrimary) {
                this.winIdsContRepr[this.mainMonitorIndex].splice(wsIndex, 0, []);
                this.workspaceButtons.add_ws_btn(this.mainMonitorIndex, wsIndex);
            }
            else {
                for (let monitorIndex=0; monitorIndex<this.numMonitors; monitorIndex++) {
                    this.winIdsContRepr[monitorIndex].splice(wsIndex, 0, []);
                    this.workspaceButtons.add_ws_btn(monitorIndex, wsIndex);
                }
            }

            this._add_window_added_event_to_workspace(wsIndex);
            this._scheduleReconcile();
        }));

        this.gnomeGlobalEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("workspace-removed", (wm, wsIndex) => {
            //log("ws removed");
            if (this.wssOnlyOnPrimary) {
                this.winIdsContRepr[this.mainMonitorIndex].splice(wsIndex, 1);
                this.workspaceButtons.rm_ws_btn(this.mainMonitorIndex, wsIndex);
            }
            else {
                for (let monitorIndex=0; monitorIndex<this.numMonitors; monitorIndex++) {
                    this.winIdsContRepr[monitorIndex].splice(wsIndex, 1);
                    this.workspaceButtons.rm_ws_btn(monitorIndex, wsIndex);
                }
            }

            this.workspaceButtons.update_active_workspace();
            this._scheduleReconcile();
        }));

        // append_new_workspace() + reorder_workspace() inserts a column and shifts
        // every later workspace. That is not a swap of two workspaces, and the new
        // column is empty, so reading the primary monitor's first window throws.
        this.gnomeGlobalEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("workspaces-reordered", () => {
            this._scheduleReconcile(0);
        }));

        this.gnomeGlobalEventIdsObj["display"].push(global.display.connect('window-created', (display, newWindowObj) => {
            this._schedule_new_window_attempt(newWindowObj, 0);
            this._scheduleReconcile(1000);
        }));

        // a window leaves a monitor if it's a/ closed or b/ moved to another monitor
        // when moved to another monitor, it is possible to also be moved to another workspace, but we don't care about that - we just move it to the monitor
        // note that if the window-added (to workspace) event triggers before this one, it will move it to both the right workspace and monitor, and this function will return because everything matches
        this.gnomeGlobalEventIdsObj["display"].push(global.display.connect('window-left-monitor', (display, oldMonitorIndex, windowObj) => {
            this._scheduleReconcile();
            // don't want to check normal here in case a not normal window posing as normal (beore window object fully loading on wayland under xwayland)
            //log("window left monitor");

            let winIdsMeta = this._get_winIdsMeta();
            
            let newMonitorIndex = windowObj.get_monitor(); // if window was closed this returns -1
            let windowId = windowObj.get_id();
            if (winIdsMeta[windowId] === undefined) {
                return;
            }
            let oldSavedMonitorIndex = winIdsMeta[windowId]["monitorIndex"];

            // if window entered workspace triggers before this event, it has already moved it to the right monitor, so have nothing left to do
            if (oldSavedMonitorIndex === newMonitorIndex) {
                return;
            }

            let oldWsIndex = winIdsMeta[windowId]["wsIndex"];
            let oldWindowIndex = this.winIdsContRepr[oldMonitorIndex][oldWsIndex].indexOf(windowId);

            if (newMonitorIndex < 0) {
                //log("window closed");
                this.workspaceButtons.remove_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex);
                this.winIdsContRepr[oldMonitorIndex][oldWsIndex].splice(oldWindowIndex, 1);
            }
            else {
                //log("window moved to another monitor");
                let newWsIndex = (this.wssOnlyOnPrimary && newMonitorIndex !== this.mainMonitorIndex) ? 0 : oldWsIndex;
                let newWindowIndex = 0;
                this.workspaceButtons.move_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex, newMonitorIndex, newWsIndex, newWindowIndex);
                this.winIdsContRepr[oldMonitorIndex][oldWsIndex].splice(oldWindowIndex, 1);
                this.winIdsContRepr[newMonitorIndex][newWsIndex].unshift(windowId);
            }
        }));
        

        // Here, we're only concenred about focus changes of EXISTING windows on the SAME MONITOR AND WORKSPACE
        this.gnomeGlobalEventIdsObj["display"].push(global.display.connect("notify::focus-window", () => {
            let newlyFocusedWindowObj = global.display.focus_window;
            if (!newlyFocusedWindowObj) return; // if last window in a workspace (empty workspace) is closed event will fire but there will be no focused window

            let monitorIndex = newlyFocusedWindowObj.get_monitor();

            // this is the only way I found to display AltTab in the current monitor - overriding primaryMonitor
            // I tried overriding a bunch of functions and classes from AltTab WindowSwitcher and others but nothing worked
            // This right here is not perfect as the "current monitor" is determined based on window focus (or when workspace buttons are clicked in their class)
            // so it doesn't follow mouse cursor and you have to click on the monitor to change. I could add a function that tracks the pointer but then performance would take a hit and I don't think it's worth it
            Main.layoutManager.primaryMonitor = Main.layoutManager.monitors[monitorIndex];

            let wsIndex = newlyFocusedWindowObj.get_workspace().index();
            if (this.wssOnlyOnPrimary && monitorIndex !== this.mainMonitorIndex) {
                wsIndex = 0;
            }

            let winIdsMeta = this._get_winIdsMeta();
            
            let windowId = newlyFocusedWindowObj.get_id();
            if (winIdsMeta[windowId] === undefined) {
                return; // newly opened window
            }

            if (winIdsMeta[windowId]["monitorIndex"] !== monitorIndex || winIdsMeta[windowId]["wsIndex"] !== wsIndex) {
                return; // window has moved somewhere else which is reserved for the other handlers
            }

            if (this.winIdsContRepr[monitorIndex][wsIndex][0] === windowId) {
                return; // window is already at the front (for example workspace switch, or when another window was moved etc.)
            }
            
            let oldWindowIndex = this.winIdsContRepr[monitorIndex][wsIndex].indexOf(windowId);
            this.winIdsContRepr[monitorIndex][wsIndex].splice(oldWindowIndex, 1);
            this.winIdsContRepr[monitorIndex][wsIndex].unshift(windowId);
            this.workspaceButtons.move_window_icon(monitorIndex, wsIndex, oldWindowIndex, monitorIndex, wsIndex, 0);
        }));
    }

    //////////////////////////////////////

    // One pending pass. A later request never delays one that is already due sooner.
    _scheduleReconcile(delayMs = 300) {
        if (!this.glibTimeoutIdsSet) return;

        const now = GLib.get_monotonic_time();
        const fireAt = now + delayMs * 1000;
        if (this._reconcileTimeoutId && this._reconcileFireAt && this._reconcileFireAt <= fireAt)
            return;

        if (this._reconcileTimeoutId) {
            GLib.Source.remove(this._reconcileTimeoutId);
            this.glibTimeoutIdsSet.delete(this._reconcileTimeoutId);
            this._reconcileTimeoutId = 0;
            this._reconcileFireAt = 0;
        }

        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            if (this.glibTimeoutIdsSet)
                this.glibTimeoutIdsSet.delete(timeoutId);
            if (this._reconcileTimeoutId === timeoutId) {
                this._reconcileTimeoutId = 0;
                this._reconcileFireAt = 0;
            }
            this._reconcile();
            return GLib.SOURCE_REMOVE;
        });
        this._reconcileTimeoutId = timeoutId;
        this._reconcileFireAt = fireAt;
        this.glibTimeoutIdsSet.add(timeoutId);
    }

    _reconcile() {
        if (!this.winIdsContRepr || !this.workspaceButtons || this._reconciling)
            return;
        this._reconciling = true;
        try {
            const captured = this._capture_real_layout();
            if (!this._layout_shape_matches(captured.cells)) {
                this._rebuild_from_reality();
                return;
            }
            // Same windows in the same columns: leave MRU order to the focus handler.
            if (this._placement_signature(captured.cells) === this._placement_signature(this.winIdsContRepr))
                return;
            const fixes = this._apply_reconcile_diff(captured);
            if (fixes > 0)
                log(`[wsb] reconcile fixed ${fixes}`);
        } catch (e) {
            log(`[wsb] reconcile failed: ${e}`);
        } finally {
            this._reconciling = false;
        }
    }

    _rebuild_from_reality() {
        if (this._reconcileTimeoutId && this.glibTimeoutIdsSet) {
            this.glibTimeoutIdsSet.delete(this._reconcileTimeoutId);
            this._reconcileTimeoutId = 0;
            this._reconcileFireAt = 0;
        }
        this.destroy(false, false);
        this._init();
    }

    // cells[monitor][workspace] = [windowId, ...] in tab-list order.
    // Secondary monitors under workspaces-only-on-primary keep a single column, matching the cache.
    _capture_real_layout() {
        const nMonitors = this.numMonitors;
        const nWorkspaces = global.workspace_manager.get_n_workspaces();
        const cells = [];
        for (let monitorIndex = 0; monitorIndex < nMonitors; monitorIndex++)
            cells.push([]);
        const windowsById = new Map();

        for (let wsIndex = 0; wsIndex < nWorkspaces; wsIndex++) {
            const perMonitor = this._get_ws_windows_by_monitor(wsIndex);
            for (let monitorIndex = 0; monitorIndex < nMonitors; monitorIndex++) {
                if (perMonitor[monitorIndex] === null)
                    continue;
                const ids = [];
                for (const windowObj of perMonitor[monitorIndex]) {
                    const windowId = windowObj.get_id();
                    ids.push(windowId);
                    windowsById.set(windowId, windowObj);
                }
                cells[monitorIndex].push(ids);
            }
        }
        return { cells, windowsById };
    }

    _layout_shape_matches(realCells) {
        if (realCells.length !== this.winIdsContRepr.length)
            return false;
        for (let monitorIndex = 0; monitorIndex < realCells.length; monitorIndex++) {
            const cached = this.winIdsContRepr[monitorIndex];
            if (!cached || realCells[monitorIndex].length !== cached.length)
                return false;
        }
        return true;
    }

    // Order inside a column is ignored. A pure shift of columns still differs.
    _placement_signature(cells) {
        const parts = [`n:${cells.length}`];
        for (let monitorIndex = 0; monitorIndex < cells.length; monitorIndex++) {
            parts.push(`m${monitorIndex}:${cells[monitorIndex].length}`);
            for (let wsIndex = 0; wsIndex < cells[monitorIndex].length; wsIndex++) {
                const ids = cells[monitorIndex][wsIndex].map(windowId => String(windowId)).sort();
                parts.push(`${monitorIndex}.${wsIndex}:${ids.join(",")}`);
            }
        }
        return parts.join("|");
    }

    _placement_matches() {
        const real = this._capture_real_layout();
        return this._placement_signature(real.cells) === this._placement_signature(this.winIdsContRepr);
    }

    // A window on all workspaces is listed once per column. Surplus cache copies are moved
    // onto missing columns before anything is removed, so a relocated window keeps its icon widget.
    _apply_reconcile_diff(captured) {
        const realLocs = new Map();
        for (let monitorIndex = 0; monitorIndex < captured.cells.length; monitorIndex++) {
            for (let wsIndex = 0; wsIndex < captured.cells[monitorIndex].length; wsIndex++) {
                const ids = captured.cells[monitorIndex][wsIndex];
                for (let rank = 0; rank < ids.length; rank++) {
                    const windowId = ids[rank];
                    if (!realLocs.has(windowId))
                        realLocs.set(windowId, []);
                    realLocs.get(windowId).push({ monitorIndex, wsIndex, rank });
                }
            }
        }

        const cacheLocs = new Map();
        for (let monitorIndex = 0; monitorIndex < this.winIdsContRepr.length; monitorIndex++) {
            for (let wsIndex = 0; wsIndex < this.winIdsContRepr[monitorIndex].length; wsIndex++) {
                for (const windowId of this.winIdsContRepr[monitorIndex][wsIndex]) {
                    if (!cacheLocs.has(windowId))
                        cacheLocs.set(windowId, []);
                    cacheLocs.get(windowId).push({ monitorIndex, wsIndex });
                }
            }
        }

        const windowIds = new Set();
        for (const windowId of realLocs.keys())
            windowIds.add(windowId);
        for (const windowId of cacheLocs.keys())
            windowIds.add(windowId);

        const removals = [];
        const moves = [];
        const adds = [];
        for (const windowId of windowIds) {
            const realList = realLocs.get(windowId) || [];
            const cacheList = cacheLocs.get(windowId) || [];
            const realLeft = realList.map(loc => ({
                monitorIndex: loc.monitorIndex,
                wsIndex: loc.wsIndex,
                rank: loc.rank,
                used: false,
            }));
            const surplus = [];
            for (const cached of cacheList) {
                const match = realLeft.find(loc => !loc.used && loc.monitorIndex === cached.monitorIndex && loc.wsIndex === cached.wsIndex);
                if (match)
                    match.used = true;
                else
                    surplus.push(cached);
            }
            const missing = realLeft.filter(loc => !loc.used);
            const pairCount = Math.min(surplus.length, missing.length);
            for (let i = 0; i < pairCount; i++) {
                moves.push({
                    windowId,
                    fromM: surplus[i].monitorIndex,
                    fromWs: surplus[i].wsIndex,
                    toM: missing[i].monitorIndex,
                    toWs: missing[i].wsIndex,
                    rank: missing[i].rank,
                });
            }
            for (let i = pairCount; i < surplus.length; i++)
                removals.push({ windowId, monitorIndex: surplus[i].monitorIndex, wsIndex: surplus[i].wsIndex });
            for (let i = pairCount; i < missing.length; i++) {
                adds.push({
                    windowId,
                    monitorIndex: missing[i].monitorIndex,
                    wsIndex: missing[i].wsIndex,
                    rank: missing[i].rank,
                });
            }
        }

        let fixes = 0;
        for (const removal of removals) {
            if (this._remove_cached_id(removal.monitorIndex, removal.wsIndex, removal.windowId))
                fixes++;
        }

        moves.sort((a, b) => {
            if (a.toM !== b.toM) return a.toM - b.toM;
            if (a.toWs !== b.toWs) return a.toWs - b.toWs;
            return b.rank - a.rank;
        });
        for (const move of moves) {
            if (this._move_cached_id(move.fromM, move.fromWs, move.windowId, move.toM, move.toWs))
                fixes++;
        }

        adds.sort((a, b) => {
            if (a.monitorIndex !== b.monitorIndex) return a.monitorIndex - b.monitorIndex;
            if (a.wsIndex !== b.wsIndex) return a.wsIndex - b.wsIndex;
            return b.rank - a.rank;
        });
        for (const add of adds) {
            if (this._add_cached_id(add.monitorIndex, add.wsIndex, add.windowId, captured.windowsById))
                fixes++;
        }
        return fixes;
    }

    _remove_cached_id(monitorIndex, wsIndex, windowId) {
        const list = this.winIdsContRepr[monitorIndex]?.[wsIndex];
        if (!list) return false;
        let index = -1;
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i] === windowId) {
                index = i;
                break;
            }
        }
        if (index < 0) return false;
        this.workspaceButtons.remove_window_icon(monitorIndex, wsIndex, index);
        list.splice(index, 1);
        return true;
    }

    _move_cached_id(fromM, fromWs, windowId, toM, toWs) {
        const src = this.winIdsContRepr[fromM]?.[fromWs];
        const dest = this.winIdsContRepr[toM]?.[toWs];
        if (!src || !dest) return false;
        const oldIndex = src.indexOf(windowId);
        if (oldIndex < 0) return false;
        this.workspaceButtons.move_window_icon(fromM, fromWs, oldIndex, toM, toWs, 0);
        src.splice(oldIndex, 1);
        dest.unshift(windowId);
        return true;
    }

    _add_cached_id(monitorIndex, wsIndex, windowId, windowsById) {
        const row = this.winIdsContRepr[monitorIndex]?.[wsIndex];
        const windowObj = windowsById.get(windowId);
        // Leave a window that just opened to its retry loop, so this pass does not
        // freeze an image-missing placeholder before the app is known.
        if (!row || !windowObj || row.includes(windowId) || this._pendingNewWindows.has(windowId))
            return false;
        row.unshift(windowId);
        this.workspaceButtons.add_window_icon("l", windowObj, monitorIndex, wsIndex);
        return true;
    }

    _schedule_new_window_attempt(newWindowObj, attempt) {
        if (!this.glibTimeoutIdsSet) return;
        if (attempt === 0) {
            try {
                this._pendingNewWindows.add(newWindowObj.get_id());
            } catch (err) {}
        }
        const delay = attempt === 0
            ? this.extensionInst.extSettings.get("wsb-generate-window-icon-timeout")
            : 250;
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            if (this.glibTimeoutIdsSet)
                this.glibTimeoutIdsSet.delete(timeoutId);
            this._try_add_new_window(newWindowObj, attempt);
            return GLib.SOURCE_REMOVE;
        });
        this.glibTimeoutIdsSet.add(timeoutId);
    }

    // attempt 0 waits for wsb-generate-window-icon-timeout. Up to 5 later tries are 250 ms apart.
    _try_add_new_window(newWindowObj, attempt) {
        if (!this.winIdsContRepr || !this.workspaceButtons) return;

        let newWindowId, newWindowMonitorIndex, newWindowWsIndex;
        try {
            newWindowId = newWindowObj.get_id();
            newWindowMonitorIndex = newWindowObj.get_monitor();
            newWindowWsIndex = newWindowObj.get_workspace().index();
        } catch (err) {
            if (attempt < 5) {
                this._schedule_new_window_attempt(newWindowObj, attempt + 1);
            } else {
                try {
                    this._pendingNewWindows.delete(newWindowObj.get_id());
                } catch (e) {}
                this._scheduleReconcile(0);
            }
            return;
        }

        if (this._window_is_in_cache(newWindowId)) {
            this._pendingNewWindows.delete(newWindowId);
            return;
        }

        let inTabList = false;
        try {
            const workspaceObj = global.workspace_manager.get_workspace_by_index(newWindowWsIndex);
            for (const windowObj of global.display.get_tab_list(Meta.TabList.NORMAL, workspaceObj)) {
                if (windowObj.get_id() === newWindowId) {
                    inTabList = true;
                    break;
                }
            }
        } catch (err) {
            inTabList = false;
        }

        let appReady = false;
        if (inTabList) {
            try {
                appReady = Shell.WindowTracker.get_default().get_window_app(newWindowObj) != null;
            } catch (err) {
                appReady = false;
            }
        }

        if (!inTabList || !appReady) {
            if (attempt < 5) {
                this._schedule_new_window_attempt(newWindowObj, attempt + 1);
                return;
            }
            this._pendingNewWindows.delete(newWindowId);
            this._scheduleReconcile(0);
            if (!inTabList) return;
        }

        this._pendingNewWindows.delete(newWindowId);

        if (this.wssOnlyOnPrimary && newWindowMonitorIndex !== this.mainMonitorIndex)
            newWindowWsIndex = 0;

        const row = this.winIdsContRepr[newWindowMonitorIndex]?.[newWindowWsIndex];
        if (!row) {
            this._scheduleReconcile(0);
            return;
        }
        if (row.includes(newWindowId)) return;
        row.unshift(newWindowId);
        this.workspaceButtons.add_window_icon("l", newWindowObj, newWindowMonitorIndex, newWindowWsIndex);
    }

    _window_is_in_cache(windowId) {
        for (const monitor of this.winIdsContRepr) {
            for (const workspace of monitor) {
                if (workspace.includes(windowId))
                    return true;
            }
        }
        return false;
    }

    _start_periodic_reconcile() {
        if (!this.glibTimeoutIdsSet || this._periodicReconcileTimeoutId)
            return;
        if (!this.extensionInst.extSettings.get("wsb-periodic-reconcile"))
            return;

        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30000, () => {
            if (this.glibTimeoutIdsSet)
                this.glibTimeoutIdsSet.delete(timeoutId);
            if (this._periodicReconcileTimeoutId === timeoutId)
                this._periodicReconcileTimeoutId = 0;
            this._on_periodic_reconcile();
            return GLib.SOURCE_REMOVE;
        });
        this._periodicReconcileTimeoutId = timeoutId;
        this.glibTimeoutIdsSet.add(timeoutId);
    }

    _stop_periodic_reconcile() {
        if (this._periodicReconcileTimeoutId && this.glibTimeoutIdsSet) {
            GLib.Source.remove(this._periodicReconcileTimeoutId);
            this.glibTimeoutIdsSet.delete(this._periodicReconcileTimeoutId);
        }
        this._periodicReconcileTimeoutId = 0;
    }

    _on_periodic_reconcile() {
        if (!this.winIdsContRepr) return;
        try {
            // A count check would miss a column shift that keeps the same windows.
            if (!this._reconcileTimeoutId && !this._placement_matches())
                this._reconcile();
        } catch (e) {
            log(`[wsb] reconcile failed: ${e}`);
        }
        if (this.winIdsContRepr && !this._periodicReconcileTimeoutId)
            this._start_periodic_reconcile();
    }

    // return array of arrays, each child array containing the windows for that monitor (order of child arrays within main array is same as monitor indexes)
    _get_ws_windows_by_monitor(wsIndex) {
        let output = [];
        for (let monitorIndex=0; monitorIndex<this.numMonitors; monitorIndex++) {
            // with workspaces only on primary enabled, the same windows (for the non-main monitors will appear in every workspace)
            // we only want to list them when getting the first workspace (wsIndex=0) as that's the only workspace they have
            if (this.wssOnlyOnPrimary && monitorIndex !== this.mainMonitorIndex && wsIndex > 0) {
                output.push(null);
            }
            else {
                output.push([]);
            }
        }

        let workspaceObj = global.workspace_manager.get_workspace_by_index(wsIndex);

        for (let windowObj of global.display.get_tab_list(Meta.TabList.NORMAL, workspaceObj)) {
            let monitorIndex = windowObj.get_monitor();
            if (monitorIndex >= 0 && monitorIndex < output.length && output[monitorIndex] !== null) {
                output[monitorIndex].push(windowObj);
            }
        }

        return output;
    }

    // used to detect when window move workspaces
    // if triggered before window-left-monitor, this handler will also move the window the new monitor (and then window-left-monitor won't do anything) 
    _add_window_added_event_to_workspace(wsIndex) {
        let workspaceObject = global.workspace_manager.get_workspace_by_index(wsIndex);

        workspaceObject._windowAddedEventId = workspaceObject.connect('window-added', (workspaceObj, windowObj) => {
            this._scheduleReconcile();
            //log("window added to workspace")

            let windowId = windowObj.get_id();
            let winIdsMeta = this._get_winIdsMeta();

            if (winIdsMeta[windowId] === undefined) {
                return; // new window opened - handled and properly placed by another event
            }

            let oldMonitorIndex = winIdsMeta[windowId]["monitorIndex"];
            let newMonitorIndex = windowObj.get_monitor();
            let oldWsIndex = winIdsMeta[windowId]["wsIndex"];
            let newWsIndex = (this.wssOnlyOnPrimary && newMonitorIndex !== this.mainMonitorIndex) ? 0 : workspaceObj.index();
            
            if (oldMonitorIndex === newMonitorIndex && oldWsIndex === newWsIndex) {
                return; // nothing to do
            }
            
            let oldWindowIndex = this.winIdsContRepr[oldMonitorIndex][oldWsIndex].indexOf(windowId);

            this.workspaceButtons.move_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex, newMonitorIndex, newWsIndex, 0);
            this.winIdsContRepr[oldMonitorIndex][oldWsIndex].splice(oldWindowIndex, 1);
            this.winIdsContRepr[newMonitorIndex][newWsIndex].unshift(windowId);
        });

        workspaceObject._windowRemovedEventId = workspaceObject.connect('window-removed', () => {
            this._scheduleReconcile();
        });
    }

    // returns the reverse of this.winIdsContRepr: {winId: {"monitorIndex":0, "wsIndex":1}, ...}
    _get_winIdsMeta() {
        let winIdsMeta = {};
    
        // Loop through all monitors
        for (let monitorIndex = 0; monitorIndex < this.winIdsContRepr.length; monitorIndex++) {
            let monitorWorkspaces = this.winIdsContRepr[monitorIndex];
    
            // Loop through all workspaces for the current monitor
            for (let wsIndex = 0; wsIndex < monitorWorkspaces.length; wsIndex++) {
                let workspaceWindows = monitorWorkspaces[wsIndex];
    
                // Loop through all windows in the workspace
                for (let windowId of workspaceWindows) {
                    winIdsMeta[windowId] = {"monitorIndex":monitorIndex, "wsIndex":wsIndex};
                }
            }
        }
    
        return winIdsMeta;
    }

    _debug_log_structures() {
        log("winIdsContRepr");
        log(this.winIdsContRepr);
        log("workspaceButtons.debug_get_container_representation_array()");
        log(this.workspaceButtons.debug_get_container_representation_array());
    }
}
