import Meta from "gi://Meta";
import St from "gi://St";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";


export default class WorkspaceButtons {
    //////////////////////////////////////
    // INIT / RESET / DESTROY

    constructor(extSettingsRealTimeObj, extSettings, winIdsContRepr, wssOnlyOnPrimary, mainMonitorIndex) {
        this.extSettingsRealTimeObj = extSettingsRealTimeObj;
        this.extSettings = extSettings;
        this.winIdsContRepr = winIdsContRepr;
        this.wssOnlyOnPrimary = wssOnlyOnPrimary;
        this.mainMonitorIndex = mainMonitorIndex;
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
        
        this.containersArr = null;
        this.extSettingsRealTimeObj = null;
        this.extSettings = null;
        this.winIdsContRepr = null;
        this.wssOnlyOnPrimary = null;
        this.mainMonitorIndex = null;
    }

    //////////////////////////////////////
    // CONTAINER
    
    add_container() {
        let containerElem = new St.BoxLayout({style_class: "workspace-buttons", vertical: false, reactive: true, track_hover: true});
        this.containersArr.push(containerElem);

        containerElem.connect("scroll-event", (actor, event) => {
            if (!this.extSettings.get("wsb-container-scroll-to-switch-workspace")) {
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
        
            if (btnPressed === Clutter.BUTTON_SECONDARY && this.extSettings.get("wsb-right-click-ignores-clicked-workspace")) {
                /*let activeWsIndex = global.workspace_manager.get_active_workspace_index();
                if (this.winIdsContRepr[actor.monitorIndex][activeWsIndex].length > 1) {
                    this._show_custom_right_click_window_switcher();
                }*/
                this._show_custom_right_click_window_switcher();
            }
            else if (btnPressed === Clutter.BUTTON_MIDDLE && this.extSettings.get("wsb-middle-click-ignores-clicked-workspace")) {
                Main.overview.toggle();
            }
        });

        return containerElem;
    }

    //////////////////////////////////////
    // WORKSPACE BUTTON

    add_ws_btn(monitorIndex, wsIndex) {
        let showWsNum = this.extSettings.get("wsb-show-workspace-number");
        let borderRadiusNum = this.extSettings.get("wsb-button-roundness");

        let btnWrapperElem = new St.BoxLayout({ style_class: "ws-button-wrapper", reactive: true });
        btnWrapperElem.wsIndex = wsIndex;
        btnWrapperElem.monitorIndex = monitorIndex;
        this._update_style(btnWrapperElem, `margin-right: ${this.extSettings.get("wsb-button-spacing")}px;`);
        this._update_style(btnWrapperElem, `padding: ${this.extSettings.get("wsb-button-padding")}px;`);

        let wsNumWrapper = new St.BoxLayout({ style_class: "ws-num-wrapper" });
        this._update_style(wsNumWrapper, `background-color: ${this.extSettings.get('wsb-inactive-workspace-number-background-color')};`);
        this._update_style(wsNumWrapper, `border-radius: ${borderRadiusNum}px 0 0 ${borderRadiusNum}px;`);
        let numWrapperPaddingNum = this.extSettings.get("wsb-number-horizontal-padding");
        this._update_style(wsNumWrapper, `padding: 0 ${numWrapperPaddingNum}px 0 ${numWrapperPaddingNum}px;`);
        let wsNum = new St.Label({ text: `${wsIndex + 1}`, style_class: "ws-num", y_align: Clutter.ActorAlign.CENTER });
        this._update_style(wsNum, `font-size: ${this.extSettings.get("wsb-number-font-size")}px;`);
        wsNumWrapper.add_child(wsNum);
        btnWrapperElem.add_child(wsNumWrapper);
        if (!showWsNum) wsNumWrapper.hide();

        let iconsWrapper = new St.BoxLayout({ style_class: "ws-icons-wrapper" });
        this._update_style(iconsWrapper, `background-color: ${this.extSettings.get('wsb-inactive-button-background-color')};`);
        let newMinWidth = (showWsNum) ? this.extSettings.get("wsb-icon-size")/2 : this.extSettings.get("wsb-icon-size");
        this._update_style(iconsWrapper, `min-width: ${newMinWidth}px;`);
        let iconsWrapperLeftBorderRadiusNum = (this.extSettings.get("wsb-show-workspace-number") === true) ? 0 : borderRadiusNum;
        this._update_style(iconsWrapper, `border-radius: ${iconsWrapperLeftBorderRadiusNum}px ${borderRadiusNum}px ${borderRadiusNum}px ${iconsWrapperLeftBorderRadiusNum}px;`);
        let iconsWrapperPaddingNum = this.extSettings.get("wsb-icons-wrapper-horizontal-padding");
        this._update_style(iconsWrapper, `padding: 0 ${iconsWrapperPaddingNum}px 0 ${iconsWrapperPaddingNum}px;`);
        btnWrapperElem.add_child(iconsWrapper);
        
        this.containersArr[monitorIndex].insert_child_at_index(btnWrapperElem, wsIndex);

        this._update_ws_numbers(monitorIndex);

        // event
        btnWrapperElem.connect("button-press-event", (actor, event) => {
            let btnPressed = event.get_button();
    
            if (btnPressed === Clutter.BUTTON_PRIMARY) {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
            }
            else if (btnPressed === Clutter.BUTTON_SECONDARY && !this.extSettings.get("wsb-right-click-ignores-clicked-workspace")) {
                global.workspace_manager.get_workspace_by_index(actor.wsIndex).activate(global.get_current_time());
    
                /*if (this.winIdsContRepr[actor.monitorIndex][actor.wsIndex].length > 1) {
                    this._show_custom_right_click_window_switcher();
                }*/
                this._show_custom_right_click_window_switcher();
            }
            else if (btnPressed === Clutter.BUTTON_MIDDLE && !this.extSettings.get("wsb-middle-click-ignores-clicked-workspace")) {
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

        if (this.extSettings.get("wsb-show-workspace-number") === false && newMonitorIndex === this.mainMonitorIndex && newParent.get_children().length === 1) {
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
        let windowIconWrapperElem = new St.BoxLayout({ style_class: "app-icon-wrapper" });
        this._update_style(windowIconWrapperElem, `margin-right: ${this.extSettings.get("wsb-icon-spacing")}px;`);
        windowIconWrapperElem.windowId = windowObj.get_id();
    
        // Add a small delay to allow time for the app's icon to load properly, especially for XWayland (GTK3) apps
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.extSettings.get("wsb-generate-window-icon-timeout"), () => {
            let appObj = Shell.WindowTracker.get_default().get_window_app(windowObj);
    
            // If the appObj is valid, add the icon texture
            if (appObj) {
                let appIcon = appObj.create_icon_texture(this.extSettings.get('wsb-icon-size'));
                if (this.extSettings.get("wsb-desaturate-icons")) {
                    appIcon.add_effect(new Clutter.DesaturateEffect());
                }
                windowIconWrapperElem.add_child(appIcon);
            } else {
                // Fallback icon if the appObj is not found
                let placeholderIcon = new St.Icon({ icon_name: 'image-missing-symbolic', icon_size: this.extSettings.get('wsb-icon-size') });
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

        // the min-width of buttons is determined based on whether numbers are present or not AND THE ICON SIZE
        // so when icon size changes, we need to update min-wdith as well
        let showNum = this.extSettings.get("wsb-show-workspace-number");

        for (let container of this.containersArr) {
            for (let wsBtnElem of container.get_children()) {
                let iconsWrapper = wsBtnElem.get_children()[1];

                let newMinWidth = (showNum) ? this.extSettings.get("wsb-icon-size")/2 : this.extSettings.get("wsb-icon-size");
                this._update_style(iconsWrapper, `min-width: ${newMinWidth}px;`);

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
            this._update_style(children[0], `background-color: ${this.extSettings.get('wsb-active-workspace-number-background-color')};`);
            this._update_style(children[1], `background-color: ${this.extSettings.get('wsb-active-button-background-color')};`);
        };

        for (let monitorIndex=0; monitorIndex<this.containersArr.length; monitorIndex++) {
            // apply inactive workspace styles to all buttons
            for (let wsBtnElem of this.containersArr[monitorIndex].get_children()) {
                let children = wsBtnElem.get_children();
                this._update_style(children[0], `background-color: ${this.extSettings.get('wsb-inactive-workspace-number-background-color')};`);
                this._update_style(children[1], `background-color: ${this.extSettings.get('wsb-inactive-button-background-color')};`);
            }

            // apply user-defined style to the active workspace (with respect to workspaces only on primary)

            let curWsIndex = global.workspace_manager.get_active_workspace_index();

            if (this.wssOnlyOnPrimary === false) {
                set_active_style(monitorIndex, curWsIndex);
            }
            else {
                if (monitorIndex === this.mainMonitorIndex) {
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
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-button-spacing', () => {
            for (let container of this.containersArr) {
                for (let wsBtnElem of container.get_children()) {
                    this._update_style(wsBtnElem, `margin-right: ${this.extSettings.get("wsb-button-spacing")}px;`);
                }
            }
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-button-padding', () => {
            for (let container of this.containersArr) {
                for (let wsBtnElem of container.get_children()) {
                    this._update_style(wsBtnElem, `padding: ${this.extSettings.get("wsb-button-padding")}px;`);
                }
            }
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-button-roundness', () => {
            // since we have both - the numbers and the icons wrapper, we have to play this somewhat hacky
            // the numbers wrapper is always rounded on the top and bottom left, no matter what
            // the icons wrapper is always rounded on the top and bottom right, but if numbers are disabled, all 4 corners
            let borderRadiusNum = this.extSettings.get("wsb-button-roundness");
    
            for (let container of this.containersArr) {
                for (let wsBtnElem of container.get_children()) {
                    let children = wsBtnElem.get_children();
                    this._update_style(children[0], `border-radius: ${borderRadiusNum}px 0 0 ${borderRadiusNum}px;`);
                    let iconsWrapperLeftBorderRadiusNum = (this.extSettings.get("wsb-show-workspace-number") === true) ? 0 : borderRadiusNum;
                    this._update_style(children[1], `border-radius: ${iconsWrapperLeftBorderRadiusNum}px ${borderRadiusNum}px ${borderRadiusNum}px ${iconsWrapperLeftBorderRadiusNum}px;`);
                }
            }
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-show-workspace-number', () => {
            let showWsNum = this.extSettings.get("wsb-show-workspace-number");
            let borderRadiusNum = this.extSettings.get("wsb-button-roundness");
    
            for (let containerElem of this.containersArr) {
                for (let wsBtnElem of containerElem.get_children()) {
                    let children = wsBtnElem.get_children();
                    if (showWsNum) children[0].show();
                    else children[0].hide();
    
                    let iconsWrapperLeftBorderRadiusNum = (this.extSettings.get("wsb-show-workspace-number") === true) ? 0 : borderRadiusNum;
                    this._update_style(children[1], `border-radius: ${iconsWrapperLeftBorderRadiusNum}px ${borderRadiusNum}px ${borderRadiusNum}px ${iconsWrapperLeftBorderRadiusNum}px;`);
                    let newMinWidth = (showWsNum) ? this.extSettings.get("wsb-icon-size")/2 : this.extSettings.get("wsb-icon-size");
                    this._update_style(children[1], `min-width: ${newMinWidth}px;`);
                }
            }
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-number-font-size', () => {
            for (let container of this.containersArr) {
                for (let wsBtnElem of container.get_children()) {
                    let wsNumElem = wsBtnElem.get_children()[0].get_children()[0];
                    wsNumElem.set_style(`font-size: ${this.extSettings.get("wsb-number-font-size")}px;`);
                }
            }
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-number-horizontal-padding', () => {
            let numWrapperPaddingNum = this.extSettings.get("wsb-number-horizontal-padding");
            for (let container of this.containersArr) {
                for (let wsBtnElem of container.get_children()) {
                    let wsNumWrapper = wsBtnElem.get_children()[0];
                    this._update_style(wsNumWrapper, `padding: 0 ${numWrapperPaddingNum}px 0 ${numWrapperPaddingNum}px;`);
                }
            }
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-icon-size', () => {
            this._regenerate_icons();
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-icon-spacing', () => {
            for (let container of this.containersArr) {
                for (let wsBtnElem of container.get_children()) {
                    for (let windowIconElem of wsBtnElem.get_children()[1].get_children()) {
                        windowIconElem.set_style(`margin-right: ${this.extSettings.get("wsb-icon-spacing")}px;`);
                    }
                }
            }
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-icons-wrapper-horizontal-padding', () => {
            let iconsWrapperPaddingNum = this.extSettings.get("wsb-icons-wrapper-horizontal-padding");
            for (let container of this.containersArr) {
                for (let wsBtnElem of container.get_children()) {
                    let iconsWrapper = wsBtnElem.get_children()[1];
                    this._update_style(iconsWrapper, `padding: 0 ${iconsWrapperPaddingNum}px 0 ${iconsWrapperPaddingNum}px;`);
                }
            }
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-desaturate-icons', () => {
            this._regenerate_icons();
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-active-button-background-color', () => {
            this.update_active_workspace();
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-inactive-button-background-color', () => {
            this.update_active_workspace();
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-active-workspace-number-background-color', () => {
            this.update_active_workspace();
        });
        this.extSettings.add_event_id(id);
    
        id = this.extSettingsRealTimeObj.connect('changed::wsb-inactive-workspace-number-background-color', () => {
            this.update_active_workspace();
        });
        this.extSettings.add_event_id(id);

        id = this.extSettingsRealTimeObj.connect('changed::wsb-generate-window-icon-timeout', () => {
            this._regenerate_icons();
        });
        this.extSettings.add_event_id(id);
    }

    //////////////////////////////////////
    // OTHER

    _update_style(elem, declaration) {
        declaration = declaration.trim();
        let oldStyle = elem.get_style();
        if (oldStyle === null) oldStyle = "";
        let prop = declaration.split(":")[0].trim();
        let regex = new RegExp(`${prop}:[^;]+;`, "g");
        let newStyle = declaration + " " + oldStyle.replace(regex, "").trim();
        elem.set_style(newStyle);
    }

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