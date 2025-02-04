// The purpose of this function is to make the processing of stuff more efficient (same loop processes mulitple elements, keeping track of window ids themselves insteaad of mapping them every time etc.)

import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Gio from "gi://Gio";
import GLib from "gi://GLib";


import Settings from "./settings.js";
import * as constants from "./constants.js";
import WorkspaceButtons from "./workspace-buttons.js";
import Topbars from "./topbars.js";

export default class Renderer {
    constructor(extSettingsRealTimeObj) {
        this.extSettingsRealTimeObj = extSettingsRealTimeObj;
        this._init();
    }

    _init() {
        this.winIdsContRepr = []; // [m0[ws0[winId, winId], ws1[winId]], m1[...]....] - same structure as the ws buttons container
        this.extSettings = new Settings(this.extSettingsRealTimeObj, constants.extensionSettingsInfoObj);
        this.mutterSettingsRealTimeObj = new Gio.Settings({ schema: 'org.gnome.mutter' });
        this.mutterSettings = new Settings(this.mutterSettingsRealTimeObj, constants.mutterSettingsInfoObj);

        this.topbars = new Topbars();
        this.workspaceButtons = new WorkspaceButtons(this.extSettingsRealTimeObj, this.extSettings, this.winIdsContRepr);

        this.numMonitors = global.display.get_n_monitors();
        this.wsOnlyOnPrimary = (this.mutterSettings.get("workspaces-only-on-primary") === true) ? true : false;
        this.mainMonitorIndex = Main.layoutManager.primaryMonitor.index;

        //log(`numMonitors=${this.numMonitors}\nwsOnlyOnPrimary=${this.wsOnlyOnPrimary}\nmainMonitorIndex=${this.mainMonitorIndex}`);

        this.gnomeEventIdsObj = {"display": [], "workspace_manager": []};
        // holds the monitors changed event - which is crucial - whenever monitors change we need to reset and re-populate
        // as operations below rely on the hardcoded monitor config established during population
        this.layoutManagerEventId;
        
        this._initial_population();
        this._enable_settings_events();
        this._enable_gnome_events();
    }

    destroy(full=true) {
        this.extSettings.destroy();
        this.extSettings = null;
        if (full===true) this.extSettingsRealTimeObj = null;
        this.mutterSettings.destroy();
        this.mutterSettings = null;
        this.mutterSettingsRealTimeObj = null;

        this.topbars.destroy();
        this.topbars = null;
        this.workspaceButtons.destroy();
        this.workspaceButtons = null;

        Main.layoutManager.disconnect(this.layoutManagerEventId);
        this.layoutManagerEventId = null;
        for (let component in this.gnomeEventIdsObj) {
            let componentObj = global[component];
            let eventIdsArr = this.gnomeEventIdsObj[component];
            for (let eventId of eventIdsArr) {
                componentObj.disconnect(eventId);
            }
        }
        this.gnomeEventIdsObj = null;
        
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
        this.wsOnlyOnPrimary = null;
        Main.layoutManager.primaryMonitor = Main.layoutManager.monitors[this.mainMonitorIndex];
        this.mainMonitorIndex = null;
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
    }

