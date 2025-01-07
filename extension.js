import St from "gi://St";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import Clutter from "gi://Clutter";

export default class WorkspaceIndicatorExtension extends Extension {
    enable() {
        Main.panel.statusArea['activities']?.hide();
        // Check if the date menu is in the center box
        if (Main.panel.statusArea.dateMenu) {
            let dateMenu = Main.panel.statusArea.dateMenu;
            // Remove from center box
            Main.panel._centerBox.remove_child(dateMenu.container);
            // Add to right box as the last element
            Main.panel._rightBox.add_child(dateMenu.container);
        }
    
        this.settings = this.getSettings();
        this.focusHistory = [];
        this.container = new St.BoxLayout({style_class: "extension-wrapper", vertical: false, reactive: true, track_hover: true});
        Main.panel._leftBox.insert_child_at_index(this.container, 0); // append

        this.container.connect("scroll-event", (actor, event) => {
            let scrollDirection = event.get_scroll_direction();
            let activeWsIndex = global.workspace_manager.get_active_workspace_index();

            if (scrollDirection === Clutter.ScrollDirection.UP && activeWsIndex > 0)
                global.workspace_manager.get_workspace_by_index(activeWsIndex - 1).activate(global.get_current_time());
            else if (scrollDirection === Clutter.ScrollDirection.DOWN && activeWsIndex < global.workspace_manager.get_n_workspaces() - 1)
                global.workspace_manager.get_workspace_by_index(activeWsIndex + 1).activate(global.get_current_time());
        });

        for (let wsIndex = 0; wsIndex < global.workspace_manager.get_n_workspaces(); wsIndex++) {
            this.add_empty_ws(wsIndex);
            let iconsWrapperElem = this.container.get_children()[wsIndex].get_children()[1];
            for (let windowObj of global.workspace_manager.get_workspace_by_index(wsIndex).list_windows()) {
                let newIconElem = this.get_new_icon_elem(windowObj);
                if (newIconElem !== null) {
                    this.focusHistory[wsIndex].push(windowObj.get_id());
                    iconsWrapperElem.add_child(newIconElem);
                }
            }
        }
        this.mark_active_workspace();
        
        this._workspaceRemovedId = global.workspace_manager.connect("workspace-added", (wm, index) => this.add_empty_ws(index));
        this._workspaceAddedId = global.workspace_manager.connect("workspace-removed", (wm, index) => this.rm_ws(index));
        this._workspaceChangedId = global.workspace_manager.connect("active-workspace-changed", () => this.mark_active_workspace()); // workspace change
        this._restackedId = global.display.connect("restacked", () => this.sync());
        this._focusChangedId = global.display.connect("notify::focus-window", () => {
            let newlyFocusedWindowObj = global.display.focus_window;
            if (newlyFocusedWindowObj) {
                let newlyFocusedWindowId = newlyFocusedWindowObj.get_id();
                let wsIndex = newlyFocusedWindowObj.get_workspace().index();
                if (this.focusHistory[wsIndex].includes(newlyFocusedWindowId))
                    this.move_existing_window_to_front(wsIndex, newlyFocusedWindowId);
            }
        });
        this._workspaceReordered = global.workspace_manager.connect("workspaces-reordered", () => this.reorder_wss());


        this._settingsAppIconChangedId = this.settings.connect('changed::app-icon-size', () => {
            for (let wsIndex = 0; wsIndex < global.workspace_manager.get_n_workspaces(); wsIndex++) {
                let actualWindowsArr = global.workspace_manager.get_workspace_by_index(wsIndex).list_windows();
                let iconsWrapperElem = this.container.get_children()[wsIndex].get_children()[1];
                
                for (let windowObj of actualWindowsArr) {
                    let matchedChildElem = iconsWrapperElem.get_children().find(childElem => childElem.windowId === windowObj.get_id());
                    
                    if (matchedChildElem) {
                        let newIconElem = this.get_new_icon_elem(windowObj);
                        if (newIconElem) {
                            iconsWrapperElem.replace_child(matchedChildElem, newIconElem); // Efficient replacement
                        }
                    }
                }
            }
        });

        this._settingsWorkspaceNumberFontSizeChangedId = this.settings.connect('changed::workspace-number-font-size', () => {
            for (let wsIndex = 0; wsIndex < global.workspace_manager.get_n_workspaces(); wsIndex++) {
                let wsNumWrapper = this.container.get_children()[wsIndex].get_children()[0];
                wsNumWrapper.get_children()[0].set_style(`font-size: ${this.settings.get_int("workspace-number-font-size")}px`);
            }
        });

        this._settingsActiveWorkspaceColorChangedId = this.settings.connect('changed::active-workspace-color', () => {
            this.mark_active_workspace();
        });
    }
    
