import Meta from "gi://Meta";
import St from "gi://St";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";

// this.rendererInst

export default class WorkspaceButtons {
    //////////////////////////////////////
    // INIT / RESET / DESTROY

    constructor(rendererInst) {
        this.rendererInst = rendererInst;
        this._init();
    }

    _init() {
        this.containersArr = [];
        this.glibTimeoutIdsSet = new Set();
        this._enable_settings_events();
    }

    destroy() {
        this.containersArr.forEach(container => {
            container.destroy();
        });
        for (let timeoutId of this.glibTimeoutIdsSet) {
            GLib.Source.remove(timeoutId);
        }
        this.glibTimeoutIdsSet.clear();
        this.glibTimeoutIdsSet = null;

        this.rendererInst = null;
        
        this.containersArr = null;
    }

    //////////////////////////////////////
    // CONTAINER
    
    add_container() {
        let containerElem = new St.BoxLayout({style_class: "wsb-container-wrapper", vertical: false, reactive: true, track_hover: true});
        this.containersArr.push(containerElem);

        containerElem.connect("scroll-event", (actor, event) => {
            if (!this.rendererInst.extSettings.get("wsb-container-scroll-to-switch-workspace")) {
                return;
            }
            let scrollDirection = event.get_scroll_direction();
            let activeWsIndex = global.workspace_manager.get_active_workspace_index();

            if (scrollDirection === Clutter.ScrollDirection.UP && activeWsIndex > 0)
                global.workspace_manager.get_workspace_by_index(activeWsIndex - 1).activate(global.get_current_time());
            else if (scrollDirection === Clutter.ScrollDirection.DOWN && activeWsIndex < global.workspace_manager.get_n_workspaces() - 1)
                global.workspace_manager.get_workspace_by_index(activeWsIndex + 1).activate(global.get_current_time());
        });

        containerElem.connect("button-press-event", (actor, event) => {
            let monitorIndex = global.display.get_current_monitor();
            Main.layoutManager.primaryMonitor = Main.layoutManager.monitors[monitorIndex];

            let btnPressed = event.get_button();
        
            if (btnPressed === Clutter.BUTTON_SECONDARY && this.rendererInst.extSettings.get("wsb-right-click-ignores-clicked-workspace")) {
                /*let activeWsIndex = global.workspace_manager.get_active_workspace_index();
                if (this.rendererInst.winIdsContRepr[actor.monitorIndex][activeWsIndex].length > 1) {
                    this._show_custom_right_click_window_switcher();
                }*/
                this._show_custom_right_click_window_switcher();
            }
            else if (btnPressed === Clutter.BUTTON_MIDDLE && this.rendererInst.extSettings.get("wsb-middle-click-ignores-clicked-workspace")) {
                Main.overview.toggle();
            }
        });

        return containerElem;
    }

    //////////////////////////////////////
    // WORKSPACE BUTTON

    add_ws_btn(monitorIndex, wsIndex) {
        let showWsNum = this.rendererInst.extSettings.get("wsb-ws-num-show");

        let btnWrapperElem = new St.BoxLayout({ style_class: "wsb-ws-btn-wrapper", reactive: true });
        btnWrapperElem.wsIndex = wsIndex;
        btnWrapperElem.monitorIndex = monitorIndex;

        let wsNumWrapper = new St.BoxLayout({ style_class: "wsb-ws-num-wrapper" });
        let wsNum = new St.Label({ text: `${wsIndex + 1}`, style_class: "wsb-ws-num-label-elem", y_align: Clutter.ActorAlign.CENTER });
        wsNumWrapper.add_child(wsNum);
        btnWrapperElem.add_child(wsNumWrapper);
        if (!showWsNum) wsNumWrapper.hide();

        let iconsWrapper = new St.BoxLayout({ style_class: "wsb-icons-wrapper" });
        if (showWsNum) iconsWrapper.add_style_class_name("wsb-icons-wrapper-with-ws-nums");
        else iconsWrapper.add_style_class_name("wsb-icons-wrapper-full-ws-btn-width");
        btnWrapperElem.add_child(iconsWrapper);
        
        this.containersArr[monitorIndex].insert_child_at_index(btnWrapperElem, wsIndex);

        this._update_ws_numbers(monitorIndex);

        // event
        btnWrapperElem.connect("button-press-event", (actor, event) => {
            let btnPressed = event.get_button();
    
            if (btnPressed === Clutter.BUTTON_PRIMARY) {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
            }
            else if (btnPressed === Clutter.BUTTON_SECONDARY && !this.rendererInst.extSettings.get("wsb-right-click-ignores-clicked-workspace")) {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
    
                /*if (this.rendererInst.winIdsContRepr[actor.monitorIndex][actor.wsIndex].length > 1) {
                    this._show_custom_right_click_window_switcher();
                }*/
                this._show_custom_right_click_window_switcher();
            }
            else if (btnPressed === Clutter.BUTTON_MIDDLE && !this.rendererInst.extSettings.get("wsb-middle-click-ignores-clicked-workspace")) {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
                Main.overview.toggle();
            }
        });

        return btnWrapperElem;
    }

