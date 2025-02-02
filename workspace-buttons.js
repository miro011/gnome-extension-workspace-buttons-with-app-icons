import St from "gi://St";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";
import Clutter from "gi://Clutter";

export default class WorkspaceButtons {
    //////////////////////////////////////
    // INIT / RESET / DESTROY

    constructor(extSettings, winIdsContRepr) {
        this.extSettings = extSettings;
        this.winIdsContRepr = winIdsContRepr;
        this.containersArr = [];
    }

    _rm_containers() {
        this.containersArr.forEach(container => {
            container.destroy();
        });
    }

    destroy() {
        this._rm_containers();
        this.extSettings = null;
        this.winIdsContRepr = null;
        this.containersArr = null;
    }

    reset() {
        this._rm_containers();
        this.containersArr = [];
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

    toggle_workspace_numbers() {
        let showNum = this.extSettings.get("wsb-show-workspace-number");
        for (let containerElem of this.containersArr) {
            for (let wsBtnElem of containerElem.get_children()) {
                let wsNumWrapper = wsBtnElem.get_children()[0];
                if (showNum) wsNumWrapper.show();
                else wsNumWrapper.hide();
            }
        }
    }

    add_ws_btn(monitorIndex, wsIndex) {
        let btnWrapperElem = new St.BoxLayout({ style_class: "ws-button-wrapper", reactive: true });
        btnWrapperElem.wsIndex = wsIndex;
        btnWrapperElem.monitorIndex = monitorIndex;
        this._update_style(btnWrapperElem, `min-width: ${this.extSettings.get("wsb-icon-size")}px;`);
        this._update_style(btnWrapperElem, `margin-right: ${this.extSettings.get("wsb-button-spacing")}px;`);
        this._update_style(btnWrapperElem, `background-color: ${this.extSettings.get('wsb-inactive-button-background-color')};`);

        let wsNumWrapper = new St.BoxLayout({ style_class: "ws-num-wrapper" });
        this._update_style(wsNumWrapper, `background-color: ${this.extSettings.get('wsb-inactive-workspace-number-background-color')};`);
        let wsNum = new St.Label({ text: `${wsIndex + 1}`, style_class: "ws-num", y_align: Clutter.ActorAlign.CENTER });
        this._update_style(wsNum, `font-size: ${this.extSettings.get("wsb-number-font-size")}px;`);
        wsNumWrapper.add_child(wsNum);
        btnWrapperElem.add_child(wsNumWrapper);
        if (this.extSettings.get("wsb-show-workspace-number") === false) wsNumWrapper.hide();

        let iconsWrapper = new St.BoxLayout({ style_class: "ws-icons-wrapper" });
        btnWrapperElem.add_child(iconsWrapper);
        
        this.containersArr[monitorIndex].insert_child_at_index(btnWrapperElem, wsIndex);

        this._update_numbers(monitorIndex);

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
        this._update_numbers(monitorIndex);
    }

    //////////////////////////////////////
    // WINDOW ICONS

    add_window_icon(loc, windowObj, monitorIndex, wsIndex) {
        let appIconWrapperElem = this._get_new_window_icon(windowObj);
        let iconsWrapper = this.containersArr[monitorIndex].get_children()[wsIndex].get_children()[1];
        if (loc == "l") iconsWrapper.insert_child_at_index(appIconWrapperElem, 0);
        else if (loc == "r") iconsWrapper.add_child(appIconWrapperElem);
    }

    move_window_icon(oldMonitorIndex, oldWsIndex, oldWindowIndex, newMonitorIndex, newWsIndex, newWindowIndex) {
        let oldParent = this.containersArr[oldMonitorIndex].get_children()[oldWsIndex].get_children()[1];
        let elemToMove = oldParent.get_children()[oldWindowIndex];
        oldParent.remove_child(elemToMove);
        let newParent = this.containersArr[newMonitorIndex].get_children()[newWsIndex].get_children()[1];
        newParent.insert_child_at_index(elemToMove, newWindowIndex);
    }

    remove_window_icon(monitorIndex, wsIndex, windowIndex) {
        let iconsWrapper = this.containersArr[monitorIndex].get_children()[wsIndex].get_children()[1];
        let elemToRemove = iconsWrapper.get_children()[windowIndex];
        iconsWrapper.remove_child(elemToRemove);
    }

    _get_new_window_icon(windowObj) {
        let appObj = Shell.WindowTracker.get_default().get_window_app(windowObj);
        let appIconWrapperElem = new St.BoxLayout({ style_class: "app-icon-wrapper" });
        this._update_style(appIconWrapperElem, `margin-right: ${this.extSettings.get("wsb-icon-spacing")}px;`);
        appIconWrapperElem.windowId = windowObj.get_id();
        appIconWrapperElem.add_child(appObj.create_icon_texture(this.extSettings.get('wsb-icon-size')));
        return appIconWrapperElem;
    }

    //////////////////////////////////////
    // EVENT HANDLERS

    update_active_workspace() {
        for (let container of this.containersArr) {
            for (let wsBtnElem of container.get_children()) {
                this._update_style(wsBtnElem, `background-color: ${this.extSettings.get('wsb-inactive-button-background-color')};`);
                this._update_style(wsBtnElem.get_children()[0], `background-color: ${this.extSettings.get('wsb-inactive-workspace-number-background-color')};`);
            }
        
            // Apply user-defined color to the active workspace
            let curWsIndex = global.workspace_manager.get_active_workspace_index();
            let wsBtnElem = container.get_children()[curWsIndex]; // to address the workspaces only on primary
            if (wsBtnElem) {
                this._update_style(wsBtnElem, `background-color: ${this.extSettings.get('wsb-active-button-background-color')};`);
                this._update_style(wsBtnElem.get_children()[0], `background-color: ${this.extSettings.get('wsb-active-workspace-number-background-color')};`);
            }
        }
    }

    update_button_spacing() {
        for (let container of this.containersArr) {
            for (let wsBtnElem of container.get_children()) {
                this._update_style(wsBtnElem, `margin-right: ${this.extSettings.get("wsb-button-spacing")}px;`);
            }
        }
    }

    update_ws_num_number_font_size() {
        for (let container of this.containersArr) {
            for (let wsBtnElem of container.get_children()) {
                let wsNumElem = wsBtnElem.get_children()[0].get_children()[0];
                wsNumElem.set_style(`font-size: ${this.extSettings.get("wsb-number-font-size")}px;`);
            }
        }
    }

    update_app_icon_size(wsIndex, windowsPerMonitorArr) {
        for (let monitorIndex=0; monitorIndex<windowsPerMonitorArr.length; monitorIndex++) {
            let container = this.containersArr[monitorIndex];
            let wsBtnElemsArr = container.get_children();
            if (wsBtnElemsArr[wsIndex]) {
                this._update_style(wsBtnElemsArr[wsIndex], `min-width: ${this.extSettings.get("wsb-icon-size")}px;`);
                let iconsWrapper = wsBtnElemsArr[wsIndex].get_children()[1];
                let iconsWrapperChildren = iconsWrapper.get_children();
                for (let i=0; i<windowsPerMonitorArr[monitorIndex].length; i++) {
                    iconsWrapper.replace_child(iconsWrapperChildren[i], this._get_new_window_icon(windowsPerMonitorArr[monitorIndex][i]));
                }
            }
        }
    }

    update_app_icon_spacing() {
        for (let container of this.containersArr) {
            for (let wsBtnElem of container.get_children()) {
                for (let appIconElem of wsBtnElem.get_children()[1].get_children()) {
                    appIconElem.set_style(`margin-right: ${this.extSettings.get("wsb-icon-spacing")}px;`);
                }
            }
        }
    }

    _update_numbers(monitorIndex) {
        let containerChildrenArr = this.containersArr[monitorIndex].get_children();
        for (let i=0; i<containerChildrenArr.length; i++) {
            containerChildrenArr[i].wsIndex = i;
            containerChildrenArr[i].get_children()[0].get_children()[0].text = `${i + 1}`;
        }
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