    disable() {
        global.workspace_manager.disconnect(this._workspaceReordered);
        global.workspace_manager.disconnect(this._workspaceRemovedId);
        global.workspace_manager.disconnect(this._workspaceAddedId);
        global.workspace_manager.disconnect(this._workspaceChangedId);
        global.display.disconnect(this._restackedId);
        global.display.disconnect(this._focusChangedId);
        this.container.destroy();
        this.container = null;
        this.focusHistory = null;
        Main.panel.statusArea['activities']?.show();
        if (Main.panel.statusArea.dateMenu) {
            let dateMenu = Main.panel.statusArea.dateMenu;
            // Remove from right box
            Main.panel._rightBox.remove_child(dateMenu.container);
            // Add back to center box
            Main.panel._centerBox.insert_child_at_index(dateMenu.container, -1);
        }
    }

    //////////////////////////////////////////////////
    // HELPERS
    //////////////////////////////////////////////////

    sync() {
        for (let wsIndex = 0; wsIndex < global.workspace_manager.get_n_workspaces(); wsIndex++) {
            // The focus history and container are guranteed to be in the same order and have the exact same windows before the sync
    
            let iconsWrapperElem = this.container.get_children()[wsIndex].get_children()[1];
            let actualWindowsArr = global.workspace_manager.get_workspace_by_index(wsIndex).list_windows();
    
            // Creates sets for faster comparisons (the focusHistoryWindowsIdsSet is only used for comparing when adding new windows, so it's no problem being set in stone)
            let actualWindowIdsSet = new Set(actualWindowsArr.map(win => win.get_id()));
            let focusHistoryWindowsIdsSet = new Set(this.focusHistory[wsIndex]);
    
            let newFocusHistoryArrForWs = []; // here we will store the new processed array for focus history and swap it with the current one at the end
    
            // Remove invalid windows (going in reverse so that we can remove stuff from the container (otherwise indexes will change and become different from focus history if we start from the front))
            for (let i=this.focusHistory[wsIndex].length-1; i>=0; i--) {
                // most recent window in this.focusHistory[wsIndex] is at the front, so we need unshift() when going in reverse to preserve
                if (actualWindowIdsSet.has(this.focusHistory[wsIndex][i]))
                    newFocusHistoryArrForWs.unshift(this.focusHistory[wsIndex][i]);
                else
                    iconsWrapperElem.remove_child(iconsWrapperElem.get_children()[i]);
            }
    
            // add new windows
            for (let windowObj of actualWindowsArr) {
                let windowId = windowObj.get_id();
                if (!focusHistoryWindowsIdsSet.has(windowId)) {
                    let newIconElem = this.get_new_icon_elem(windowObj);
                    if (newIconElem !== null) {
                        newFocusHistoryArrForWs.unshift(windowId);
                        iconsWrapperElem.insert_child_at_index(newIconElem, 0);
                    }
                }
            }
    
            this.focusHistory[wsIndex] = newFocusHistoryArrForWs;
        }
    }

    add_empty_ws(wsIndex) {
        this.focusHistory.push([]);
    
        let singleWsWrapperElem = new St.BoxLayout({ style_class: "single-ws-wrapper", reactive: true });
        singleWsWrapperElem.wsIndex = wsIndex; // property for each access to handle events and such
    
        // Workspace number (visual)
        let wsNumWrapper = new St.BoxLayout({ style_class: "ws-num-wrapper" });
        wsNumWrapper.add_child(new St.Label({ text: `${wsIndex + 1}`, style_class: "ws-num", y_align: Clutter.ActorAlign.CENTER }));
        wsNumWrapper.set_style(`background-color:#5a5a5a;`);
        wsNumWrapper.get_children()[0].set_style(`font-size: ${this.settings.get_int("workspace-number-font-size")}px`);
        singleWsWrapperElem.add_child(wsNumWrapper);
    
        let iconsWrapper = new St.BoxLayout({ style_class: "ws-icons-wrapper" });
        singleWsWrapperElem.add_child(iconsWrapper);
    
        // Append
        this.container.add_child(singleWsWrapperElem);
    
        // Click event
        singleWsWrapperElem.connect("button-press-event", (actor, event) => {
            let btnPressed = event.get_button();
    
            if (btnPressed === Clutter.BUTTON_PRIMARY) {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
            }
            else if (btnPressed === Clutter.BUTTON_SECONDARY) {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
    
                if (this.focusHistory[actor.wsIndex].length > 0) {
                    let windowSwitcher = new AltTab.WindowSwitcherPopup();
                    windowSwitcher._resetNoModsTimeout = () => {}; // Disable the timeout
    
                    // Override the destroy method to handle manual closure
                    let originalDestroy = windowSwitcher.destroy.bind(windowSwitcher);
                    windowSwitcher.destroy = () => {
                        // Get the currently highlighted window
                        if (windowSwitcher._items[windowSwitcher._selectedIndex]) {
                            let selectedWindow = windowSwitcher._items[windowSwitcher._selectedIndex].window;
                            selectedWindow.get_compositor_private().grab_key_focus(); // this must be run - otherwise the keyboard focus remains on the previous window and things get screwed up
                            selectedWindow.activate(global.get_current_time());
                        }
    
                        // Call the original destroy
                        originalDestroy();
                    };
    
                    windowSwitcher.show(0, 0, 0);
                }
            }
            else if (btnPressed === Clutter.BUTTON_MIDDLE) {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
                Main.overview.toggle();
            }
        });
    
        return singleWsWrapperElem;
    }
    