    _enable_settings_events() {
        // just like monitors changed, there are hardcoded values, established during intial population that rely on workspaces-only-on-primary and dynamic workspaces
        // not only that but the way the processing in this class works is one step at a time - for ex:
        // if we don't reload when dynamic workspaces is toggled, all of a sudden you have potentially multiple new workspaces and everything will be way off
        let id;

        id = this.mutterSettingsRealTimeObj.connect('changed::workspaces-only-on-primary', () => {
            this.destroy(false);
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._init();
                return GLib.SOURCE_REMOVE; // Ensures it only runs once
            });
        });
        this.mutterSettings.add_event_id(id);

        id = this.mutterSettingsRealTimeObj.connect('changed::dynamic-workspaces', () => {
            this.destroy(false);
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._init();
                return GLib.SOURCE_REMOVE; // Ensures it only runs once
            });
        });
        this.mutterSettings.add_event_id(id);
    }

    _enable_gnome_events() {
        this.layoutManagerEventId = Main.layoutManager.connect('monitors-changed', () => {
            this.destroy(false);
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._init();
                return GLib.SOURCE_REMOVE; // Ensures it only runs once
            });
        });

        this.gnomeEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("active-workspace-changed", () => {
            this.workspaceButtons.update_active_workspace();
        }));

        this.gnomeEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("workspace-added", (wm, wsIndex) => {
            //log("ws added");
            // if workspaces is only on primary, it can only be added to the main monitor, otherwise, all monitors
            if (this.wsOnlyOnPrimary) {
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

        this.gnomeEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("workspace-removed", (wm, wsIndex) => {
            //log("ws removed");
            if (this.wsOnlyOnPrimary) {
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
        
        this.gnomeEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("workspaces-reordered", () => {
            //log("workspaces-reordered");
            //this._debug_log_structures();
            // Whether a workspace is moved left or moved right, we go left to right
            // Going left to right, it doesn't matter is ws4 was moved left to become ws3 or ws3 was moved right to become ws4 - it's equivalent
            // The goal here is to find the first workspace where the current windows don't match the ones in this.winIdsContRepr for that workspace
            // and then find which workspace in this.winIdsContRepr matches them - that's how you know what got moved where
            let numWss = global.workspace_manager.get_n_workspaces();
            for (let wsIndex1=0; wsIndex1<numWss; wsIndex1++) {
                let windowsPerMonitorArrWsIndex1 = this._get_ws_windows_by_monitor(wsIndex1);

                let firstNeMonitorIndex = null;
                let firstWindowIdToLookFor = null;
                let firstWindowIdToLookForType; // cur or old - we need this to accomodate swaps between a workspace with windows and one without any

                // find the first instance of an inquality
                if (this.wsOnlyOnPrimary) {
                    // here we only care about changes on the primary monitor
                    let firstOldWindowId = this.winIdsContRepr[this.mainMonitorIndex][wsIndex1][0];
                    let firstNewWindowObject = windowsPerMonitorArrWsIndex1[this.mainMonitorIndex][0];
                    let firstNewWindowId = (firstNewWindowObject !== undefined) ? firstNewWindowObject.get_id() : undefined;
                    if (firstNewWindowId !== firstOldWindowId) {
                        firstNeMonitorIndex = this.mainMonitorIndex;
                        if (firstNewWindowId === undefined) {
                            firstWindowIdToLookFor = firstOldWindowId;
                            firstWindowIdToLookForType = "old";
                        }
                        else {
                            firstWindowIdToLookFor = firstNewWindowId;
                            firstWindowIdToLookForType = "cur";
                        }
                    }
                }
                else {
                    for (let monitorIndex=0; monitorIndex<this.numMonitors; monitorIndex++) {
                        let firstOldWindowId = this.winIdsContRepr[monitorIndex][wsIndex1][0];
                        let firstNewWindowObject = windowsPerMonitorArrWsIndex1[monitorIndex][0];
                        let firstNewWindowId = (firstNewWindowObject !== undefined) ? firstNewWindowObject.get_id() : undefined;
                        // if we detect any imbalance on any monitor for this workspace, than this is where 
                        if (firstNewWindowId !== firstOldWindowId) {
                            firstNeMonitorIndex = monitorIndex;
                            if (firstNewWindowId === undefined) {
                                firstWindowIdToLookFor = firstOldWindowId;
                                firstWindowIdToLookForType = "old";
                            }
                            else {
                                firstWindowIdToLookFor = firstNewWindowId;
                                firstWindowIdToLookForType = "cur";
                            }
                            break;
                        }
                    }
                }

                // fix it
                if (firstNeMonitorIndex !== null && wsIndex1+1 < numWss) {
                    //log(`First inquality found:\nwsIndex1=${wsIndex1}\nfirstNeMonitorIndex=${firstNeMonitorIndex}\nfirstWindowIdToLookFor=${firstWindowIdToLookFor}\nfirstWindowIdToLookForType=${firstWindowIdToLookForType}`);
                    for (let wsIndex2=wsIndex1+1; wsIndex2<numWss; wsIndex2++) {
                        //log(`Loop workspace wsIndex2=${wsIndex2}`);
                        // once we find a match it means that wsIndex1 and wsIndex2 were swapped
                        if (firstWindowIdToLookForType === "cur") {
                            let firstOldWindowId = this.winIdsContRepr[firstNeMonitorIndex][wsIndex2][0];
                            //log(`firstOldWindowId=${firstOldWindowId}`);
                            if (firstOldWindowId === firstWindowIdToLookFor) {
                                // DO
                                if (this.wsOnlyOnPrimary) {
                                    [this.winIdsContRepr[firstNeMonitorIndex][wsIndex1], this.winIdsContRepr[firstNeMonitorIndex][wsIndex2]] = [this.winIdsContRepr[firstNeMonitorIndex][wsIndex2], this.winIdsContRepr[firstNeMonitorIndex][wsIndex1]];
                                    this.workspaceButtons.swap_ws_btns(firstNeMonitorIndex, wsIndex1, wsIndex2);
                                }
                                else {
                                    for (let monitorIndex=0; monitorIndex<this.numMonitors; monitorIndex++) {
                                        [this.winIdsContRepr[monitorIndex][wsIndex1], this.winIdsContRepr[monitorIndex][wsIndex2]] = [this.winIdsContRepr[monitorIndex][wsIndex2], this.winIdsContRepr[monitorIndex][wsIndex1]];
                                        this.workspaceButtons.swap_ws_btns(monitorIndex, wsIndex1, wsIndex2);
                                    }
                                }
                                break;
                            }
                        }
                        else {
                            let windowsPerMonitorArrWsIndex2 = this._get_ws_windows_by_monitor(wsIndex2);
                            let firstNewWindowObject = windowsPerMonitorArrWsIndex2[firstNeMonitorIndex][0];
                            let firstNewWindowId = (firstNewWindowObject !== undefined) ? firstNewWindowObject.get_id() : undefined;
                            //log(`firstNewWindowId=${firstNewWindowId}`);
                            if (firstNewWindowId === firstWindowIdToLookFor) {
                                // DO
                                if (this.wsOnlyOnPrimary) {
                                    [this.winIdsContRepr[firstNeMonitorIndex][wsIndex1], this.winIdsContRepr[firstNeMonitorIndex][wsIndex2]] = [this.winIdsContRepr[firstNeMonitorIndex][wsIndex2], this.winIdsContRepr[firstNeMonitorIndex][wsIndex1]];
                                    this.workspaceButtons.swap_ws_btns(firstNeMonitorIndex, wsIndex1, wsIndex2);
                                }
                                else {
                                    for (let monitorIndex=0; monitorIndex<this.numMonitors; monitorIndex++) {
                                        [this.winIdsContRepr[monitorIndex][wsIndex1], this.winIdsContRepr[monitorIndex][wsIndex2]] = [this.winIdsContRepr[monitorIndex][wsIndex2], this.winIdsContRepr[monitorIndex][wsIndex1]];
                                        this.workspaceButtons.swap_ws_btns(monitorIndex, wsIndex1, wsIndex2);
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
            //this._debug_log_structures();
        }));

        this.gnomeEventIdsObj["display"].push(global.display.connect('window-created', (display, windowObj) => {
            if (windowObj.get_window_type() !== Meta.WindowType.NORMAL) return;
            //log("window created");

            let windowId = windowObj.get_id();
            let monitorIndex = windowObj.get_monitor();
            let wsIndex = windowObj.get_workspace().index();
            if (this.wsOnlyOnPrimary && monitorIndex !== this.mainMonitorIndex) {
                wsIndex = 0;
            }

            this.winIdsContRepr[monitorIndex][wsIndex].unshift(windowId);
            this.workspaceButtons.add_window_icon("l", windowObj, monitorIndex, wsIndex);
        }));

        // a window leaves a monitor if it's a/ closed or b/ moved to another monitor
        // when moved to another monitor, it is possible to also be moved to another workspace, but we don't care about that - we just move it to the monitor
        // the window added to workspace event is seperate and triggers seperate which then moves it to the right workspace if the window did in fact move to another workspace
        this.gnomeEventIdsObj["display"].push(global.display.connect('window-left-monitor', (display, oldMonitorIndex, windowObj) => {
            if (windowObj.get_window_type() !== Meta.WindowType.NORMAL) return;

            let winIdsMeta = this._get_winIdsMeta();
            
            let newMonitorIndex = windowObj.get_monitor(); // if window was closeed this returns -1
            let windowId = windowObj.get_id();
            let oldWsIndex = winIdsMeta[windowId]["wsIndex"];
            let oldWindowIndex = this.winIdsContRepr[oldMonitorIndex][oldWsIndex].indexOf(windowId);

            if (newMonitorIndex < 0) {
                //log("window closed");
                this.workspaceButtons.remove_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex);
                this.winIdsContRepr[oldMonitorIndex][oldWsIndex].splice(oldWindowIndex, 1);
            }
            else {
                //log("window moved to another monitor");
                let newWsIndex = (this.wsOnlyOnPrimary && newMonitorIndex !== this.mainMonitorIndex) ? 0 : oldWsIndex;
                let newWindowIndex = 0;
                this.workspaceButtons.move_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex, newMonitorIndex, newWsIndex, newWindowIndex);
                this.winIdsContRepr[oldMonitorIndex][oldWsIndex].splice(oldWindowIndex, 1);
                this.winIdsContRepr[newMonitorIndex][newWsIndex].unshift(windowId);
            }
        }));
        

        // here, we're only concenred about focus changes on existing windows on the same monitor-workspace combo
        // (this event triggers for other things too - when window is opened, or closed - or basically any time focus is changed - all of which is handled exclusively)
        this.gnomeEventIdsObj["display"].push(global.display.connect("notify::focus-window", () => {
            let newlyFocusedWindowObj = global.display.focus_window;
            //== Meta.WindowType.NORMAL
            if (!newlyFocusedWindowObj) return; // if last window in a workspace (empty workspace) is closed event will fire but there will be no focused window

            let monitorIndex = newlyFocusedWindowObj.get_monitor();
            // this is the only way I found to display AltTab in the current monitor - overriding primaryMonitor
            // this is what behind the scenes functions for AltTab and the methods it extends use
            // I tried overriding the methods but it doesn't work because they're called directly by Clutter (I think it was in C) but this right here is how they decide which monitor to show AltTab on
            Main.layoutManager.primaryMonitor = Main.layoutManager.monitors[monitorIndex];
            let wsIndex = newlyFocusedWindowObj.get_workspace().index();
            if (this.wsOnlyOnPrimary && monitorIndex !== this.mainMonitorIndex) {
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
            if (this.wsOnlyOnPrimary && monitorIndex !== this.mainMonitorIndex && wsIndex > 0) {
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

    // there is also a window-removed event but I don't care about it becaues I'm keeping my own accurate (at least should be) history
    _add_window_added_event_to_workspace(wsIndex) {
        let workspaceObject = global.workspace_manager.get_workspace_by_index(wsIndex);
        workspaceObject._windowAddedEventId = workspaceObject.connect('window-added', (workspaceObj, windowObj) => {
            //log(`Window ${windowObj.get_title()} was added to workspace ${workspaceObj.index()}`);
            // windows moved to another monitor always go to the front of the tab list (most recently focused)
            let winIdsMeta = this._get_winIdsMeta();

            let windowId = windowObj.get_id();
            if (winIdsMeta[windowId] === undefined) return; // new window opened - handled and properly placed by another event

            let monitorIndex = winIdsMeta[windowId]["monitorIndex"];
            let oldWsIndex = winIdsMeta[windowId]["wsIndex"];
            let newWsIndex = workspaceObj.index();
            let oldWindowIndex = this.winIdsContRepr[monitorIndex][oldWsIndex].indexOf(windowId);

            this.workspaceButtons.move_window_icon(monitorIndex, oldWsIndex, oldWindowIndex, monitorIndex, newWsIndex, 0);
            this.winIdsContRepr[monitorIndex][oldWsIndex].splice(oldWindowIndex, 1);
            this.winIdsContRepr[monitorIndex][newWsIndex].unshift(windowId);
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