    rm_ws_btn(monitorIndex, wsIndex) {
        let containerElem = this.containersArr[monitorIndex];
        containerElem.remove_child(containerElem.get_children()[wsIndex]);
        this._update_ws_numbers(monitorIndex);
    }

    swap_ws_btns(monitorIndex, wsIndex1, wsIndex2) {
        let containerElem = this.containersArr[monitorIndex];
        let children = containerElem.get_children();
        let btn1 = children[wsIndex1];
        let btn2 = children[wsIndex2];
        let placeHolder1 = new Clutter.Actor();
        let placeHolder2 = new Clutter.Actor();

        containerElem.replace_child(btn1, placeHolder1);
        containerElem.replace_child(btn2, placeHolder2);

        containerElem.replace_child(placeHolder1, btn2);
        containerElem.replace_child(placeHolder2, btn1);

        this._update_ws_numbers(monitorIndex);
        this.update_active_workspace();
    }

    //////////////////////////////////////
    // WINDOW ICONS

    add_window_icon(loc, windowObj, monitorIndex, wsIndex) {
        let windowIconWrapperElem = this._get_new_window_icon(windowObj);
        let iconsWrapper = this.containersArr[monitorIndex].get_children()[wsIndex].get_children()[1];
        if (loc == "l") iconsWrapper.insert_child_at_index(windowIconWrapperElem, 0);
        else if (loc == "r") iconsWrapper.add_child(windowIconWrapperElem);
    }