    rm_ws(wsIndex) {
        this.focusHistory.splice(wsIndex, 1);
    
        this.container.remove_child(this.container.get_children()[wsIndex]);
        // Update wsIndex and the publically displayed number on the other elements
        let containerWsElemsArr = this.container.get_children(); // have to call again because the above is won't be reflexted otherwise in the array
        for (let i = 0; i < containerWsElemsArr.length; i++) {
            containerWsElemsArr[i].wsIndex = i;
            let wsNumWrapper = containerWsElemsArr[i].get_children()[0];
            wsNumWrapper.get_children()[0].text = `${i + 1}`; // Get the label inside the wrapper
        }
        this.mark_active_workspace();
    }

    reorder_wss() {
        for (let wsIndex1 = 0; wsIndex1 < global.workspace_manager.get_n_workspaces(); wsIndex1++) {
            let actualWindowIdsSet = new Set(global.workspace_manager.get_workspace_by_index(wsIndex1).list_windows().map(win => win.get_id()));
            let focusHistoryIdsSet1 = new Set(this.focusHistory[wsIndex1]);
    
            if (!this.are_equal_sets(actualWindowIdsSet, focusHistoryIdsSet1)) {
                for (let wsIndex2 = wsIndex1 + 1; wsIndex2 < global.workspace_manager.get_n_workspaces(); wsIndex2++) {
                    let focusHistoryIdsSet2 = new Set(this.focusHistory[wsIndex2]);
    
                    if (this.are_equal_sets(actualWindowIdsSet, focusHistoryIdsSet2)) {
                        // Swap focusHistory
                        [this.focusHistory[wsIndex1], this.focusHistory[wsIndex2]] = [this.focusHistory[wsIndex2], this.focusHistory[wsIndex1]];
    
                        // Update UI container children
                        let containerChildren = this.container.get_children();
                        [containerChildren[wsIndex1].wsIndex, containerChildren[wsIndex2].wsIndex] = [wsIndex2, wsIndex1];
    
                        // Swap displayed workspace numbers
                        containerChildren[wsIndex1].get_children()[0].get_children()[0].text = `${wsIndex2 + 1}`;
                        containerChildren[wsIndex2].get_children()[0].get_children()[0].text = `${wsIndex1 + 1}`;
    
                        // Reorder containers
                        this.container.remove_child(containerChildren[wsIndex1]);
                        this.container.insert_child_at_index(containerChildren[wsIndex1], wsIndex2);
    
                        break; // Exit inner loop after swap
                    }
                }
            }
        }
    
        // Highlight active workspace
        this.mark_active_workspace();
    }   
    
    move_existing_window_to_front(wsIndex, windowId) {
        let index = this.focusHistory[wsIndex].indexOf(windowId);
        if (index == 0) return; // no need to move if already at the front
    
        this.focusHistory[wsIndex].splice(index, 1);
        this.focusHistory[wsIndex].unshift(windowId);
    
        let iconsWrapperElem = this.container.get_children()[wsIndex].get_children()[1];
        let elemToMove = iconsWrapperElem.get_children()[index];
        iconsWrapperElem.remove_child(elemToMove);
        iconsWrapperElem.insert_child_at_index(elemToMove, 0); // Move to position 1
    }

    mark_active_workspace() {
        for (let wsElem of this.container.get_children()) {
            wsElem.get_children()[0].set_style(`background-color:#5a5a5a;`);
        }
    
        // Apply user-defined color to the active workspace
        this.container.get_children()[global.workspace_manager.get_active_workspace_index()].get_children()[0].set_style(`background-color: ${this.settings.get_string('active-workspace-color')};`);
    }

    get_new_icon_elem(windowObj) {
        if (windowObj.get_window_type() !== Meta.WindowType.NORMAL)
            return null;
        
        let appObj = Shell.WindowTracker.get_default().get_window_app(windowObj);
        if (appObj) {
            let appIconWrapperElem = new St.BoxLayout({ style_class: "app-icon-wrapper" });
            appIconWrapperElem.windowId = windowObj.get_id();
            appIconWrapperElem.add_child(appObj.create_icon_texture(this.settings.get_int('app-icon-size')));
            return appIconWrapperElem;
        }
        else {
            return null;
        }
    }

    are_equal_sets(setA, setB) {
        if (setA.size !== setB.size) return false;
        for (let elem of setA) {
            if (!setB.has(elem)) return false;
        }
        return true;
    }
}