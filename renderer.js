// The purpose of this function is to make the processing of stuff more efficient (same loop processes mulitple elements, keeping track of window ids themselves insteaad of mapping them every time etc.)

import Meta from "gi://Meta";
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
        this.gnomeMainEventIdsObj = {"layoutManager": []};
        this.glibTimeoutIdsSet = new Set();
        
        this._initial_population();
        this._enable_settings_events();
        this._enable_gnome_events();

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
    }

    _enable_gnome_events() {
        this.gnomeMainEventIdsObj["layoutManager"].push(Main.layoutManager.connect('monitors-changed', () => {
            //log("monitors-changed");
            this.destroy(false, false); // don't wanna change back to the old (saved) primary. When monitors are changed the primary monitor (if changed) is reassigned on its own
            this._init();
        }));

        this.gnomeGlobalEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("active-workspace-changed", () => {
            if (this.wssOnlyOnPrimary) {
                // fixes a bug where when workspaces is only on primary and workspace is switched while the non-primary monitor is focused, the workspace switched to has the window from the pvevious workspace (on the main monitor)
                // this happens exactly because when the other monitor is focused this extension overwrites Main.layoutManager.primaryMonitor - so we just need to restore it
                Main.layoutManager.primaryMonitor = Main.layoutManager.monitors[this.mainMonitorIndex];
            }
            this.workspaceButtons.update_active_workspace();
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
        }));
        
        this.gnomeGlobalEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("workspaces-reordered", () => {
            //log("workspaces-reordered");
            //this._debug_log_structures();
        
            // This event fires once per swap. The current this.winIdsContRepr is pretty much guaranteed to be up-to-date prior to the workspace reorder.
            // Regardless if workspaces only on primary is on or off, when reordered, the tab list will change for the main monitor.
            // To figure out which two workspaces were swapped, we compare the most recent saved window id to the current window id for the primary monitor per workspace (left to right)
            // We find the first workspace index where the first saved window id on the primary monitor is not equal to the current, and then we find where it is.
            // This tells us which two workspaces got swapped (left to right)
        
            // Figure out which two workspaces were swapped
            let numWss = global.workspace_manager.get_n_workspaces();
            let wsIndex = 0;
            let swappedWs1;
            let notEqualSavedWindowId;
            let swappedWs2;
        
            while (wsIndex<numWss) {
                let curWindowsPerMonitor = this._get_ws_windows_by_monitor(wsIndex);
                let savedWindowId = this.winIdsContRepr[this.mainMonitorIndex][wsIndex][0];
                let curWindowId = curWindowsPerMonitor[this.mainMonitorIndex][0].get_id();
                if (savedWindowId !== curWindowId) {
                    swappedWs1 = wsIndex;
                    notEqualSavedWindowId = savedWindowId;
                }
                wsIndex += 1;
                if (swappedWs1 !== undefined) break;
            }
        
            if (swappedWs1 === undefined) return;
        
            while (wsIndex<numWss) {
                let curWindowsPerMonitor = this._get_ws_windows_by_monitor(wsIndex);
                let curWindowId = curWindowsPerMonitor[this.mainMonitorIndex][0].get_id();
                if (notEqualSavedWindowId === curWindowId) {
                    swappedWs2 = wsIndex;
                    break;
                }
                wsIndex += 1;
            }
        
            if (swappedWs2 === undefined) return;
        
            // Make the changes to the structures
            if (this.wssOnlyOnPrimary) {
                [this.winIdsContRepr[this.mainMonitorIndex][swappedWs1], this.winIdsContRepr[this.mainMonitorIndex][swappedWs2]] = [this.winIdsContRepr[this.mainMonitorIndex][swappedWs2], this.winIdsContRepr[this.mainMonitorIndex][swappedWs1]];
                this.workspaceButtons.swap_ws_btns(this.mainMonitorIndex, swappedWs1, swappedWs2);
            }
            else {
                for (let monitorIndex=0; monitorIndex<this.numMonitors; monitorIndex++) {
                    [this.winIdsContRepr[monitorIndex][swappedWs1], this.winIdsContRepr[monitorIndex][swappedWs2]] = [this.winIdsContRepr[monitorIndex][swappedWs2], this.winIdsContRepr[monitorIndex][swappedWs1]];
                    this.workspaceButtons.swap_ws_btns(monitorIndex, swappedWs1, swappedWs2);
                }
            }
            //this._debug_log_structures();
        }));

        this.gnomeGlobalEventIdsObj["display"].push(global.display.connect('window-created', (display, newWindowObj) => {
            let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.extensionInst.extSettings.get("wsb-generate-window-icon-timeout"), () => {
                let newWindowId, newWindowMonitorIndex, newWindowWsIndex;
                try {
                    newWindowId = newWindowObj.get_id();
                    newWindowMonitorIndex = newWindowObj.get_monitor();
                    newWindowWsIndex = newWindowObj.get_workspace().index();
                } catch(err) {}

                if (newWindowWsIndex !== undefined) {
                    for (let windowObj of global.display.get_tab_list(Meta.TabList.NORMAL, global.workspace_manager.get_workspace_by_index(newWindowWsIndex))) {
                        if (windowObj.get_id() === newWindowId) {
                            if (this.wssOnlyOnPrimary && newWindowMonitorIndex !== this.mainMonitorIndex) newWindowWsIndex = 0;
                            this.winIdsContRepr[newWindowMonitorIndex][newWindowWsIndex].unshift(newWindowId);
                            this.workspaceButtons.add_window_icon("l", newWindowObj, newWindowMonitorIndex, newWindowWsIndex);
                            break;
                        }
                    }
                }

                this.glibTimeoutIdsSet.delete(timeoutId);
                return GLib.SOURCE_REMOVE;
            });

            this.glibTimeoutIdsSet.add(timeoutId);
        }));

        // a window leaves a monitor if it's a/ closed or b/ moved to another monitor
        // when moved to another monitor, it is possible to also be moved to another workspace, but we don't care about that - we just move it to the monitor
        // note that if the window-added (to workspace) event triggers before this one, it will move it to both the right workspace and monitor, and this function will return because everything matches
        this.gnomeGlobalEventIdsObj["display"].push(global.display.connect('window-left-monitor', (display, oldMonitorIndex, windowObj) => {
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
            if (output[monitorIndex] !== null) {
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
