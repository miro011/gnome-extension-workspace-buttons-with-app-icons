// The purpose of this function is to make the processing of stuff more efficient (same loop processes mulitple elements, keeping track of window ids themselves insteaad of mapping them every time etc.)

import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Gio from "gi://Gio";

import Settings from "./settings.js";
import * as constants from "./constants.js";
import WorkspaceButtons from "./workspace-buttons.js";
import Topbars from "./topbars.js";

export default class Renderer {
    constructor(extSettingsRealTimeObj) {
        this.winIdsContRepr = []; // [m0[ws0[winId, winId], ws1[winId]], m1[...]....] - same structure as the ws buttons container
 
        this.extSettingsRealTimeObj = extSettingsRealTimeObj;
        this.extSettings = new Settings(extSettingsRealTimeObj, constants.extensionSettingsInfoObj);
        this.mutterSettingsRealTimeObj = new Gio.Settings({ schema: 'org.gnome.mutter' });
        this.mutterSettings = new Settings(this.mutterSettingsRealTimeObj, constants.mutterSettingsInfoObj);

        this.topbars = new Topbars();
        this.workspaceButtons = new WorkspaceButtons(this.extSettings, this.winIdsContRepr);

        this.numMonitors = null;
        this.wsOnlyOnPrimary = null;
        this.mainMonitorIndex = null;

        this.gnomeEventIdsObj = {"display": [], "workspace_manager": []};
        
        this._initial_population();
        this._enable_settings_events();
        this.layoutManagerEventId = Main.layoutManager.connect('monitors-changed', () => {
            this._initial_population();
        });
        this._enable_gnome_events();
    }

    destroy() {
        this.winIdsContRepr = null;

        this.extSettings.destroy();
        this.extSettings = null;
        this.extSettingsRealTimeObj = null;
        this.mutterSettings.destroy();
        this.mutterSettings = null;
        this.mutterSettingsRealTimeObj = null;

        this.topbars.destroy();
        this.topbars = null;
        this.workspaceButtons.destroy();
        this.workspaceButtons = null;

        this.numMonitors = null;
        this.wsOnlyOnPrimary = null;
        this.mainMonitorIndex = null;

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
        this._disable_workspace_added_events();
    }

    _reset() {
        this.winIdsContRepr = [];
        this.topbars.reset();
        this.workspaceButtons.reset();
        this._disable_workspace_added_events();
    }

    // for the workspaces that remain, we wanna clean up the window added event
    _disable_workspace_added_events() {
        for (let wsIndex=0; wsIndex<global.workspace_manager.get_n_workspaces(); wsIndex++) {
            let wsObj = global.workspace_manager.get_workspace_by_index(wsIndex);
            if (wsObj.hasOwnProperty("_windowAddedEventId")) {
                //log("ws with window added event found and removed");
                wsObj.disconnect(wsObj._windowAddedEventId);
                delete wsObj["_windowAddedEventId"]; // Completely remove property
            }
        }
    }

    //////////////////////////////////////