    move_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex, newMonitorIndex, newWsIndex, newWindowIndex) {
        let oldParent = this.containersArr[oldMonitorIndex].get_children()[oldWsIndex].get_children()[1];
        let elemToMove = oldParent.get_children()[oldWindowIndex];
        oldParent.remove_child(elemToMove);
        let newParent = this.containersArr[newMonitorIndex].get_children()[newWsIndex].get_children()[1];
        newParent.insert_child_at_index(elemToMove, newWindowIndex);

        if (this.rendererInst.extSettings.get("wsb-ws-num-show") === false && newMonitorIndex === this.rendererInst.mainMonitorIndex && newParent.get_children().length === 1) {
            // to fix a weird glitch, where when workspace numbers are hidden and window is moved from a non-main monitor to the main one
            // and the workspace on the main one is empty before that, the icon doesn't show up until the next event or hover
            newParent.queue_redraw();
        }
    }

    remove_window_icon(monitorIndex, wsIndex, windowIndex) {
        let iconsWrapper = this.containersArr[monitorIndex].get_children()[wsIndex].get_children()[1];
        let elemToRemove = iconsWrapper.get_children()[windowIndex];
        iconsWrapper.remove_child(elemToRemove);
    }

    _get_new_window_icon(windowObj) {
        let windowIconWrapperElem = new St.BoxLayout({ style_class: "wsb-single-icon-wrapper" });
        windowIconWrapperElem.windowId = windowObj.get_id();
    
        // Add a small delay to allow time for the app's icon to load properly, especially for XWayland (GTK3) apps
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.rendererInst.extSettings.get("wsb-generate-window-icon-timeout"), () => {
            let appObj = Shell.WindowTracker.get_default().get_window_app(windowObj);
    
            // If the appObj is valid, add the icon texture
            if (appObj) {
                let appIcon = appObj.create_icon_texture(this.rendererInst.extSettings.get('wsb-ws-app-icon-size'));
                if (this.rendererInst.extSettings.get("wsb-ws-app-icons-desaturate")) {
                    appIcon.add_effect(new Clutter.DesaturateEffect());
                }
                windowIconWrapperElem.add_child(appIcon);
            } else {
                // Fallback icon if the appObj is not found
                let placeholderIcon = new St.Icon({ icon_name: 'image-missing-symbolic', icon_size: this.rendererInst.extSettings.get('wsb-ws-app-icon-size') });
                windowIconWrapperElem.add_child(placeholderIcon);
            }

            this.glibTimeoutIdsSet.delete(timeoutId);
            return GLib.SOURCE_REMOVE;
        });

        this.glibTimeoutIdsSet.add(timeoutId);
    
        return windowIconWrapperElem;
    }
    
    _regenerate_icons() {
        let allWindowsObjects = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        let windowsMap = {}; // windowId: windowObj for quick lookups
        allWindowsObjects.forEach(windowObj => {
            windowsMap[windowObj.get_id()] = windowObj;
        });

        for (let container of this.containersArr) {
            for (let wsBtnElem of container.get_children()) {
                let iconsWrapper = wsBtnElem.get_children()[1];

                let iconsWrapperChildren = iconsWrapper.get_children();
                for (let i=0; i<iconsWrapperChildren.length; i++) {
                    let windowId = iconsWrapperChildren[i].windowId;
                    iconsWrapper.replace_child(iconsWrapperChildren[i], this._get_new_window_icon(windowsMap[windowId]));
                }
            }
        }
    }

    //////////////////////////////////////
    // WORKSPACE NUMBERS

    _update_ws_numbers(monitorIndex) {
        let containerChildrenArr = this.containersArr[monitorIndex].get_children();
        for (let i=0; i<containerChildrenArr.length; i++) {
            containerChildrenArr[i].wsIndex = i;
            containerChildrenArr[i].get_children()[0].get_children()[0].text = `${i + 1}`;
        }
    }

    //////////////////////////////////////
    // EVENT HANDLERS

    update_active_workspace() {
        const set_active_style = (monitorIndex, wsIndex) => {
            let wsBtnElem = this.containersArr[monitorIndex].get_children()[wsIndex];
            let children = wsBtnElem.get_children();
            children[0].add_style_class_name("wsb-ws-num-wrapper-active");
            children[1].add_style_class_name("wsb-icons-wrapper-active");
        };

        for (let monitorIndex=0; monitorIndex<this.containersArr.length; monitorIndex++) {
            // remove the active class from all
            for (let wsBtnElem of this.containersArr[monitorIndex].get_children()) {
                let children = wsBtnElem.get_children();
                children[0].remove_style_class_name("wsb-ws-num-wrapper-active");
                children[1].remove_style_class_name("wsb-icons-wrapper-active");
            }

            // apply user-defined style to the active workspace (with respect to workspaces only on primary)

            let curWsIndex = global.workspace_manager.get_active_workspace_index();

            if (this.rendererInst.wssOnlyOnPrimary === false) {
                set_active_style(monitorIndex, curWsIndex);
            }
            else {
                if (monitorIndex === this.rendererInst.mainMonitorIndex) {
                    set_active_style(monitorIndex, curWsIndex);
                }
                else {
                    set_active_style(monitorIndex, 0);
                }
            }
        }
    }

    _enable_settings_events() {
        let id;
    
        id = this.rendererInst.extensionInst.extSettingsRealTimeObj.connect('changed::wsb-ws-num-show', () => {
            let showWsNum = this.rendererInst.extSettings.get("wsb-ws-num-show");
    
            for (let containerElem of this.containersArr) {
                for (let wsBtnElem of containerElem.get_children()) {
                    let children = wsBtnElem.get_children();
                    if (showWsNum) {
                        children[0].show();
                        children[1].remove_style_class_name("wsb-icons-wrapper-full-ws-btn-width");
                        children[1].add_style_class_name("wsb-icons-wrapper-with-ws-nums");
                    }
                    else {
                        children[0].hide();
                        children[1].remove_style_class_name("wsb-icons-wrapper-with-ws-nums");
                        children[1].add_style_class_name("wsb-icons-wrapper-full-ws-btn-width");
                    }
                }
            }
        });
        this.rendererInst.extSettings.add_event_id(id);
    
        id = this.rendererInst.extensionInst.extSettingsRealTimeObj.connect('changed::wsb-ws-app-icon-size', () => {
            let iconSizeHalf = Math.floor(this.rendererInst.extSettings.get("wsb-ws-app-icon-size")/2);
            this.rendererInst.extensionInst.extSettingsRealTimeObj.set_int('wsb-ws-app-icon-size-half', iconSizeHalf);
            this._regenerate_icons();
        });
        this.rendererInst.extSettings.add_event_id(id);

        id = this.rendererInst.extensionInst.extSettingsRealTimeObj.connect('changed::wsb-ws-app-icons-desaturate', () => {
            this._regenerate_icons();
        });
        this.rendererInst.extSettings.add_event_id(id);

        id = this.rendererInst.extensionInst.extSettingsRealTimeObj.connect('changed::wsb-generate-window-icon-timeout', () => {
            this._regenerate_icons();
        });
        this.rendererInst.extSettings.add_event_id(id);
    }

    //////////////////////////////////////
    // OTHER

    debug_get_container_representation_array() {
        let output = [];

        for (let monitorIndex=0; monitorIndex<this.containersArr.length; monitorIndex++) {
            output.push([]);
            let wsBtnElemsArr = this.containersArr[monitorIndex].get_children();
            for (let wsIndex=0; wsIndex<wsBtnElemsArr.length; wsIndex++) {
                output[monitorIndex].push([]);
                let windowIconElemsArr = wsBtnElemsArr[wsIndex].get_children()[1].get_children();
                for (let windowIndex=0; windowIndex<windowIconElemsArr.length; windowIndex++) {
                    output[monitorIndex][wsIndex].push(windowIconElemsArr[windowIndex].windowId);
                }
            }
        }

        return output;
    }

    _show_custom_right_click_window_switcher() {
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