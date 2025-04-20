import Meta from "gi://Meta";
import St from "gi://St";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";



export default class WindowButtons {
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

    _add_window_btn(monitorIndex, wsIndex, windowObj) {
        let windowId = windowObj.get_id();
    
        // Buttons Wrapper
        let btnWrapperElem = new St.BoxLayout({ style_class: "window-button-wrapper", reactive: true });
        btnWrapperElem.wsIndex = wsIndex;
        btnWrapperElem.monitorIndex = monitorIndex;
        btnWrapperElem.windowId = windowId;
        this._update_style(btnWrapperElem, `margin-right: ${this.rendererInst.extSettings.get("wnb-button-spacing")}px;`);
        this._update_style(btnWrapperElem, `padding: ${this.rendererInst.extSettings.get("wnb-button-padding")}px;`);
        this._update_style(btnWrapperElem, `background-color: ${this.rendererInst.extSettings.get("wnb-inactive-button-background-color")}px;`);
        this._update_style(btnWrapperElem, `width: ${this.rendererInst.extSettings.get("wnb-button-width")}px;`);
        let borderRadiusNum = this.rendererInst.extSettings.get("wnb-button-roundness");
        this._update_style(btnWrapperElem, `border-radius: ${borderRadiusNum}px ${borderRadiusNum}px ${borderRadiusNum}px ${borderRadiusNum}px;`);
    
        // Icon wrapper
        let iconWrapper = new St.BoxLayout({ style_class: "window-icon-wrapper" });
        iconWrapper.add_child(this._get_new_window_icon(windowObj));
        this._update_style(iconWrapper, `margin-right: ${this.rendererInst.extSettings.get("wnb-icon-margin-right")}px;`);
        btnWrapperElem.add_child(iconWrapper);

        // Window title
        let titleWrapper = new St.BoxLayout({ style_class: "window-title-wrapper" });
        let titleLabel = new St.Label({ text: `${windowObj.get_title()}`, style_class: "window-title-label" });
        //let titleLabel = new St.Label({ text: `${windowObj.get_title()}`, style_class: "window-title-label", y_align: Clutter.ActorAlign.CENTER });
        this._update_style(titleLabel, `font-size: ${this.rendererInst.extSettings.get("wnb-font-size")}px;`);
        titleWrapper.add_child(titleLabel);
        btnWrapperElem.add_child(titleWrapper);
    
        this.containersArr[monitorIndex].insert_child_at_index(btnWrapperElem, wsIndex);
    
        // event
        btnWrapperElem.connect("button-press-event", (actor, event) => {
            let btnPressed = event.get_button();
    
            if (btnPressed === Clutter.BUTTON_PRIMARY || btnPressed === Clutter.BUTTON_SECONDARY) {
                windowObj.get_compositor_private().grab_key_focus(); // this must be run - otherwise the keyboard focus remains on the previous window and things get screwed up
                windowObj.activate(global.get_current_time());
            }
            else if (btnPressed === Clutter.BUTTON_MIDDLE) {
                // close
            }
        });
    
        return btnWrapperElem;
    }


    //////////////////////////////////////
    // EVENT HANDLERS

    _enable_settings_events() {
        let id;
    
        id = this.rendererInst.extSettingsRealTimeObj.connect('changed::wnb-button-spacing', () => {
            for (let container of this.containersArr) {
                for (let wnBtnElem of container.get_children()) {
                    this._update_style(wnBtnElem, `margin-right: ${this.rendererInst.extSettings.get("wnb-button-spacing")}px;`);
                }
            }
        });
        this.rendererInst.extSettings.add_event_id(id);

        id = this.rendererInst.extSettingsRealTimeObj.connect('changed::wnb-button-padding', () => {
            for (let container of this.containersArr) {
                for (let wnBtnElem of container.get_children()) {
                    this._update_style(wnBtnElem, `padding: ${this.rendererInst.extSettings.get("wnb-button-padding")}px;`);
                }
            }
        });
        this.rendererInst.extSettings.add_event_id(id);

        id = this.rendererInst.extSettingsRealTimeObj.connect('changed::wnb-font-size', () => {
            for (let container of this.containersArr) {
                for (let wnBtnElem of container.get_children()) {
                    let textLabelElem = wnBtnElem.get_children()[1].get_children()[0];
                    textLabelElem.set_style(`font-size: ${this.rendererInst.extSettings.get("wnb-font-size")}px;`);
                }
            }
        });
        this.rendererInst.extSettings.add_event_id(id);

        id = this.rendererInst.extSettingsRealTimeObj.connect('changed::wnb-icon-size', () => {
            this._regenerate_icons();
        });
        this.rendererInst.extSettings.add_event_id(id);
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

    _regenerate_icons() {
        let allWindowsObjects = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        let windowsMap = {}; // windowId: windowObj for quick lookups
        allWindowsObjects.forEach(windowObj => {
            windowsMap[windowObj.get_id()] = windowObj;
        });

        for (let container of this.containersArr) {
            for (let wnBtnElem of container.get_children()) {
                let windowId = wnBtnElem.windowId;
                let iconWrapper = wnBtnElem.get_children()[0];
                let iconElem = iconWrapper.get_children()[0];
                iconWrapper.replace_child(iconElem, this._get_new_window_icon(windowsMap[windowId]));
            }
        }
    }

    _get_new_window_icon(windowObj) {
        let windowIconWrapperElem = new St.BoxLayout({ style_class: "app-icon-wrapper" });
    
        // Add a small delay to allow time for the app's icon to load properly, especially for XWayland (GTK3) apps
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.rendererInst.extSettings.get("wsb-generate-window-icon-timeout"), () => {
            let appObj = Shell.WindowTracker.get_default().get_window_app(windowObj);
    
            // If the appObj is valid, add the icon texture
            if (appObj) {
                let appIcon = appObj.create_icon_texture(this.rendererInst.extSettings.get('wnb-icon-size'));
                if (this.rendererInst.extSettings.get("wnb-desaturate-icons")) {
                    appIcon.add_effect(new Clutter.DesaturateEffect());
                }
                windowIconWrapperElem.add_child(appIcon);
            } else {
                // Fallback icon if the appObj is not found
                let placeholderIcon = new St.Icon({ icon_name: 'image-missing-symbolic', icon_size: this.rendererInst.extSettings.get('wnb-icon-size') });
                windowIconWrapperElem.add_child(placeholderIcon);
            }

            this.glibTimeoutIdsSet.delete(timeoutId);
            return GLib.SOURCE_REMOVE;
        });

        this.glibTimeoutIdsSet.add(timeoutId);
    
        return windowIconWrapperElem;
    }
}