    _initial_population() {
        this._reset();
        this.numMonitors = global.display.get_n_monitors();
        this.wsOnlyOnPrimary = (this.mutterSettings.get("workspaces-only-on-primary") === true) ? true : false;
        this.mainMonitorIndex = Main.layoutManager.primaryMonitor.index;

        // Monitors and creation of base elements
        for (let monitorIndex = 0; monitorIndex < this.numMonitors; monitorIndex++) {
            this.topbars.add_topbar(monitorIndex);
            this.winIdsContRepr.push([]);
            let newWsBtnsContainer = this.workspaceButtons.add_container();
            this.topbars.append_workspace_buttons(monitorIndex, newWsBtnsContainer);
        }

        // Windows
        for (let wsIndex = 0; wsIndex < global.workspace_manager.get_n_workspaces(); wsIndex++) {
            let windowsPerMonitorArr = this._get_ws_windows_by_monitor(wsIndex); // [m1[id,id,id], m2[]] (wsIndex=x)

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
        let id;

        id = this.mutterSettingsRealTimeObj.connect('changed::workspaces-only-on-primary', () => {
            this._initial_population();
        });
        this.mutterSettings.add_event_id(id);

        id = this.mutterSettingsRealTimeObj.connect('changed::dynamic-workspaces', () => {
            this._initial_population();
        });
        this.mutterSettings.add_event_id(id);


        id = this.extSettingsRealTimeObj.connect('changed::wsb-button-spacing', () => {
            this.workspaceButtons.update_button_spacing();
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-show-workspace-number', () => {
            this.workspaceButtons.toggle_workspace_numbers();
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-number-font-size', () => {
            this.workspaceButtons.update_ws_num_number_font_size();
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-icon-size', () => {
            for (let wsIndex = 0; wsIndex < global.workspace_manager.get_n_workspaces(); wsIndex++) {
                let windowsPerMonitorArr = this._get_ws_windows_by_monitor(wsIndex);
                this.workspaceButtons.update_app_icon_size(wsIndex, windowsPerMonitorArr);
            }
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-icon-spacing', () => {
            this.workspaceButtons.update_app_icon_spacing();
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-active-button-background-color', () => {
            this.workspaceButtons.update_active_workspace();
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-inactive-button-background-color', () => {
            this.workspaceButtons.update_active_workspace();
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-active-workspace-number-background-color', () => {
            this.workspaceButtons.update_active_workspace();
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-inactive-workspace-number-background-color', () => {
            this.workspaceButtons.update_active_workspace();
        });
        this.extSettings.add_event_id(id);
    }

    _enable_gnome_events() {
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
        
        /*
        this.gnomeEventIdsObj["workspace_manager"].push(global.workspace_manager.connect("workspaces-reordered", () => {
            //
        }));*/

        this.gnomeEventIdsObj["display"].push(global.display.connect('window-created', (display, windowObj) => {
            //log(`New window with id ${windowObj.get_id()} created on workspace ${windowObj.get_workspace().index()} of monitor ${windowObj.get_monitor()}`);
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

        this.gnomeEventIdsObj["display"].push(global.display.connect('window-left-monitor', (display, oldMonitorIndex, windowObj) => {
            if (windowObj.get_window_type() !== Meta.WindowType.NORMAL) return;

            let winIdsMeta = this._get_winIdsMeta();
            
            let newMonitorIndex = windowObj.get_monitor(); // if window was closeed this returns -1
            let windowId = windowObj.get_id();
            let oldWsIndex = winIdsMeta[windowId]["wsIndex"];
            let oldWindowIndex = this.winIdsContRepr[oldMonitorIndex][oldWsIndex].indexOf(windowId);

            if (newMonitorIndex < 0) {
                // window closed
                //log("window closed");
                this.workspaceButtons.remove_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex);
                this.winIdsContRepr[oldMonitorIndex][oldWsIndex].splice(oldWindowIndex, 1);
            }
            else {
                // moved to another monitor
                //log("window moved to another monitor");
                let newWsIndex = (this.wsOnlyOnPrimary && newMonitorIndex !== this.mainMonitorIndex) ? 0 : oldWsIndex;
                let newWindowIndex = 0;
                this.workspaceButtons.move_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex, newMonitorIndex, newWsIndex, newWindowIndex);
                this.winIdsContRepr[oldMonitorIndex][oldWsIndex].splice(oldWindowIndex, 1);
                this.winIdsContRepr[newMonitorIndex][newWsIndex].unshift(windowId);
            }
        }));

        //global.workspace_manager.connect('workspaces-changed', () => {}) : fires whenever workspaces change including when windows are moved between them, which is what you will use it for exclusively

        this.gnomeEventIdsObj["display"].push(global.display.connect("notify::focus-window", () => {
            // we're only concenred about focus changes on the same monitor-workspace combo (this event triggers for other things too - when window is opened, or closd - or basically any time focus is changed)
            let newlyFocusedWindowObj = global.display.focus_window;
            if (!newlyFocusedWindowObj) return; // if last window is closed event will fire but there will be no focused window

            let winIdsMeta = this._get_winIdsMeta();
            
            let windowId = newlyFocusedWindowObj.get_id();
            if (winIdsMeta[windowId] === undefined) {
                return; // newly opened window
            }

            let monitorIndex = newlyFocusedWindowObj.get_monitor();
            let wsIndex = newlyFocusedWindowObj.get_workspace().index();
            if (this.wsOnlyOnPrimary && monitorIndex !== this.mainMonitorIndex) {
                wsIndex = 0;
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

    /*
    _add_monitor_changed_event_to_window(windowObj) {
        windowObj.connect('notify::monitor', () => {
            //
        });
    }
    */
}